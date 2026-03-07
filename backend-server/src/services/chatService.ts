import { db } from '../config/firebase';
import { Chat, Message } from '../../../shared/types';
import { generateId, now } from '../utils/helpers';
import logger from '../utils/logger';

/**
 * Find or create a private chat between two users
 */
export const getOrCreatePrivateChat = async (
  userA: string,
  userB: string,
): Promise<Chat> => {
  const snapshot = await db
    .collection('chats')
    .where('type', '==', 'private')
    .where('members', 'array-contains', userA)
    .get();

  for (const doc of snapshot.docs) {
    const chat = doc.data() as Chat;
    if (chat.members.includes(userB)) return chat;
  }

  // Create new private chat
  const chatId = generateId();
  const chat: Chat = {
    chatId,
    type: 'private',
    members: [userA, userB],
    createdAt: now(),
  };
  await db.collection('chats').doc(chatId).set(chat);
  logger.info(`Private chat created: ${chatId}`);
  return chat;
};

/**
 * Get all chats for a user with last message
 */
export const getUserChats = async (uid: string): Promise<Chat[]> => {
  const snapshot = await db
    .collection('chats')
    .where('members', 'array-contains', uid)
    .limit(100)
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as Chat)
    .sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
};

/**
 * Save a message to Firestore
 */
export const saveMessage = async (message: Message): Promise<Message> => {
  await db.collection('messages').doc(message.messageId).set(message);

  // Update chat's last message reference
  await db.collection('chats').doc(message.chatId).update({
    lastMessage: message,
    lastMessageAt: message.timestamp,
  });

  return message;
};

/**
 * Get paginated messages for a chat
 */
export const getMessages = async (
  chatId: string,
  limit = 50,
  before?: string,
): Promise<Message[]> => {
  const snapshot = await db
    .collection('messages')
    .where('chatId', '==', chatId)
    .get();

  let msgs = snapshot.docs.map((doc) => doc.data() as Message);

  // Sort descending by timestamp
  msgs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Apply 'before' cursor (messages older than this timestamp)
  if (before) {
    msgs = msgs.filter((m) => m.timestamp < before);
  }

  return msgs.slice(0, limit).reverse();
};

/**
 * Mark messages as read by a user
 */
export const markMessagesRead = async (
  chatId: string,
  userId: string,
): Promise<void> => {
  const snapshot = await db
    .collection('messages')
    .where('chatId', '==', chatId)
    .get();

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    const msg = doc.data() as Message;
    if (msg.senderId !== userId && !msg.readBy.includes(userId)) {
      batch.update(doc.ref, { readBy: [...msg.readBy, userId] });
    }
  });
  await batch.commit();
};

/**
 * Get a single chat by ID, verifying user membership
 */
export const getChatById = async (
  chatId: string,
  uid: string,
): Promise<Chat | null> => {
  const doc = await db.collection('chats').doc(chatId).get();
  if (!doc.exists) return null;
  const chat = doc.data() as Chat;
  if (!chat.members.includes(uid)) return null;
  return chat;
};

/**
 * Delete chat for one user only: remove them from members.
 * If no members remain, the entire chat is deleted.
 */
export const deleteChatForUser = async (chatId: string, uid: string): Promise<void> => {
  const ref = db.collection('chats').doc(chatId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const chat = snap.data() as Chat;
  if (!chat.members.includes(uid)) return;

  const remaining = chat.members.filter((m) => m !== uid);
  if (remaining.length === 0) {
    // Last member — clean up everything
    await deleteChatForAll(chatId, uid);
  } else {
    await ref.update({ members: remaining });
  }
};

/**
 * Delete chat for all users: remove chat doc and all messages.
 * Returns the list of member UIDs so the caller can notify them.
 */
export const deleteChatForAll = async (chatId: string, uid: string): Promise<string[]> => {
  const ref = db.collection('chats').doc(chatId);
  const snap = await ref.get();
  if (!snap.exists) return [];
  const chat = snap.data() as Chat;
  if (!chat.members.includes(uid)) return [];

  const members = [...chat.members];

  // Delete all messages in batches of 400
  const msgs = await db.collection('messages').where('chatId', '==', chatId).get();
  const batchSize = 400;
  for (let i = 0; i < msgs.docs.length; i += batchSize) {
    const batch = db.batch();
    msgs.docs.slice(i, i + batchSize).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  await ref.delete();
  logger.info(`Chat ${chatId} deleted by ${uid}`);
  return members;
};

/**
 * Delete a message only for the requesting user: adds their UID to deletedFor[].
 */
export const deleteMessageForUser = async (messageId: string, uid: string): Promise<boolean> => {
  const ref = db.collection('messages').doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const msg = snap.data() as Message;

  // Verify membership
  const chatSnap = await db.collection('chats').doc(msg.chatId).get();
  if (!chatSnap.exists) return false;
  const chat = chatSnap.data() as Chat;
  if (!chat.members.includes(uid)) return false;

  const existing = (msg.deletedFor as string[] | undefined) || [];
  if (!existing.includes(uid)) {
    await ref.update({ deletedFor: [...existing, uid] });
  }
  return true;
};

/**
 * Delete a message for everyone: marks deleted=true, clears content.
 * Returns { chatId, members } so caller can emit socket events.
 */
export const deleteMessageForAll = async (
  messageId: string,
  uid: string,
): Promise<{ chatId: string; members: string[] } | null> => {
  const ref = db.collection('messages').doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const msg = snap.data() as Message;

  const chatSnap = await db.collection('chats').doc(msg.chatId).get();
  if (!chatSnap.exists) return null;
  const chat = chatSnap.data() as Chat;
  if (!chat.members.includes(uid)) return null;

  await ref.update({ deleted: true, content: '' });
  logger.info(`Message ${messageId} deleted for all by ${uid}`);
  return { chatId: msg.chatId, members: chat.members };
};

/**
 * Edit a message's text content. Only the original sender may edit.
 * Returns { chatId, members } so the caller can broadcast the update.
 */
export const editMessage = async (
  messageId: string,
  uid: string,
  newContent: string,
): Promise<{ chatId: string; members: string[] } | null> => {
  const ref = db.collection('messages').doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const msg = snap.data() as Message;

  // Only the original sender can edit; cannot edit deleted messages
  if (msg.senderId !== uid || msg.deleted) return null;

  const chatSnap = await db.collection('chats').doc(msg.chatId).get();
  if (!chatSnap.exists) return null;
  const chat = chatSnap.data() as Chat;
  if (!chat.members.includes(uid)) return null;

  await ref.update({ content: newContent.trim(), isEdited: true });
  logger.info(`Message ${messageId} edited by ${uid}`);
  return { chatId: msg.chatId, members: chat.members };
};

const MAX_PINS = 50;

/**
 * Pin a message in a chat. Max 5 pins per chat.
 * Returns updated pinnedMessageIds array, or null on failure.
 */
export const pinMessage = async (
  chatId: string,
  messageId: string,
  uid: string,
): Promise<{ pinnedMessageIds: string[]; members: string[] } | null> => {
  const chatRef = db.collection('chats').doc(chatId);
  const snap = await chatRef.get();
  if (!snap.exists) return null;
  const chat = snap.data() as Chat;
  if (!chat.members.includes(uid)) return null;

  const current: string[] = chat.pinnedMessageIds || [];
  if (current.includes(messageId)) return { pinnedMessageIds: current, members: chat.members };
  if (current.length >= MAX_PINS) return null; // limit reached

  const updated = [...current, messageId];
  await chatRef.update({ pinnedMessageIds: updated });
  logger.info(`Message ${messageId} pinned in chat ${chatId} by ${uid}`);
  return { pinnedMessageIds: updated, members: chat.members };
};

/**
 * Unpin a message from a chat.
 * Returns updated pinnedMessageIds array, or null on failure.
 */
export const unpinMessage = async (
  chatId: string,
  messageId: string,
  uid: string,
): Promise<{ pinnedMessageIds: string[]; members: string[] } | null> => {
  const chatRef = db.collection('chats').doc(chatId);
  const snap = await chatRef.get();
  if (!snap.exists) return null;
  const chat = snap.data() as Chat;
  if (!chat.members.includes(uid)) return null;

  const current: string[] = chat.pinnedMessageIds || [];
  const updated = current.filter((id) => id !== messageId);
  await chatRef.update({ pinnedMessageIds: updated });
  logger.info(`Message ${messageId} unpinned in chat ${chatId} by ${uid}`);
  return { pinnedMessageIds: updated, members: chat.members };
};
