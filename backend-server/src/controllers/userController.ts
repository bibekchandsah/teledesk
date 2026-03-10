import { Request, Response } from 'express';
import { upsertUser, getUserById, searchUsers, updatePinnedChats, updateArchivedChats, updateNicknames } from '../services/userService';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from '../config/r2';
import logger from '../utils/logger';

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
    const existing = await getUserById(uid);
    const updateData = existing
      ? { email }
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
    const updates: Partial<import('../../../shared/types').User> = {};
    if (name !== undefined) updates.name = String(name).trim().slice(0, 100);
    if (avatar !== undefined) updates.avatar = String(avatar);
    if (showActiveStatus !== undefined) updates.showActiveStatus = Boolean(showActiveStatus);
    if (showMessageStatus !== undefined) updates.showMessageStatus = Boolean(showMessageStatus);
    const user = await upsertUser(uid, updates);
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
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`updateUsername error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to update username' });
  }
};
