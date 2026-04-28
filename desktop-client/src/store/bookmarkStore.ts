import { create } from 'zustand';
import { Message, SavedMessage } from '@shared/types';
import { useAuthStore } from './authStore';
import { getSavedMessages } from '../services/apiService';
import { db } from '../services/dbService';
import { syncService } from '../services/syncService';
import Dexie from 'dexie';

const genId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

// Legacy alias kept for backward compat (BookmarksPage no longer uses this)
export type BookmarkedMessage = { message: Message; bookmarkedAt: string; sourceChatName?: string };

const LEGACY_SAVED_KEY = 'teledesk_saved_entries';
const keyForUid = (uid?: string | null) => (uid ? `teledesk_saved_entries:${uid}` : LEGACY_SAVED_KEY);

const loadLocal = (uid?: string | null): SavedMessage[] => {
  try {
    // Migrate legacy bookmarks format if present
    const legacy = localStorage.getItem('teledesk_bookmarks');
    if (legacy) {
      const parsed: BookmarkedMessage[] = JSON.parse(legacy);
      const migrated: SavedMessage[] = parsed.map((b) => ({
        ...b.message,
        chatId: '__saved__',
        isNote: false,
        sourceChatName: b.sourceChatName,
        savedAt: b.bookmarkedAt,
        updatedAt: b.bookmarkedAt,
      }));
      localStorage.setItem(keyForUid(uid), JSON.stringify(migrated));
      localStorage.removeItem('teledesk_bookmarks');
      return migrated;
    }
    // Per-user key preferred; fall back to legacy global key if present
    const perUser = localStorage.getItem(keyForUid(uid));
    if (perUser) return JSON.parse(perUser || '[]');
    const legacySaved = localStorage.getItem(LEGACY_SAVED_KEY);
    if (legacySaved) return JSON.parse(legacySaved || '[]');
    return [];
  } catch { return []; }
};

const persistLocal = (uid: string | null | undefined, entries: SavedMessage[]) => {
  try { localStorage.setItem(keyForUid(uid), JSON.stringify(entries)); } catch {}
};

interface BookmarkState {
  savedEntries: SavedMessage[]; // oldest-first
  isCloudSynced: boolean;
  isSyncing: boolean;

  // ── Backward-compat API (used by ChatWindow & MessageBubble) ──────────────
  addBookmark: (message: Message, sourceChatName?: string) => void;
  removeBookmark: (messageId: string) => void;
  isBookmarked: (messageId: string) => boolean;

  // ── Full saved-messages operations ────────────────────────────────────────
  initializeForUser: (uid: string) => Promise<void>;
  applyRemoteEntry: (entry: SavedMessage) => void;
  addNote: (params: {
    senderId: string;
    senderName?: string;
    senderAvatar?: string;
    content: string;
    replyTo?: Message['replyTo'];
  }) => void;
  addFileNote: (params: {
    senderId: string;
    senderName?: string;
    senderAvatar?: string;
    content: string;
    type: 'file' | 'image' | 'video' | 'audio';
    fileUrl: string;
    fileName?: string;
    fileSize?: number;
  }) => void;
  deleteEntry: (messageId: string) => void;
  editEntry: (messageId: string, content: string) => void;
  togglePin: (messageId: string) => void;
  updateEntry: (messageId: string, updates: Partial<SavedMessage>) => void;
}

const byId = (entries: SavedMessage[]) => {
  const map = new Map<string, SavedMessage>();
  for (const e of entries) map.set(e.messageId, e);
  return map;
};

const getEntryUpdatedAt = (e: SavedMessage) =>
  new Date(e.updatedAt || e.savedAt || e.timestamp || 0).getTime();

const mergeEntries = (local: SavedMessage[], remote: SavedMessage[]) => {
  const merged = new Map<string, SavedMessage>();
  for (const e of local) merged.set(e.messageId, e);
  for (const r of remote) {
    const existing = merged.get(r.messageId);
    if (!existing || getEntryUpdatedAt(r) >= getEntryUpdatedAt(existing)) {
      merged.set(r.messageId, r);
    }
  }
  return [...merged.values()].sort((a, b) =>
    new Date(a.savedAt || a.timestamp).getTime() - new Date(b.savedAt || b.timestamp).getTime(),
  );
};

const getUid = () => useAuthStore.getState().currentUser?.uid ?? null;

const cloudUpsert = async (entry: SavedMessage) => {
  if (!navigator.onLine) {
    await syncService.addAction({
      type: 'upsertSavedMessage',
      payload: { messageId: entry.messageId, entry },
      timestamp: new Date().toISOString()
    });
    return;
  }
  const { upsertSavedMessage } = await import('../services/apiService');
  try {
    await upsertSavedMessage(entry.messageId, entry);
  } catch {
    await syncService.addAction({
      type: 'upsertSavedMessage',
      payload: { messageId: entry.messageId, entry },
      timestamp: new Date().toISOString()
    });
  }
};

const cloudDelete = async (messageId: string) => {
  if (!navigator.onLine) {
    await syncService.addAction({
      type: 'deleteSavedMessage',
      payload: { messageId },
      timestamp: new Date().toISOString()
    });
    return;
  }
  const { deleteSavedMessage } = await import('../services/apiService');
  try {
    await deleteSavedMessage(messageId);
  } catch {
    await syncService.addAction({
      type: 'deleteSavedMessage',
      payload: { messageId },
      timestamp: new Date().toISOString()
    });
  }
};

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  savedEntries: [],
  isCloudSynced: false,
  isSyncing: false,

  initializeForUser: async (uid) => {
    set({ isSyncing: true });
    // 1) Load local cache from Dexie
    const local = await db.savedMessages.toArray();
    set({ savedEntries: local });

    // 2) Fetch cloud and merge
    try {
      const res = await getSavedMessages();
      if (res.success && res.data) {
        const merged = mergeEntries(local, res.data);
        set({ savedEntries: merged, isCloudSynced: true });
        await db.savedMessages.bulkPut(merged);

        // 3) Backfill cloud with any local entries that are newer/missing
        const remoteMap = byId(res.data);
        const toUpsert = merged.filter((e) => {
          const r = remoteMap.get(e.messageId);
          return !r || getEntryUpdatedAt(e) > getEntryUpdatedAt(r);
        });
        for (const e of toUpsert) {
          if (!e?.messageId) continue;
          await cloudUpsert(e);
        }
      }
    } catch {
      // Ignore; app stays usable offline with local cache.
    } finally {
      set({ isSyncing: false });
    }
  },

  applyRemoteEntry: (entry) => {
    if (!entry?.messageId) return;
    const uid = getUid();
    const current = get().savedEntries;
    const merged = mergeEntries(current, [entry]);
    set({ savedEntries: merged, isCloudSynced: true });
    persistLocal(uid, merged);
  },

  addBookmark: (message, sourceChatName) => {
    const entries = get().savedEntries;
    if (entries.some((e) => e.messageId === message.messageId && !e.deleted)) return;
    const entry: SavedMessage = {
      ...message,
      chatId: '__saved__',
      isNote: false,
      sourceChatName,
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };
    const updated = [...entries, entry];
    db.savedMessages.put(entry);
    set({ savedEntries: updated });
    void cloudUpsert(entry);
  },

  removeBookmark: (messageId) => {
    const nowIso = new Date().toISOString();
    const updated = get().savedEntries.map((e) =>
      e.messageId === messageId ? { ...e, deleted: true, updatedAt: nowIso } : e,
    );
    const tomb = updated.find((e) => e.messageId === messageId);
    if (tomb) db.savedMessages.put(tomb);
    set({ savedEntries: updated });
    if (tomb) void cloudUpsert(tomb);
    void cloudDelete(messageId);
  },

  isBookmarked: (messageId) => get().savedEntries.some((e) => e.messageId === messageId && !e.deleted),

  addNote: ({ senderId, senderName, senderAvatar, content, replyTo }) => {
    const nowIso = new Date().toISOString();
    const entry: SavedMessage = {
      messageId: genId(),
      chatId: '__saved__',
      senderId,
      senderName,
      senderAvatar,
      content,
      type: 'text',
      timestamp: nowIso,
      readBy: [senderId],
      isNote: true,
      savedAt: nowIso,
      updatedAt: nowIso,
      ...(replyTo && { replyTo }),
    };
    const updated = [...get().savedEntries, entry];
    persistLocal(getUid(), updated);
    set({ savedEntries: updated });
    void cloudUpsert(entry);
  },

  addFileNote: ({ senderId, senderName, senderAvatar, content, type, fileUrl, fileName, fileSize }) => {
    const nowIso = new Date().toISOString();
    const entry: SavedMessage = {
      messageId: genId(),
      chatId: '__saved__',
      senderId,
      senderName,
      senderAvatar,
      content,
      type,
      fileUrl,
      fileName,
      fileSize,
      timestamp: nowIso,
      readBy: [senderId],
      isNote: true,
      savedAt: nowIso,
      updatedAt: nowIso,
    };
    const updated = [...get().savedEntries, entry];
    persistLocal(getUid(), updated);
    set({ savedEntries: updated });
    void cloudUpsert(entry);
  },

  deleteEntry: (messageId) => {
    const uid = getUid();
    const nowIso = new Date().toISOString();
    const updated = get().savedEntries.map((e) =>
      e.messageId === messageId ? { ...e, deleted: true, updatedAt: nowIso } : e,
    );
    persistLocal(uid, updated);
    set({ savedEntries: updated });
    const tomb = updated.find((e) => e.messageId === messageId);
    if (tomb) void cloudUpsert(tomb);
    void cloudDelete(messageId);
  },

  editEntry: (messageId, content) => {
    const nowIso = new Date().toISOString();
    const updated = get().savedEntries.map((e) =>
      e.messageId === messageId ? { ...e, content, isEdited: true, updatedAt: nowIso } : e,
    );
    persistLocal(getUid(), updated);
    set({ savedEntries: updated });
    const entry = updated.find((e) => e.messageId === messageId);
    if (entry) void cloudUpsert(entry);
  },

  togglePin: (messageId) => {
    const nowIso = new Date().toISOString();
    const updated = get().savedEntries.map((e) =>
      e.messageId === messageId ? { ...e, pinnedInSaved: !e.pinnedInSaved, updatedAt: nowIso } : e,
    );
    persistLocal(getUid(), updated);
    set({ savedEntries: updated });
    const entry = updated.find((e) => e.messageId === messageId);
    if (entry) void cloudUpsert(entry);
  },

  updateEntry: (messageId, updates) => {
    const nowIso = new Date().toISOString();
    const updated = get().savedEntries.map((e) =>
      e.messageId === messageId ? { ...e, ...updates, updatedAt: nowIso } : e,
    );
    persistLocal(getUid(), updated);
    set({ savedEntries: updated });
    const entry = updated.find((e) => e.messageId === messageId);
    if (entry) void cloudUpsert(entry);
  },
}));
