import { getIdToken, refreshIdToken } from './firebaseService';
import { ApiResponse } from '@shared/types';
import { db } from './dbService';

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

  let response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // If we get a 401 that isn't a session revocation, try once with a force-refreshed token
  if (response.status === 401) {
    try {
      const errorData = await response.clone().json();
      if (errorData.error === 'SESSION_REVOKED') {
        console.warn('[API] Session revoked. Forcing logout...');
        const message = errorData.message || 'Your session has been revoked from another device.';
        window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { revoked: true, message } }));
        return errorData as ApiResponse<T>;
      }
    } catch (e) {
      // Ignore parse errors
    }

    // Token may have just expired — force-refresh and retry once
    let freshToken = await refreshIdToken();
    
    // If Firebase SDK failed to refresh (e.g. session lost after app restart), 
    // try the backend refresh endpoint using the expired cached token
    if (!freshToken && token) {
      try {
        console.warn('[API] Firebase native refresh failed. Attempting backend session refresh...');
        const refreshRes = await fetch(`${BASE_URL}/api/auth/refresh-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.success && refreshData.data?.token) {
            console.log('[API] Backend issued new custom token. Re-authenticating Firebase...');
            const { signInWithCustomToken } = await import('./firebaseService');
            const fbUser = await signInWithCustomToken(refreshData.data.token);
            freshToken = await fbUser.getIdToken(true);
          }
        } else if (refreshRes.status === 401) {
           const errData = await refreshRes.clone().json().catch(() => ({}));
           if (errData.error === 'SESSION_REVOKED') {
             console.warn('[API] Backend refresh denied. Session revoked.');
             const message = errData.message || 'Your session has been revoked or expired.';
             window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { revoked: true, message } }));
             return errData as ApiResponse<T>;
           }
        }
      } catch (err) {
        console.error('[API] Backend refresh attempt failed:', err);
      }
    }

    if (freshToken) {
      headers['Authorization'] = `Bearer ${freshToken}`;
      response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
    } else {
      // All refresh attempts failed — session is truly expired
      console.warn('[API] All token refresh attempts failed. Session expired.');
      window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { revoked: false, message: 'Your session has expired. Please log in again.' } }));
    }
  }

  const data = await response.json() as ApiResponse<T>;

  // Side effect: Cache successful responses
  if (data.success && data.data) {
    if (endpoint === '/api/chats') {
      db.chats.bulkPut(data.data as any);
    } else if (endpoint.startsWith('/api/chats/') && endpoint.endsWith('/messages')) {
      db.messages.bulkPut(data.data as any);
    } else if (endpoint === '/api/users/me' || endpoint.startsWith('/api/users/')) {
      db.users.put(data.data as any);
    } else if (endpoint === '/api/saved-messages') {
      db.savedMessages.bulkPut(data.data as any);
    }
  }

  return data;
};

// ─── Auth / User API ───────────────────────────────────────────────────────
import { User, Chat, Group, Message, SavedMessage } from '@shared/types';

export const syncUserProfile = (name: string, email: string, avatar: string) =>
  authFetch<User>('/api/users/sync', {
    method: 'POST',
    body: JSON.stringify({ name, email, avatar }),
  });

export const getMyProfile = () => authFetch<User>('/api/users/me');

export const updateMyProfile = (updates: { 
  name?: string; 
  avatar?: string; 
  showActiveStatus?: boolean; 
  showMessageStatus?: boolean; 
  showLiveTyping?: boolean; 
  username?: string; 
  geminiApiKey?: string; 
  geminiApiKeys?: string[];
  aiSuggestionsEnabled?: boolean; 
  aiUsageCount?: number; 
  aiUsageLimit?: number; 
  aiUsageLastReset?: string,
  aiUsageCounts?: number[],
  groqApiKeys?: string[],
  groqUsageCounts?: number[]
}) =>
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

export const deleteMyAccount = (otp: string) =>
  authFetch<{ message: string }>('/api/users/me', {
    method: 'DELETE',
    body: JSON.stringify({ otp }),
  });

export type VerificationAction = 'delete_account' | 'reset_chat_pin' | 'app_lock' | 'two_factor';

export const requestEmailVerification = (action: VerificationAction) =>
  authFetch<{ message: string }>('/api/users/me/request-email-verification', {
    method: 'POST',
    body: JSON.stringify({ action }),
  });

export const verifyEmailOtp = (otp: string, action: VerificationAction) =>
  authFetch<{ message: string }>('/api/users/me/verify-email-otp', {
    method: 'POST',
    body: JSON.stringify({ otp, action }),
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

export const getCallLogs = (limit = 50, before?: string) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  return authFetch<Message[]>(`/api/chats/call-logs?${params}`);
};

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


// ─── Chat Theme API ───────────────────────────────────────────────────────────

export const setChatTheme = (chatId: string, theme: any) =>
  authFetch<{ success: boolean }>(`/api/users/me/chat-theme/${chatId}`, {
    method: 'PUT',
    body: JSON.stringify(theme),
  });

export const getChatTheme = (chatId: string) =>
  authFetch<{ success: boolean; data: any }>(`/api/users/me/chat-theme/${chatId}`);

export const removeChatTheme = (chatId: string) =>
  authFetch<{ success: boolean }>(`/api/users/me/chat-theme/${chatId}`, {
    method: 'DELETE',
  });

export const getAllChatThemes = () =>
  authFetch<{ success: boolean; data: Record<string, any> }>('/api/users/me/chat-themes');


// ─── Two-Factor Authentication API ─────────────────────────────────────────

export const setup2FA = () =>
  authFetch<{ qrCode: string; backupCodes: string[] }>('/api/users/me/2fa/setup', {
    method: 'POST',
  });

export const verify2FA = (token: string) =>
  authFetch<{ success: boolean; message: string }>('/api/users/me/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

export const verify2FALogin = (token: string) =>
  authFetch<{ verified: boolean }>('/api/users/me/2fa/verify-login', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

export const verify2FABackup = (code: string) =>
  authFetch<{ verified: boolean }>('/api/users/me/2fa/verify-backup', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

export const disable2FA = (token?: string, emailOtp?: string) =>
  authFetch<{ success: boolean; message: string }>('/api/users/me/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ token, emailOtp }),
  });

export const regenerate2FA = (token?: string, emailOtp?: string) =>
  authFetch<{ qrCode: string; backupCodes: string[] }>('/api/users/me/2fa/regenerate', {
    method: 'POST',
    body: JSON.stringify({ token, emailOtp }),
  });

export const cancelPending2FA = () =>
  authFetch<{ success: boolean; message: string }>('/api/users/me/2fa/cancel-pending', {
    method: 'POST',
  });

export const get2FAStatus = () =>
  authFetch<{ enabled: boolean }>('/api/users/me/2fa/status');
