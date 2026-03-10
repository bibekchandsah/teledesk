import { supabase } from '../config/supabase';
import { User } from '../../../shared/types';
import { now } from '../utils/helpers';
import logger from '../utils/logger';

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
  nicknames: Record<string, string> | null;
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
  nicknames: r.nicknames ?? {},
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
      nicknames: {},
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
    .or(`name.ilike.${q},email.ilike.${q}`)
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
