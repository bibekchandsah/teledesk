import { create } from 'zustand';
import { Chat, Message, User } from '@shared/types';
import { updateMyPinnedChats as updateMyPinnedChatsApi, updateMyArchivedChats as updateMyArchivedChatsApi, updateMyNicknames as updateMyNicknamesApi } from '../services/apiService';

// ─── localStorage helpers for unread counts ────────────────────────────────
const UNREAD_KEY = 'teledesk_unread_counts';
const loadUnreadCounts = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(UNREAD_KEY) || '{}'); } catch { return {}; }
};
const saveUnreadCounts = (counts: Record<string, number>) => {
  try { localStorage.setItem(UNREAD_KEY, JSON.stringify(counts)); } catch {}
};

// ─── localStorage helpers for nicknames ──────────────────────────────────────
// Kept as a fast local cache; authoritative copy lives in Supabase.
const NICKNAMES_KEY = 'teledesk_nicknames';
const loadNicknames = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(NICKNAMES_KEY) || '{}'); } catch { return {}; }
};
const saveNicknamesCache = (nicknames: Record<string, string>) => {
  try { localStorage.setItem(NICKNAMES_KEY, JSON.stringify(nicknames)); } catch {}
};

interface ChatState {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Record<string, Message[]>; // chatId -> messages
  typingUsers: Record<string, { userId: string; userName: string }[]>; // chatId -> typing users
  liveTypingTexts: Record<string, { userId: string; userName: string; text: string }[]>; // chatId -> live text
  onlineUsers: Set<string>; // set of UIDs
  userProfiles: Record<string, User>; // uid -> User
  unreadCounts: Record<string, number>; // chatId -> count

  setChats: (chats: Chat[]) => void;
  setActiveChat: (chat: Chat | null) => void;
  setMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  setTyping: (chatId: string, userId: string, userName: string, isTyping: boolean) => void;
  setLiveTypingText: (chatId: string, userId: string, userName: string, text: string) => void;
  setUserOnline: (userId: string, online: boolean, showActiveStatus?: boolean) => void;
  setUserProfile: (user: User) => void;
  setUserShowActiveStatus: (userId: string, showActiveStatus: boolean) => void;
  incrementUnread: (chatId: string) => void;
  clearUnread: (chatId: string) => void;
  updateChatLastMessage: (message: Message) => void;
  removeChat: (chatId: string) => void;
  removeMessage: (chatId: string, messageId: string) => void;
  markMessageDeleted: (chatId: string, messageId: string) => void;
  updateChatPins: (chatId: string, pinnedMessageIds: string[]) => void;
  pinnedChatIds: string[];
  togglePinChat: (chatId: string) => void;
  setPinnedChatIds: (ids: string[]) => void;
  archivedChatIds: string[];
  toggleArchiveChat: (chatId: string) => void;
  setArchivedChatIds: (ids: string[]) => void;
  nicknames: Record<string, string>;
  setNicknames: (nicknames: Record<string, string>) => void;
  setNickname: (uid: string, nickname: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChat: null,
  messages: {},
  typingUsers: {},
  liveTypingTexts: {},
  onlineUsers: new Set(),
  userProfiles: {},
  unreadCounts: loadUnreadCounts(),
  pinnedChatIds: [],
  archivedChatIds: [],
  nicknames: loadNicknames(),

  setChats: (chats) => set((state) => {
    // Seed unread from chat.unreadCount for chats not yet tracked in memory
    const seeded = { ...state.unreadCounts };
    for (const chat of chats) {
      if (!(chat.chatId in seeded) && chat.unreadCount) {
        seeded[chat.chatId] = chat.unreadCount;
      }
    }
    saveUnreadCounts(seeded);
    return { chats, unreadCounts: seeded };
  }),

  setActiveChat: (chat) => set({ activeChat: chat }),

  setMessages: (chatId, messages) =>
    set((state) => ({ messages: { ...state.messages, [chatId]: messages } })),

  addMessage: (message) =>
    set((state) => {
      const existing = state.messages[message.chatId] || [];
      // Prevent duplicate messages
      if (existing.some((m) => m.messageId === message.messageId)) return state;
      return {
        messages: {
          ...state.messages,
          [message.chatId]: [...existing, message],
        },
      };
    }),

  updateMessage: (messageId, updates) =>
    set((state) => {
      const newMessages = { ...state.messages };
      for (const chatId in newMessages) {
        newMessages[chatId] = newMessages[chatId].map((m) =>
          m.messageId === messageId ? { ...m, ...updates } : m,
        );
      }
      return { messages: newMessages };
    }),

  setTyping: (chatId, userId, userName, isTyping) =>
    set((state) => {
      const current = state.typingUsers[chatId] || [];
      const filtered = current.filter((u) => u.userId !== userId);
      return {
        typingUsers: {
          ...state.typingUsers,
          [chatId]: isTyping ? [...filtered, { userId, userName }] : filtered,
        },
      };
    }),

  setLiveTypingText: (chatId, userId, userName, text) =>
    set((state) => {
      const current = state.liveTypingTexts[chatId] || [];
      const filtered = current.filter((u) => u.userId !== userId);
      return {
        liveTypingTexts: {
          ...state.liveTypingTexts,
          [chatId]: text ? [...filtered, { userId, userName, text }] : filtered,
        },
      };
    }),

  setUserOnline: (userId, online, showActiveStatus?) =>
    set((state) => {
      const updated = new Set(state.onlineUsers);
      if (online) {
        updated.add(userId);
      } else {
        updated.delete(userId);
      }
      // Persist showActiveStatus into userProfiles so the mutual filter can use it
      const profileUpdate =
        showActiveStatus !== undefined && state.userProfiles[userId]
          ? { userProfiles: { ...state.userProfiles, [userId]: { ...state.userProfiles[userId], showActiveStatus } } }
          : {};
      return { onlineUsers: updated, ...profileUpdate };
    }),

  setUserProfile: (user) =>
    set((state) => ({
      userProfiles: { ...state.userProfiles, [user.uid]: user },
    })),

  setUserShowActiveStatus: (userId, showActiveStatus) =>
    set((state) => ({
      userProfiles: state.userProfiles[userId]
        ? { ...state.userProfiles, [userId]: { ...state.userProfiles[userId], showActiveStatus } }
        : state.userProfiles,
    })),

  incrementUnread: (chatId) =>
    set((state) => {
      const updated = { ...state.unreadCounts, [chatId]: (state.unreadCounts[chatId] || 0) + 1 };
      saveUnreadCounts(updated);
      return { unreadCounts: updated };
    }),

  clearUnread: (chatId) =>
    set((state) => {
      const updated = { ...state.unreadCounts, [chatId]: 0 };
      saveUnreadCounts(updated);
      return { unreadCounts: updated };
    }),

  updateChatLastMessage: (message) =>
    set((state) => ({
      chats: state.chats.map((c) =>
        c.chatId === message.chatId
          ? { ...c, lastMessage: message, lastMessageAt: message.timestamp }
          : c,
      ),
    })),

  removeChat: (chatId) =>
    set((state) => ({
      chats: state.chats.filter((c) => c.chatId !== chatId),
      activeChat: state.activeChat?.chatId === chatId ? null : state.activeChat,
      messages: Object.fromEntries(Object.entries(state.messages).filter(([k]) => k !== chatId)),
      unreadCounts: Object.fromEntries(Object.entries(state.unreadCounts).filter(([k]) => k !== chatId)),
    })),

  removeMessage: (chatId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: (state.messages[chatId] || []).filter((m) => m.messageId !== messageId),
      },
    })),

  markMessageDeleted: (chatId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: (state.messages[chatId] || []).map((m) =>
          m.messageId === messageId ? { ...m, deleted: true, content: '' } : m
        ),
      },
    })),

  updateChatPins: (chatId, pinnedMessageIds) =>
    set((state) => ({
      chats: state.chats.map((c) => c.chatId === chatId ? { ...c, pinnedMessageIds } : c),
      activeChat:
        state.activeChat?.chatId === chatId
          ? { ...state.activeChat, pinnedMessageIds }
          : state.activeChat,
    })),

  setPinnedChatIds: (ids) => set({ pinnedChatIds: ids }),

  togglePinChat: async (chatId) => {
    const prev = get().pinnedChatIds;
    const already = prev.includes(chatId);
    const next = already ? prev.filter((id) => id !== chatId) : [chatId, ...prev];
    set({ pinnedChatIds: next });
    try {
      await updateMyPinnedChatsApi(next);
    } catch (err) {
      set({ pinnedChatIds: prev });
      console.error('[pinChat]', err);
    }
  },

  setArchivedChatIds: (ids) => set({ archivedChatIds: ids }),

  toggleArchiveChat: async (chatId) => {
    const prev = get().archivedChatIds;
    const already = prev.includes(chatId);
    const next = already ? prev.filter((id) => id !== chatId) : [chatId, ...prev];
    set({ archivedChatIds: next });
    try {
      await updateMyArchivedChatsApi(next);
    } catch (err) {
      set({ archivedChatIds: prev });
      console.error('[archiveChat]', err);
    }
  },

  setNicknames: (nicknames) => {
    saveNicknamesCache(nicknames);
    set({ nicknames });
  },

  setNickname: (uid, nickname) => {
    const trimmed = nickname.trim();
    const prev = get().nicknames;
    const updated = { ...prev };
    if (trimmed) {
      updated[uid] = trimmed;
    } else {
      delete updated[uid];
    }
    set({ nicknames: updated });
    saveNicknamesCache(updated);
    updateMyNicknamesApi(updated).catch((err) => {
      set({ nicknames: prev });
      saveNicknamesCache(prev);
      console.error('[setNickname]', err);
    });
  },

}));
