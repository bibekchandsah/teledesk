import { supabase } from '../config/supabase';
import { User } from '../../../shared/types';
import { now } from '../utils/helpers';
import logger from '../utils/logger';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

type UserRow = {
  uid: string;
  name: string;
  username: string | null;
  email: string;
  avatar: string;
  created_at: string;
  last_seen: string;
  online_status: string;
  show_active_status: boolean;
  show_message_status: boolean;
  pinned_chat_ids: string[];
  archived_chat_ids: string[];
  locked_chat_ids: string[];
  chat_lock_pin: string | null;
  chat_lock_reset_code: string | null;
  app_lock_enabled: boolean | null;
  app_lock_pin: string | null;
  nicknames: Record<string, string> | null;
  chat_themes: Record<string, any> | null;
  two_factor_enabled: boolean | null;
  two_factor_secret: string | null;
  two_factor_backup_codes: string[] | null;
};

const rowToUser = (r: UserRow): User => ({
  uid: r.uid,
  name: r.name,
  username: r.username && r.username.trim() !== '' ? r.username : undefined,
  email: r.email,
  avatar: r.avatar,
  createdAt: r.created_at,
  lastSeen: r.last_seen,
  onlineStatus: r.online_status as User['onlineStatus'],
  showActiveStatus: r.show_active_status,
  showMessageStatus: r.show_message_status,
  pinnedChatIds: r.pinned_chat_ids ?? [],
  archivedChatIds: r.archived_chat_ids ?? [],
  lockedChatIds: r.locked_chat_ids ?? [],
  chatLockPin: r.chat_lock_pin ?? undefined,
  chatLockResetCode: r.chat_lock_reset_code ?? undefined,
  appLockEnabled: r.app_lock_enabled ?? false,
  appLockPin: r.app_lock_pin ?? undefined,
  nicknames: r.nicknames ?? {},
  chatThemes: r.chat_themes ?? {},
  twoFactorEnabled: r.two_factor_enabled ?? false,
  // Note: two_factor_secret is intentionally not included in regular user profile for security
});

export const upsertUser = async (uid: string, data: Partial<User>): Promise<User> => {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('uid', uid)
    .single();

  if (!existing) {
    const newUser: UserRow = {
      uid,
      name: data.name || 'Unknown',
      username: data.username ?? null,
      email: data.email || '',
      avatar: data.avatar || '',
      created_at: now(),
      last_seen: now(),
      online_status: 'online',
      show_active_status: true,
      show_message_status: true,
      pinned_chat_ids: [],
      archived_chat_ids: [],
      locked_chat_ids: [],
      chat_lock_pin: null,
      chat_lock_reset_code: null,
      app_lock_enabled: null,
      app_lock_pin: null,
      nicknames: {},
      chat_themes: null,
      two_factor_enabled: null,
      two_factor_secret: null,
      two_factor_backup_codes: null,
    };
    await supabase.from('users').insert(newUser);
    logger.info(`New user created: ${uid}`);
    return rowToUser(newUser);
  }

  const updates: Partial<UserRow> = { last_seen: now(), online_status: 'online' };
  if (data.name !== undefined) updates.name = data.name;
  if (data.username !== undefined) updates.username = data.username;
  if (data.email !== undefined) updates.email = data.email;
  if (data.avatar !== undefined) updates.avatar = data.avatar;
  if (data.showActiveStatus !== undefined) updates.show_active_status = data.showActiveStatus;
  if (data.showMessageStatus !== undefined) updates.show_message_status = data.showMessageStatus;

  const { data: updated } = await supabase
    .from('users')
    .update(updates)
    .eq('uid', uid)
    .select('*')
    .single();

  return rowToUser(updated as UserRow);
};

export const getUserById = async (uid: string): Promise<User | null> => {
  const { data } = await supabase.from('users').select('*').eq('uid', uid).single();
  if (!data) return null;
  return rowToUser(data as UserRow);
};

export const searchUsers = async (query: string, _requestingUid: string): Promise<User[]> => {
  const q = `%${query.toLowerCase()}%`;
  const { data } = await supabase
    .from('users')
    .select('*')
    .or(`name.ilike.${q},email.ilike.${q},username.ilike.${q}`)
    .limit(20);

  return ((data ?? []) as UserRow[]).map(rowToUser);
};

export const updateActiveStatusSetting = async (
  uid: string,
  showActiveStatus: boolean,
): Promise<void> => {
  await supabase.from('users').update({ show_active_status: showActiveStatus }).eq('uid', uid);
};

export const updatePinnedChats = async (uid: string, pinnedChatIds: string[]): Promise<string[]> => {
  await supabase.from('users').update({ pinned_chat_ids: pinnedChatIds }).eq('uid', uid);
  return pinnedChatIds;
};

export const updateArchivedChats = async (uid: string, archivedChatIds: string[]): Promise<string[]> => {
  await supabase.from('users').update({ archived_chat_ids: archivedChatIds }).eq('uid', uid);
  return archivedChatIds;
};

export const updateNicknames = async (uid: string, nicknames: Record<string, string>): Promise<Record<string, string>> => {
  await supabase.from('users').update({ nicknames }).eq('uid', uid);
  return nicknames;
};

export const updatePresence = async (uid: string, status: 'online' | 'offline'): Promise<void> => {
  await supabase
    .from('users')
    .update({ online_status: status, last_seen: now() })
    .eq('uid', uid);
};

// ─── Username validation ───────────────────────────────────────────────────
import { isValidUsernameFormat, isReservedUsername } from '../../../shared/constants/reservedUsernames';

export const checkUsernameAvailability = async (username: string): Promise<{
  available: boolean;
  reason?: 'invalid_format' | 'reserved' | 'taken';
}> => {
  // Validate format
  if (!isValidUsernameFormat(username)) {
    return { available: false, reason: 'invalid_format' };
  }

  // Check if reserved
  if (isReservedUsername(username)) {
    return { available: false, reason: 'reserved' };
  }

  // Check if already taken
  const { data } = await supabase
    .from('users')
    .select('uid')
    .eq('username', username.toLowerCase())
    .single();

  if (data) {
    return { available: false, reason: 'taken' };
  }

  return { available: true };
};

export const getUserByUsername = async (username: string): Promise<User | null> => {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('username', username.toLowerCase())
    .single();
  
  if (!data) return null;
  return rowToUser(data as UserRow);
};

// ─── PIN Management & Chat Locking ─────────────────────────────────────────

export const setLockPin = async (uid: string, pin: string): Promise<void> => {
  const hashedPin = await bcrypt.hash(pin, 10);
  await supabase.from('users').update({ chat_lock_pin: hashedPin }).eq('uid', uid);
};

export const verifyLockPin = async (uid: string, pin: string): Promise<boolean> => {
  const { data } = await supabase.from('users').select('chat_lock_pin').eq('uid', uid).single();
  if (!data || !data.chat_lock_pin) return false;
  return await bcrypt.compare(pin, data.chat_lock_pin);
};

export const toggleLockChat = async (uid: string, chatId: string, lock: boolean): Promise<string[]> => {
  const user = await getUserById(uid);
  if (!user) throw new Error('User not found');

  let lockedChatIds = user.lockedChatIds || [];
  if (lock) {
    if (!lockedChatIds.includes(chatId)) {
      lockedChatIds = [...lockedChatIds, chatId];
    }
  } else {
    lockedChatIds = lockedChatIds.filter(id => id !== chatId);
  }

  await supabase.from('users').update({ locked_chat_ids: lockedChatIds }).eq('uid', uid);
  return lockedChatIds;
};

// ─── Delete User Account ───────────────────────────────────────────────────
export const deleteUserAccount = async (uid: string): Promise<void> => {
  logger.info(`Deleting user account: ${uid}`);
  
  // Instead of deleting the user record, mark them as deleted
  // This preserves chat history while showing "Deleted User"
  await supabase.from('users').update({
    name: 'Deleted User',
    username: null,
    email: `deleted_${uid}@deleted.local`,
    avatar: '',
    show_active_status: false,
    show_message_status: false,
    online_status: 'offline',
  }).eq('uid', uid);
  
  // Delete user's device sessions
  await supabase.from('device_sessions').delete().eq('user_id', uid);
  
  // Remove user from all chats (we don't delete chats, just remove the user from members)
  const { data: userChats } = await supabase
    .from('chats')
    .select('chat_id, members')
    .contains('members', [uid]);
  
  if (userChats && userChats.length > 0) {
    for (const chat of userChats) {
      const updatedMembers = chat.members.filter((m: string) => m !== uid);
      
      // If chat has no members left, delete it
      if (updatedMembers.length === 0) {
        await supabase.from('chats').delete().eq('chat_id', chat.chat_id);
      } else {
        await supabase.from('chats').update({ members: updatedMembers }).eq('chat_id', chat.chat_id);
      }
    }
  }
  
  logger.info(`User account marked as deleted: ${uid}`);
};


// ─── App Lock PIN Management ───────────────────────────────────────────────

export const setAppLockPin = async (uid: string, pin: string): Promise<void> => {
  const hashedPin = await bcrypt.hash(pin, 10);
  await supabase.from('users').update({ app_lock_pin: hashedPin, app_lock_enabled: true }).eq('uid', uid);
};

export const verifyAppLockPin = async (uid: string, pin: string): Promise<boolean> => {
  const { data } = await supabase.from('users').select('app_lock_pin').eq('uid', uid).single();
  if (!data || !data.app_lock_pin) return false;
  return await bcrypt.compare(pin, data.app_lock_pin);
};

export const toggleAppLock = async (uid: string, enabled: boolean): Promise<void> => {
  await supabase.from('users').update({ app_lock_enabled: enabled }).eq('uid', uid);
};

export const removeAppLockPin = async (uid: string): Promise<void> => {
  await supabase.from('users').update({ app_lock_pin: null, app_lock_enabled: false }).eq('uid', uid);
};


// ─── Chat Theme Functions ────────────────────────────────────────────────────

export const setChatTheme = async (uid: string, chatId: string, theme: any): Promise<void> => {
  const { data: user } = await supabase.from('users').select('chat_themes').eq('uid', uid).single();
  const themes = user?.chat_themes || {};
  themes[chatId] = theme;
  await supabase.from('users').update({ chat_themes: themes }).eq('uid', uid);
};

export const getChatTheme = async (uid: string, chatId: string): Promise<any | null> => {
  const { data: user } = await supabase.from('users').select('chat_themes').eq('uid', uid).single();
  return user?.chat_themes?.[chatId] || null;
};

export const removeChatTheme = async (uid: string, chatId: string): Promise<void> => {
  const { data: user } = await supabase.from('users').select('chat_themes').eq('uid', uid).single();
  const themes = user?.chat_themes || {};
  delete themes[chatId];
  await supabase.from('users').update({ chat_themes: themes }).eq('uid', uid);
};

export const getAllChatThemes = async (uid: string): Promise<Record<string, any>> => {
  const { data: user } = await supabase.from('users').select('chat_themes').eq('uid', uid).single();
  return user?.chat_themes || {};
};

// ─── Two-Factor Authentication ──────────────────────────────────────────────

/**
 * Generate a new 2FA secret and QR code for setup
 */
export const generate2FASecret = async (uid: string): Promise<{ secret: string; qrCode: string; backupCodes: string[] }> => {
  const user = await getUserById(uid);
  if (!user) throw new Error('User not found');

  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `TeleDesk (${user.email})`,
    issuer: 'TeleDesk',
    length: 32,
  });

  // Generate QR code
  const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

  // Generate 10 backup codes
  const backupCodes: string[] = [];
  const hashedBackupCodes: string[] = [];
  
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8-character code
    backupCodes.push(code);
    hashedBackupCodes.push(await bcrypt.hash(code, 10));
  }

  // Store secret and backup codes (not enabled yet)
  await supabase
    .from('users')
    .update({
      two_factor_secret: secret.base32,
      two_factor_backup_codes: hashedBackupCodes,
      two_factor_enabled: false, // Not enabled until verified
    })
    .eq('uid', uid);

  return {
    secret: secret.base32,
    qrCode,
    backupCodes,
  };
};

/**
 * Verify TOTP code and enable 2FA
 */
export const verify2FACode = async (uid: string, token: string): Promise<boolean> => {
  const { data: user } = await supabase
    .from('users')
    .select('two_factor_secret')
    .eq('uid', uid)
    .single();

  if (!user?.two_factor_secret) {
    throw new Error('2FA not set up');
  }

  const verified = speakeasy.totp.verify({
    secret: user.two_factor_secret,
    encoding: 'base32',
    token,
    window: 2, // Allow 2 time steps before/after for clock skew
  });

  if (verified) {
    // Enable 2FA
    await supabase
      .from('users')
      .update({ two_factor_enabled: true })
      .eq('uid', uid);
  }

  return verified;
};

/**
 * Verify TOTP code during login (doesn't enable/disable, just verifies)
 */
export const verify2FALogin = async (uid: string, token: string): Promise<boolean> => {
  const { data: user } = await supabase
    .from('users')
    .select('two_factor_secret, two_factor_enabled')
    .eq('uid', uid)
    .single();

  if (!user?.two_factor_enabled || !user?.two_factor_secret) {
    return false;
  }

  return speakeasy.totp.verify({
    secret: user.two_factor_secret,
    encoding: 'base32',
    token,
    window: 2,
  });
};

/**
 * Verify backup code and mark it as used
 */
export const verify2FABackupCode = async (uid: string, code: string): Promise<boolean> => {
  const { data: user } = await supabase
    .from('users')
    .select('two_factor_backup_codes')
    .eq('uid', uid)
    .single();

  if (!user?.two_factor_backup_codes || user.two_factor_backup_codes.length === 0) {
    return false;
  }

  // Check each hashed backup code
  for (let i = 0; i < user.two_factor_backup_codes.length; i++) {
    const isMatch = await bcrypt.compare(code, user.two_factor_backup_codes[i]);
    if (isMatch) {
      // Remove the used backup code
      const updatedCodes = [...user.two_factor_backup_codes];
      updatedCodes.splice(i, 1);
      
      await supabase
        .from('users')
        .update({ two_factor_backup_codes: updatedCodes })
        .eq('uid', uid);
      
      return true;
    }
  }

  return false;
};

/**
 * Disable 2FA (requires valid TOTP code)
 */
export const disable2FA = async (uid: string, token: string): Promise<boolean> => {
  const verified = await verify2FALogin(uid, token);
  
  if (!verified) {
    return false;
  }

  await supabase
    .from('users')
    .update({
      two_factor_enabled: false,
      two_factor_secret: null,
      two_factor_backup_codes: null,
    })
    .eq('uid', uid);

  return true;
};

/**
 * Regenerate QR code (requires valid TOTP code from current secret)
 */
export const regenerate2FASecret = async (uid: string, currentToken: string): Promise<{ qrCode: string; backupCodes: string[] } | null> => {
  // Verify current token first
  const verified = await verify2FALogin(uid, currentToken);
  
  if (!verified) {
    return null;
  }

  // Generate new secret and QR code
  const result = await generate2FASecret(uid);
  
  // Keep 2FA enabled status
  await supabase
    .from('users')
    .update({ two_factor_enabled: true })
    .eq('uid', uid);

  return {
    qrCode: result.qrCode,
    backupCodes: result.backupCodes,
  };
};

/**
 * Check if user has 2FA enabled
 */
export const is2FAEnabled = async (uid: string): Promise<boolean> => {
  const { data: user } = await supabase
    .from('users')
    .select('two_factor_enabled')
    .eq('uid', uid)
    .single();

  return user?.two_factor_enabled ?? false;
};
