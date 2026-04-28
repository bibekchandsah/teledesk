import Dexie, { Table } from 'dexie';
import { User, Chat, Message, SavedMessage } from '@shared/types';

export interface SyncAction {
  id?: number;
  type: string; // 'sendMessage', 'editMessage', 'deleteMessage', 'createPrivateChat', 'markRead', etc.
  payload: any;
  timestamp: string;
  chatId?: string;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
}

export class TeleDeskDatabase extends Dexie {
  chats!: Table<Chat, string>;
  messages!: Table<Message, string>;
  users!: Table<User, string>;
  savedMessages!: Table<SavedMessage, string>;
  syncQueue!: Table<SyncAction, number>;

  constructor() {
    super('TeleDeskDB');
    this.version(1).stores({
      chats: 'chatId, unreadCount, lastMessageAt',
      // Compound index for querying a chat's messages ordered by time
      messages: 'messageId, chatId, senderId, timestamp, [chatId+timestamp]',
      users: 'uid, name, username',
      savedMessages: 'messageId, sourceChatName, savedAt',
      syncQueue: '++id, type, status, chatId' // auto-incrementing ID
    });
  }
}

export const db = new TeleDeskDatabase();
