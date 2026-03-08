import { create } from 'zustand';
import { Message } from '@shared/types';

const genId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

// SavedMessage extends Message so it can be passed directly to MessageBubble
export interface SavedMessage extends Message {
  isNote?: boolean;        // true = typed by user directly in saved messages
  sourceChatName?: string; // from which chat this was bookmarked
  savedAt: string;
  pinnedInSaved?: boolean;
}

// Legacy alias kept for backward compat (BookmarksPage no longer uses this)
export type BookmarkedMessage = { message: Message; bookmarkedAt: string; sourceChatName?: string };

const SAVED_KEY = 'teledesk_saved_entries';

const load = (): SavedMessage[] => {
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
      }));
      localStorage.setItem(SAVED_KEY, JSON.stringify(migrated));
      localStorage.removeItem('teledesk_bookmarks');
      return migrated;
    }
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
  } catch { return []; }
};

const persist = (entries: SavedMessage[]) => {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(entries)); } catch {}
};

interface BookmarkState {
  savedEntries: SavedMessage[]; // oldest-first

  // ── Backward-compat API (used by ChatWindow & MessageBubble) ──────────────
  addBookmark: (message: Message, sourceChatName?: string) => void;
  removeBookmark: (messageId: string) => void;
  isBookmarked: (messageId: string) => boolean;

  // ── Full saved-messages operations ────────────────────────────────────────
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

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  savedEntries: load(),

  addBookmark: (message, sourceChatName) => {
    const entries = get().savedEntries;
    if (entries.some((e) => e.messageId === message.messageId)) return;
    const entry: SavedMessage = {
      ...message,
      chatId: '__saved__',
      isNote: false,
      sourceChatName,
      savedAt: new Date().toISOString(),
    };
    const updated = [...entries, entry];
    persist(updated);
    set({ savedEntries: updated });
  },

  removeBookmark: (messageId) => {
    const updated = get().savedEntries.filter((e) => e.messageId !== messageId);
    persist(updated);
    set({ savedEntries: updated });
  },

  isBookmarked: (messageId) => get().savedEntries.some((e) => e.messageId === messageId),

  addNote: ({ senderId, senderName, senderAvatar, content, replyTo }) => {
    const entry: SavedMessage = {
      messageId: genId(),
      chatId: '__saved__',
      senderId,
      senderName,
      senderAvatar,
      content,
      type: 'text',
      timestamp: new Date().toISOString(),
      readBy: [senderId],
      isNote: true,
      savedAt: new Date().toISOString(),
      ...(replyTo && { replyTo }),
    };
    const updated = [...get().savedEntries, entry];
    persist(updated);
    set({ savedEntries: updated });
  },

  addFileNote: ({ senderId, senderName, senderAvatar, content, type, fileUrl, fileName, fileSize }) => {
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
      timestamp: new Date().toISOString(),
      readBy: [senderId],
      isNote: true,
      savedAt: new Date().toISOString(),
    };
    const updated = [...get().savedEntries, entry];
    persist(updated);
    set({ savedEntries: updated });
  },

  deleteEntry: (messageId) => {
    const updated = get().savedEntries.filter((e) => e.messageId !== messageId);
    persist(updated);
    set({ savedEntries: updated });
  },

  editEntry: (messageId, content) => {
    const updated = get().savedEntries.map((e) =>
      e.messageId === messageId ? { ...e, content, isEdited: true } : e
    );
    persist(updated);
    set({ savedEntries: updated });
  },

  togglePin: (messageId) => {
    const updated = get().savedEntries.map((e) =>
      e.messageId === messageId ? { ...e, pinnedInSaved: !e.pinnedInSaved } : e
    );
    persist(updated);
    set({ savedEntries: updated });
  },

  updateEntry: (messageId, updates) => {
    const updated = get().savedEntries.map((e) =>
      e.messageId === messageId ? { ...e, ...updates } : e
    );
    persist(updated);
    set({ savedEntries: updated });
  },
}));
