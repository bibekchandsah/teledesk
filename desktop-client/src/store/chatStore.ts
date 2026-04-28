import { create } from 'zustand';
import Dexie from 'dexie';
import { Chat, Message, User } from '@shared/types';
import { updateMyPinnedChats as updateMyPinnedChatsApi, updateMyArchivedChats as updateMyArchivedChatsApi, updateMyNicknames as updateMyNicknamesApi, toggleLockChat as toggleLockChatApi } from '../services/apiService';
import { LUMINA_AI_UID, LUMINA_PROFILE } from '../services/luminaService';
import { db } from '../services/dbService';

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
  markChatMessagesRead: (chatId: string, readerUid: string) => void;
  markMessageDelivered: (chatId: string, messageId: string, userId: string) => void;
  setTyping: (chatId: string, userId: string, userName: string, isTyping: boolean) => void;
  setLiveTypingText: (chatId: string, userId: string, userName: string, text: string) => void;
  setUserOnline: (userId: string, online: boolean, showActiveStatus?: boolean) => void;
  clearOnlineUsers: () => void;
  setUserProfile: (user: User) => void;
  setUserShowActiveStatus: (userId: string, showActiveStatus: boolean) => void;
  setUserShowMessageStatus: (userId: string, showMessageStatus: boolean) => void;
  setUserShowLiveTyping: (userId: string, showLiveTyping: boolean) => void;
  incrementUnread: (chatId: string) => void;
  clearUnread: (chatId: string) => void;
  updateChatLastMessage: (message: Message, lastMessageAt?: string) => void;
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
  lockedChatIds: string[];
  setLockedChatIds: (ids: string[]) => void;
  toggleLockChat: (chatId: string, lock: boolean) => Promise<void>;
  
  // Offline persistence
  initFromOffline: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChat: null,
  messages: {},
  typingUsers: {},
  liveTypingTexts: {},
  onlineUsers: new Set(),
  userProfiles: {
    [LUMINA_AI_UID]: LUMINA_PROFILE,
  },
  unreadCounts: loadUnreadCounts(),
  pinnedChatIds: [],
  archivedChatIds: [],
  lockedChatIds: [],
  nicknames: loadNicknames(),

  setChats: (chats) => set((state) => {
    // Always use the higher of localStorage vs server-computed unread count.
    // This ensures messages received while offline are reflected on next login.
    const seeded = { ...state.unreadCounts };
    for (const chat of chats) {
      if (chat.unreadCount !== undefined) {
        seeded[chat.chatId] = Math.max(seeded[chat.chatId] || 0, chat.unreadCount);
      }
    }
    saveUnreadCounts(seeded);
    
    // Persist to Dexie
    db.chats.bulkPut(chats).catch(console.error);
    
    return { chats, unreadCounts: seeded };
  }),

  setActiveChat: (chat) => set({ activeChat: chat }),

  setMessages: (chatId, messages) =>
    set((state) => ({ messages: { ...state.messages, [chatId]: messages } })),

  addMessage: (message) =>
    set((state) => {
      // Persist to Dexie
      db.messages.put(message).catch(console.error);
      if (message.chatId) {
        // Update chat last message time for proper sorting in Dexie
        db.chats.update(message.chatId, { lastMessageAt: message.timestamp, lastMessage: message }).catch(() => {});
      }

      const existing = state.messages[message.chatId] || [];
      const idx = existing.findIndex((m) => m.messageId === message.messageId);
      if (idx !== -1) {
        // Message already exists (e.g. optimistic). Merge deliveredTo / readBy
        // from the server version so the tick state is never lost.
        const prev = existing[idx];
        const mergedDelivered = Array.from(new Set([...(prev.deliveredTo ?? []), ...(message.deliveredTo ?? [])]));
        const mergedRead = Array.from(new Set([...(prev.readBy ?? []), ...(message.readBy ?? [])]));
        if (
          mergedDelivered.length === (prev.deliveredTo ?? []).length &&
          mergedRead.length === (prev.readBy ?? []).length
        ) {
          return state; // nothing new, avoid re-render
        }
        const updated = [...existing];
        updated[idx] = { ...prev, deliveredTo: mergedDelivered, readBy: mergedRead };
        return { messages: { ...state.messages, [message.chatId]: updated } };
      }
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
      let updatedMessage: Message | null = null;
      
      for (const chatId in newMessages) {
        newMessages[chatId] = newMessages[chatId].map((m) => {
          if (m.messageId === messageId) {
            updatedMessage = { ...m, ...updates };
            return updatedMessage;
          }
          return m;
        });
      }

      if (updatedMessage) {
        const msg = updatedMessage as Message;
        return {
          messages: newMessages,
          chats: state.chats.map((c) =>
            c.chatId === msg.chatId && c.lastMessage?.messageId === messageId
              ? { ...c, lastMessage: msg }
              : c
          ),
          activeChat:
            state.activeChat?.chatId === msg.chatId && state.activeChat.lastMessage?.messageId === messageId
              ? { ...state.activeChat, lastMessage: msg }
              : state.activeChat,
        };
      }

      return { messages: newMessages };
    }),

  markMessageDelivered: (chatId: string, messageId: string, userId: string) =>
    set((state) => {
      const existing = state.messages[chatId];
      if (!existing) return state;
      return {
        messages: {
          ...state.messages,
          [chatId]: existing.map((m) =>
            m.messageId === messageId && !(m.deliveredTo ?? []).includes(userId)
              ? { ...m, deliveredTo: [...(m.deliveredTo ?? []), userId] }
              : m,
          ),
        },
      };
    }),

  // Called when MESSAGE_READ_RECEIPT is received — add reader to readBy for all
  // messages in the chat not already marked as read by that user.
  markChatMessagesRead: (chatId: string, readerUid: string) =>
    set((state) => {
      const existing = state.messages[chatId];
      if (!existing) return state;
      return {
        messages: {
          ...state.messages,
          [chatId]: existing.map((m) =>
            m.readBy.includes(readerUid) ? m : { ...m, readBy: [...m.readBy, readerUid] },
          ),
        },
      };
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

  clearOnlineUsers: () => set({ onlineUsers: new Set() }),

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

  setUserShowMessageStatus: (userId, showMessageStatus) =>
    set((state) => ({
      userProfiles: state.userProfiles[userId]
        ? { ...state.userProfiles, [userId]: { ...state.userProfiles[userId], showMessageStatus } }
        : state.userProfiles,
    })),

  setUserShowLiveTyping: (userId, showLiveTyping) =>
    set((state) => ({
      userProfiles: state.userProfiles[userId]
        ? { ...state.userProfiles, [userId]: { ...state.userProfiles[userId], showLiveTyping } }
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

  updateChatLastMessage: (message: Message, lastMessageAt?: string) =>
    set((state) => ({
      chats: state.chats.map((c) =>
        c.chatId === message.chatId
          ? { ...c, lastMessage: message, lastMessageAt: lastMessageAt || message.timestamp }
          : c,
      ),
    })),

  removeChat: (chatId) => {
    // Clear the persisted last-active chat if it's the one being removed
    if (localStorage.getItem('lastActiveChatId') === chatId) {
      localStorage.removeItem('lastActiveChatId');
    }
    set((state) => ({
      chats: state.chats.filter((c) => c.chatId !== chatId),
      activeChat: state.activeChat?.chatId === chatId ? null : state.activeChat,
      messages: Object.fromEntries(Object.entries(state.messages).filter(([k]) => k !== chatId)),
      unreadCounts: Object.fromEntries(Object.entries(state.unreadCounts).filter(([k]) => k !== chatId)),
    }));
  },

  removeMessage: (chatId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: (state.messages[chatId] || []).filter((m) => m.messageId !== messageId),
      },
    })),

  markMessageDeleted: (chatId, messageId) =>
    set((state) => {
      const existing = state.messages[chatId] || [];
      const updatedMessages = existing.map((m) =>
        m.messageId === messageId ? { 
          ...m, 
          deleted: true, 
          content: 'This message was deleted',
          fileUrl: undefined,
          fileName: undefined,
          fileSize: undefined,
          reactions: {},
          isEdited: false
        } : m
      );
      
      const updatedChatMsg = updatedMessages.find(m => m.messageId === messageId);
      
      return {
        messages: {
          ...state.messages,
          [chatId]: updatedMessages,
        },
        chats: state.chats.map((c) =>
          c.chatId === chatId && c.lastMessage?.messageId === messageId && updatedChatMsg
            ? { ...c, lastMessage: updatedChatMsg }
            : c
        ),
        activeChat:
          state.activeChat?.chatId === chatId && state.activeChat.lastMessage?.messageId === messageId && updatedChatMsg
            ? { ...state.activeChat, lastMessage: updatedChatMsg }
            : state.activeChat,
      };
    }),

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

  setLockedChatIds: (ids) => set({ lockedChatIds: ids }),

  toggleLockChat: async (chatId, lock) => {
    const prev = get().lockedChatIds;
    const next = lock 
      ? [...new Set([...prev, chatId])]
      : prev.filter(id => id !== chatId);
    
    set({ lockedChatIds: next });
    try {
      await toggleLockChatApi(chatId, lock);
    } catch (err) {
      set({ lockedChatIds: prev });
      console.error('[toggleLockChat]', err);
      throw err;
    }
  },

  initFromOffline: async () => {
    try {
      const [chats, users] = await Promise.all([
        db.chats.orderBy('lastMessageAt').reverse().toArray(),
        db.users.toArray()
      ]);

      const userProfiles: Record<string, User> = { [LUMINA_AI_UID]: LUMINA_PROFILE };
      users.forEach(u => { userProfiles[u.uid] = u; });

      set({ 
        chats, 
        userProfiles,
      });

      // Load messages for the most recent chats (optional: only load active or top 5)
      const messageMap: Record<string, Message[]> = {};
      const recentChats = chats.slice(0, 10);
      await Promise.all(recentChats.map(async (chat) => {
         const msgs = await db.messages
           .where('[chatId+timestamp]')
           .between([chat.chatId, Dexie.minKey], [chat.chatId, Dexie.maxKey])
           .limit(50)
           .toArray();
         messageMap[chat.chatId] = msgs;
      }));
      
      set({ messages: { ...get().messages, ...messageMap } });
    } catch (e) {
      console.error('[initFromOffline] Failed:', e);
    }
  },

}));
