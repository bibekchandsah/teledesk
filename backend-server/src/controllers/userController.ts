import { Request, Response } from 'express';
import { upsertUser, getUserById, searchUsers, updatePinnedChats, updateArchivedChats, updateNicknames, setLockPin, verifyLockPin, toggleLockChat, setAppLockPin, verifyAppLockPin, toggleAppLock, removeAppLockPin } from '../services/userService';
import { getUserChats } from '../services/chatService';
import { SOCKET_EVENTS } from '../../../shared/constants/events';
import { Chat, User as SharedUser } from '../../../shared/types';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from '../config/r2';
import logger from '../utils/logger';
import { Server } from 'socket.io';

let _io: Server | null = null;
export const setIo = (io: Server) => { _io = io; };

/**
 * POST /api/auth/sync
 * Called after Firebase client login to sync user profile to Firestore
 */
export const syncUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, avatar } = req.body;
    const uid = req.user!.uid;

    // For existing users, only sync email (name & avatar may have been customised
    // by the user and must not be overwritten with Firebase Auth values on every refresh).
    // However, if the existing user has a default name ('User' or 'Unknown'), update it.
    // Also, if the user has no avatar, update it from Firebase Auth.
    const existing = await getUserById(uid);
    const updateData = existing && existing.name !== 'User' && existing.name !== 'Unknown'
      ? { email, ...((!existing.avatar || existing.avatar === '') && avatar ? { avatar } : {}) }
      : { name, email, avatar };

    const user = await upsertUser(uid, updateData);
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`syncUser error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to sync user' });
  }
};

/**
 * PATCH /api/users/me
 * Update display name and/or avatar URL
 */
export const updateMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { name, avatar, showActiveStatus, showMessageStatus } = req.body as { name?: string; avatar?: string; showActiveStatus?: boolean; showMessageStatus?: boolean };
    const updates: Partial<SharedUser> = {};
    if (name !== undefined) updates.name = String(name).trim().slice(0, 100);
    if (avatar !== undefined) updates.avatar = String(avatar);
    if (showActiveStatus !== undefined) updates.showActiveStatus = Boolean(showActiveStatus);
    if (showMessageStatus !== undefined) updates.showMessageStatus = Boolean(showMessageStatus);
    
    const user = await upsertUser(uid, updates);

    // Notify peers that our profile (avatar/name) has changed
    if (_io) {
      const chats = await getUserChats(uid);
      const members = new Set<string>();
      chats.forEach((c: Chat) => {
        c.members.forEach((mId: string) => {
          if (mId !== uid) members.add(mId);
        });
      });
      
      members.forEach((mId: string) => {
        _io!.to(`user:${mId}`).emit(SOCKET_EVENTS.USER_UPDATED, user);
      });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`updateMe error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
};

/**
 * POST /api/users/avatar
 * Upload a profile picture to Cloudflare R2; returns the public download URL.
 */
export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file provided' });
      return;
    }
    const uid = req.user!.uid;
    const ext = (req.file.mimetype.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
    const key = `avatars/${uid}.${ext}`;

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        // Cache avatar for 7 days; CloudFlare CDN will serve it
        CacheControl: 'public, max-age=604800',
      }),
    );

    const downloadURL = `${R2_PUBLIC_URL}/${key}`;
    res.json({ success: true, data: { url: downloadURL } });
  } catch (error) {
    logger.error(`uploadAvatar error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to upload avatar' });
  }
};

/**
 * GET /api/users/me
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserById(req.user!.uid);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`getMe error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get user profile' });
  }
};

/**
 * GET /api/users/:uid
 */
export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserById(req.params.uid);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`getUserProfile error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
};

/**
 * GET /api/users/search?q=query
 */
export const searchUsersHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query || query.length < 2) {
      res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
      return;
    }
    const users = await searchUsers(query, req.user!.uid);
    res.json({ success: true, data: users });
  } catch (error) {
    logger.error(`searchUsers error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};

// PATCH /api/users/me/pinned-chats
export const updatePinnedChatsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { pinnedChatIds } = req.body as { pinnedChatIds: string[] };
    if (!Array.isArray(pinnedChatIds)) {
      res.status(400).json({ success: false, error: 'pinnedChatIds must be an array' });
      return;
    }
    const result = await updatePinnedChats(uid, pinnedChatIds);
    res.json({ success: true, data: { pinnedChatIds: result } });
  } catch (error) {
    logger.error(`updatePinnedChats error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to update pinned chats' });
  }
};

// PATCH /api/users/me/archived-chats
export const updateArchivedChatsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { archivedChatIds } = req.body as { archivedChatIds: string[] };
    if (!Array.isArray(archivedChatIds)) {
      res.status(400).json({ success: false, error: 'archivedChatIds must be an array' });
      return;
    }
    const result = await updateArchivedChats(uid, archivedChatIds);
    res.json({ success: true, data: { archivedChatIds: result } });
  } catch (error) {
    logger.error(`updateArchivedChats error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to update archived chats' });
  }
};

// PATCH /api/users/me/nicknames
export const updateNicknamesHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { nicknames } = req.body as { nicknames: Record<string, string> };
    if (!nicknames || typeof nicknames !== 'object' || Array.isArray(nicknames)) {
      res.status(400).json({ success: false, error: 'nicknames must be an object' });
      return;
    }
    const result = await updateNicknames(uid, nicknames);
    res.json({ success: true, data: { nicknames: result } });
  } catch (error) {
    logger.error(`updateNicknames error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to update nicknames' });
  }
};

/**
 * GET /api/users/check-username/:username
 * Check if a username is available
 */
export const checkUsername = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username } = req.params;
    
    if (!username || typeof username !== 'string') {
      res.status(400).json({ success: false, error: 'Username is required' });
      return;
    }

    const { checkUsernameAvailability } = await import('../services/userService');
    const result = await checkUsernameAvailability(username);

    if (!result.available) {
      let message = 'Username is not available';
      if (result.reason === 'invalid_format') {
        message = 'Username must be 3-20 characters, start with a letter, and contain only letters, numbers, and underscores';
      } else if (result.reason === 'reserved') {
        message = 'This username is reserved and cannot be used';
      } else if (result.reason === 'taken') {
        message = 'This username is already taken';
      }
      
      res.json({ 
        success: true, 
        data: { 
          available: false, 
          reason: result.reason,
          message 
        } 
      });
      return;
    }

    res.json({ 
      success: true, 
      data: { 
        available: true,
        message: 'Username is available' 
      } 
    });
  } catch (error) {
    logger.error(`checkUsername error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to check username' });
  }
};

/**
 * PATCH /api/users/me/username
 * Set or update username
 */
export const updateUsername = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { username } = req.body as { username: string };

    if (!username || typeof username !== 'string') {
      res.status(400).json({ success: false, error: 'Username is required' });
      return;
    }

    const { checkUsernameAvailability, upsertUser } = await import('../services/userService');
    
    // Check availability
    const check = await checkUsernameAvailability(username);
    if (!check.available) {
      let message = 'Username is not available';
      if (check.reason === 'invalid_format') {
        message = 'Username must be 3-20 characters, start with a letter, and contain only letters, numbers, and underscores';
      } else if (check.reason === 'reserved') {
        message = 'This username is reserved and cannot be used';
      } else if (check.reason === 'taken') {
        message = 'This username is already taken';
      }
      
      res.status(400).json({ success: false, error: message });
      return;
    }

    // Update username (stored as lowercase for consistency)
    const user = await upsertUser(uid, { username: username.toLowerCase() });

    // Notify peers
    if (_io) {
      const chats = await getUserChats(uid);
      const members = new Set<string>();
      chats.forEach((c: Chat) => {
        c.members.forEach((mId: string) => {
          if (mId !== uid) members.add(mId);
        });
      });
      
      members.forEach((mId: string) => {
        _io!.to(`user:${mId}`).emit(SOCKET_EVENTS.USER_UPDATED, user);
      });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`updateUsername error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to update username' });
  }
};

/**
 * POST /api/users/me/set-pin
 */
export const setPin = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { pin } = req.body as { pin: string };
    if (!pin || pin.length !== 6) {
      res.status(400).json({ success: false, error: 'PIN must be 6 digits' });
      return;
    }
    await setLockPin(uid, pin);
    res.json({ success: true, message: 'PIN set successfully' });
  } catch (error) {
    logger.error(`setPin error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to set PIN' });
  }
};

/**
 * POST /api/users/me/verify-pin
 */
export const verifyPin = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { pin } = req.body as { pin: string };
    const isValid = await verifyLockPin(uid, pin);
    res.json({ success: true, data: { isValid } });
  } catch (error) {
    logger.error(`verifyPin error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to verify PIN' });
  }
};

/**
 * PATCH /api/users/me/toggle-lock
 */
export const toggleLock = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { chatId, lock } = req.body as { chatId: string; lock: boolean };
    if (!chatId) {
      res.status(400).json({ success: false, error: 'chatId is required' });
      return;
    }
    const result = await toggleLockChat(uid, chatId, lock);
    res.json({ success: true, data: { lockedChatIds: result } });
  } catch (error) {
    logger.error(`toggleLock error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to toggle chat lock' });
  }
};

/**
 * DELETE /api/users/me
 * Delete user account and all associated data
 */
export const deleteAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { deleteUserAccount } = await import('../services/userService');
    
    // 1. Delete from database (marks as deleted, removes from chats, etc.)
    await deleteUserAccount(uid);
    
    // 2. Delete from Firebase Auth using Admin SDK
    // Admin SDK bypasses the client-side "requires-recent-login" restriction entirely.
    // Identity is already verified by the bearer token on this request.
    try {
      const { auth } = await import('../config/firebase');
      await auth.deleteUser(uid);
      logger.info(`Firebase Auth user deleted: ${uid}`);
    } catch (firebaseError: any) {
      // Log but don't fail — the DB record is already marked deleted
      // (e.g., user may have already been deleted from Firebase Auth)
      logger.warn(`Firebase Auth deletion warning for ${uid}: ${firebaseError.message}`);
    }
    
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    logger.error(`deleteAccount error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
};


// ─── App Lock PIN Management ───────────────────────────────────────────────

/**
 * POST /api/users/me/set-app-lock-pin
 * Set or update app lock PIN
 */
export const setAppLockPinHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { pin } = req.body as { pin: string };
    if (!pin || pin.length !== 6) {
      res.status(400).json({ success: false, error: 'PIN must be 6 digits' });
      return;
    }
    await setAppLockPin(uid, pin);
    res.json({ success: true, message: 'App lock PIN set successfully' });
  } catch (error) {
    logger.error(`setAppLockPin error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to set app lock PIN' });
  }
};

/**
 * POST /api/users/me/verify-app-lock-pin
 * Verify app lock PIN
 */
export const verifyAppLockPinHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { pin } = req.body as { pin: string };
    const isValid = await verifyAppLockPin(uid, pin);
    res.json({ success: true, data: { isValid } });
  } catch (error) {
    logger.error(`verifyAppLockPin error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to verify app lock PIN' });
  }
};

/**
 * POST /api/users/me/toggle-app-lock
 * Enable or disable app lock
 */
export const toggleAppLockHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { enabled } = req.body as { enabled: boolean };
    await toggleAppLock(uid, enabled);
    res.json({ success: true, data: { appLockEnabled: enabled } });
  } catch (error) {
    logger.error(`toggleAppLock error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to toggle app lock' });
  }
};

/**
 * DELETE /api/users/me/app-lock-pin
 * Remove app lock PIN and disable app lock
 */
export const removeAppLockPinHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    await removeAppLockPin(uid);
    res.json({ success: true, message: 'App lock removed successfully' });
  } catch (error) {
    logger.error(`removeAppLockPin error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to remove app lock' });
  }
};


// ─── Chat Theme Handlers ──────────────────────────────────────────────────────

/**
 * PUT /api/users/me/chat-theme/:chatId
 * Set or update chat theme for a specific chat
 */
export const setChatThemeHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { chatId } = req.params;
    const theme = req.body;

    const { setChatTheme } = await import('../services/userService');
    await setChatTheme(uid, chatId, theme);

    // Emit socket event to sync across user's devices
    if (_io) {
      _io.to(`user:${uid}`).emit('CHAT_THEME_UPDATED', { chatId, theme });
      
      // Get chat to find peer
      const { getChatById } = await import('../services/chatService');
      const chat = await getChatById(chatId, uid);
      if (chat) {
        const peerUid = chat.members.find((m: string) => m !== uid);
        if (peerUid) {
          // If showToOthers is enabled, notify the peer to show the theme
          if (theme.showToOthers) {
            _io.to(`user:${peerUid}`).emit('PEER_CHAT_THEME_UPDATED', { chatId, peerId: uid, theme });
          } else {
            // If showToOthers is disabled, notify the peer to hide the theme
            _io.to(`user:${peerUid}`).emit('PEER_CHAT_THEME_REMOVED', { chatId, peerId: uid });
          }
        }
      }
    }

    res.json({ success: true, message: 'Chat theme updated' });
  } catch (error) {
    logger.error(`setChatTheme error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to update chat theme' });
  }
};

/**
 * GET /api/users/me/chat-theme/:chatId
 * Get chat theme for a specific chat
 */
export const getChatThemeHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { chatId } = req.params;

    const { getChatTheme } = await import('../services/userService');
    const theme = await getChatTheme(uid, chatId);

    res.json({ success: true, data: theme });
  } catch (error) {
    logger.error(`getChatTheme error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get chat theme' });
  }
};

/**
 * DELETE /api/users/me/chat-theme/:chatId
 * Remove chat theme for a specific chat
 */
export const removeChatThemeHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { chatId } = req.params;

    const { removeChatTheme } = await import('../services/userService');
    await removeChatTheme(uid, chatId);

    // Emit socket event to sync across user's devices
    if (_io) {
      _io.to(`user:${uid}`).emit('CHAT_THEME_REMOVED', { chatId });
      
      // Notify peer that theme was removed
      const { getChatById } = await import('../services/chatService');
      const chat = await getChatById(chatId, uid);
      if (chat) {
        const peerUid = chat.members.find((m: string) => m !== uid);
        if (peerUid) {
          _io.to(`user:${peerUid}`).emit('PEER_CHAT_THEME_REMOVED', { chatId, peerId: uid });
        }
      }
    }

    res.json({ success: true, message: 'Chat theme removed' });
  } catch (error) {
    logger.error(`removeChatTheme error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to remove chat theme' });
  }
};

/**
 * GET /api/users/me/chat-themes
 * Get all chat themes for the current user
 */
export const getAllChatThemesHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;

    const { getAllChatThemes } = await import('../services/userService');
    const themes = await getAllChatThemes(uid);

    res.json({ success: true, data: themes });
  } catch (error) {
    logger.error(`getAllChatThemes error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get chat themes' });
  }
};


// ─── Two-Factor Authentication Handlers ──────────────────────────────────────

/**
 * POST /api/users/me/2fa/setup
 * Generate 2FA secret and QR code for initial setup
 */
export const setup2FAHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { generate2FASecret } = await import('../services/userService');
    
    const result = await generate2FASecret(uid);
    
    res.json({
      success: true,
      data: {
        qrCode: result.qrCode,
        backupCodes: result.backupCodes,
      },
    });
  } catch (error) {
    logger.error(`setup2FA error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to setup 2FA' });
  }
};

/**
 * POST /api/users/me/2fa/verify
 * Verify TOTP code and enable 2FA
 */
export const verify2FAHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { token } = req.body as { token: string };
    
    if (!token || token.length !== 6) {
      res.status(400).json({ success: false, error: 'Invalid token format' });
      return;
    }
    
    const { verify2FACode } = await import('../services/userService');
    const verified = await verify2FACode(uid, token);
    
    if (!verified) {
      res.status(400).json({ success: false, error: 'Invalid verification code' });
      return;
    }
    
    res.json({ success: true, message: '2FA enabled successfully' });
  } catch (error) {
    logger.error(`verify2FA error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to verify 2FA' });
  }
};

/**
 * POST /api/users/me/2fa/verify-login
 * Verify TOTP code during login
 */
export const verify2FALoginHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { token } = req.body as { token: string };
    
    if (!token || token.length !== 6) {
      res.status(400).json({ success: false, error: 'Invalid token format' });
      return;
    }
    
    const { verify2FALogin } = await import('../services/userService');
    const verified = await verify2FALogin(uid, token);
    
    if (!verified) {
      res.status(400).json({ success: false, error: 'Invalid verification code' });
      return;
    }
    
    res.json({ success: true, data: { verified: true } });
  } catch (error) {
    logger.error(`verify2FALogin error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to verify login code' });
  }
};

/**
 * POST /api/users/me/2fa/verify-backup
 * Verify backup code during login
 */
export const verify2FABackupHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { code } = req.body as { code: string };
    
    if (!code) {
      res.status(400).json({ success: false, error: 'Backup code is required' });
      return;
    }
    
    const { verify2FABackupCode } = await import('../services/userService');
    const verified = await verify2FABackupCode(uid, code.toUpperCase());
    
    if (!verified) {
      res.status(400).json({ success: false, error: 'Invalid backup code' });
      return;
    }
    
    res.json({ success: true, data: { verified: true } });
  } catch (error) {
    logger.error(`verify2FABackup error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to verify backup code' });
  }
};

/**
 * POST /api/users/me/2fa/disable
 * Disable 2FA (requires valid TOTP code)
 */
export const disable2FAHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { token } = req.body as { token: string };
    
    if (!token || token.length !== 6) {
      res.status(400).json({ success: false, error: 'Invalid token format' });
      return;
    }
    
    const { disable2FA } = await import('../services/userService');
    const disabled = await disable2FA(uid, token);
    
    if (!disabled) {
      res.status(400).json({ success: false, error: 'Invalid verification code' });
      return;
    }
    
    res.json({ success: true, message: '2FA disabled successfully' });
  } catch (error) {
    logger.error(`disable2FA error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to disable 2FA' });
  }
};

/**
 * POST /api/users/me/2fa/regenerate
 * Regenerate QR code (requires valid TOTP code)
 */
export const regenerate2FAHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { token } = req.body as { token: string };
    
    if (!token || token.length !== 6) {
      res.status(400).json({ success: false, error: 'Invalid token format' });
      return;
    }
    
    const { regenerate2FASecret } = await import('../services/userService');
    const result = await regenerate2FASecret(uid, token);
    
    if (!result) {
      res.status(400).json({ success: false, error: 'Invalid verification code' });
      return;
    }
    
    res.json({
      success: true,
      data: {
        qrCode: result.qrCode,
        backupCodes: result.backupCodes,
      },
    });
  } catch (error) {
    logger.error(`regenerate2FA error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to regenerate 2FA' });
  }
};

/**
 * GET /api/users/me/2fa/status
 * Check if 2FA is enabled for the current user
 */
export const get2FAStatusHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { is2FAEnabled } = await import('../services/userService');
    
    const enabled = await is2FAEnabled(uid);
    
    res.json({ success: true, data: { enabled } });
  } catch (error) {
    logger.error(`get2FAStatus error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get 2FA status' });
  }
};
