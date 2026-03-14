import { getIdToken } from './firebaseService';
import { ApiResponse } from '@shared/types';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ─── Authenticated Fetch Helper ────────────────────────────────────────────
const authFetch = async <T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> => {
  const token = await getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();
  return data as ApiResponse<T>;
};

// ─── Auth / User API ───────────────────────────────────────────────────────
import { User, Chat, Group, Message, SavedMessage } from '@shared/types';

export const syncUserProfile = (name: string, email: string, avatar: string) =>
  authFetch<User>('/api/users/sync', {
    method: 'POST',
    body: JSON.stringify({ name, email, avatar }),
  });

export const getMyProfile = () => authFetch<User>('/api/users/me');

export const updateMyProfile = (updates: { name?: string; avatar?: string; showActiveStatus?: boolean; showMessageStatus?: boolean; username?: string }) =>
  authFetch<User>('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

export const updateMyPinnedChats = (pinnedChatIds: string[]) =>
  authFetch<{ pinnedChatIds: string[] }>('/api/users/me/pinned-chats', {
    method: 'PATCH',
    body: JSON.stringify({ pinnedChatIds }),
  });

export const updateMyArchivedChats = (archivedChatIds: string[]) =>
  authFetch<{ archivedChatIds: string[] }>('/api/users/me/archived-chats', {
    method: 'PATCH',
    body: JSON.stringify({ archivedChatIds }),
  });

export const updateMyNicknames = (nicknames: Record<string, string>) =>
  authFetch<{ nicknames: Record<string, string> }>('/api/users/me/nicknames', {
    method: 'PATCH',
    body: JSON.stringify({ nicknames }),
  });

export const setLockPin = (pin: string) =>
  authFetch<{ success: boolean }>('/api/users/me/set-pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });

export const verifyLockPin = (pin: string) =>
  authFetch<{ isValid: boolean }>('/api/users/me/verify-pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });

export const toggleLockChat = (chatId: string, lock: boolean) =>
  authFetch<{ lockedChatIds: string[] }>('/api/users/me/toggle-lock', {
    method: 'PATCH',
    body: JSON.stringify({ chatId, lock }),
  });

export const setAppLockPin = (pin: string) =>
  authFetch<{ success: boolean }>('/api/users/me/set-app-lock-pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });

export const verifyAppLockPin = (pin: string) =>
  authFetch<{ isValid: boolean }>('/api/users/me/verify-app-lock-pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });

export const toggleAppLock = (enabled: boolean) =>
  authFetch<{ appLockEnabled: boolean }>('/api/users/me/toggle-app-lock', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });

export const removeAppLockPin = () =>
  authFetch<{ success: boolean }>('/api/users/me/app-lock-pin', {
    method: 'DELETE',
  });

export const deleteMyAccount = () =>
  authFetch<{ message: string }>('/api/users/me', {
    method: 'DELETE',
  });

// ─── Draft API ─────────────────────────────────────────────────────────────

export interface Draft {
  userId: string;
  chatId: string;
  content: string;
  updatedAt: string;
}

export const saveDraft = (chatId: string, content: string) =>
  authFetch<Draft>(`/api/drafts/${chatId}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });

export const getDraft = (chatId: string) =>
  authFetch<Draft | null>(`/api/drafts/${chatId}`);

export const getAllDrafts = () =>
  authFetch<Draft[]>('/api/drafts');

export const deleteDraft = (chatId: string) =>
  authFetch(`/api/drafts/${chatId}`, {
    method: 'DELETE',
  });

export const uploadAvatar = async (file: File): Promise<ApiResponse<{ url: string }>> => {
  const token = await getIdToken();
  const formData = new FormData();
  formData.append('avatar', file);
  const response = await fetch(`${BASE_URL}/api/users/avatar`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  return response.json() as Promise<ApiResponse<{ url: string }>>;
};

export const getUserById = (uid: string) => authFetch<User>(`/api/users/${uid}`);

export const searchUsers = (query: string) =>
  authFetch<User[]>(`/api/users/search?q=${encodeURIComponent(query)}`);

// ─── Chat API ──────────────────────────────────────────────────────────────

export const getChats = () => authFetch<Chat[]>('/api/chats');

export const getCallLogs = () => authFetch<Message[]>('/api/chats/call-logs');

export const createPrivateChat = (targetUid: string) =>
  authFetch<Chat>('/api/chats/private', {
    method: 'POST',
    body: JSON.stringify({ targetUid }),
  });

export const getChatMessages = (chatId: string, limit = 50, before?: string) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  return authFetch<Message[]>(`/api/chats/${chatId}/messages?${params}`);
};

export const markChatRead = (chatId: string) =>
  authFetch(`/api/chats/${chatId}/read`, { method: 'POST' });

export const deleteChat = (chatId: string, scope: 'me' | 'both') =>
  authFetch(`/api/chats/${chatId}`, {
    method: 'DELETE',
    body: JSON.stringify({ scope }),
  });

export const deleteMessage = (chatId: string, messageId: string, scope: 'me' | 'both') =>
  authFetch(`/api/chats/${chatId}/messages/${messageId}`, {
    method: 'DELETE',
    body: JSON.stringify({ scope }),
  });

export const editMessage = (chatId: string, messageId: string, content: string) =>
  authFetch(`/api/chats/${chatId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });

export const pinMessage = (chatId: string, messageId: string) =>
  authFetch<{ pinnedMessageIds: string[] }>(`/api/chats/${chatId}/pins`, {
    method: 'PATCH',
    body: JSON.stringify({ messageId, action: 'pin' }),
  });

export const unpinMessage = (chatId: string, messageId: string) =>
  authFetch<{ pinnedMessageIds: string[] }>(`/api/chats/${chatId}/pins`, {
    method: 'PATCH',
    body: JSON.stringify({ messageId, action: 'unpin' }),
  });

// ─── Saved Messages API ─────────────────────────────────────────────────────

export const getSavedMessages = () => authFetch<SavedMessage[]>('/api/saved-messages');

export const upsertSavedMessage = (messageId: string, entry: SavedMessage) =>
  authFetch(`/api/saved-messages/${encodeURIComponent(messageId)}`, {
    method: 'PUT',
    body: JSON.stringify({ entry }),
  });

export const deleteSavedMessage = (messageId: string) =>
  authFetch(`/api/saved-messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' });

// ─── Group API ─────────────────────────────────────────────────────────────

export const createGroup = (name: string, memberUids: string[], description?: string) =>
  authFetch<Group>('/api/groups', {
    method: 'POST',
    body: JSON.stringify({ name, memberUids, description }),
  });

export const getGroup = (groupId: string) => authFetch<Group>(`/api/groups/${groupId}`);

export const updateGroup = (
  groupId: string,
  updates: Partial<{ name: string; avatar: string; description: string }>,
) =>
  authFetch(`/api/groups/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });

export const addGroupMember = (groupId: string, memberUid: string) =>
  authFetch(`/api/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ memberUid }),
  });

export const removeGroupMember = (groupId: string, memberUid: string) =>
  authFetch(`/api/groups/${groupId}/members/${memberUid}`, { method: 'DELETE' });
