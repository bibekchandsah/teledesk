import { supabase } from '../config/supabase';
import { Chat, Message } from '../../../shared/types';
import { generateId, now } from '../utils/helpers';
import logger from '../utils/logger';

// ─── Helper: map DB row → Chat ─────────────────────────────────────────────
type ChatRow = {
  chat_id: string;
  type: string;
  members: string[];
  created_at: string;
  last_message: Message | null;
  last_message_at: string | null;
  pinned_message_ids: string[];
};

const rowToChat = (r: ChatRow): Chat => ({
  chatId: r.chat_id,
  type: r.type as 'private' | 'group',
  members: r.members,
  createdAt: r.created_at,
  ...(r.last_message && { lastMessage: r.last_message }),
  ...(r.last_message_at && { lastMessageAt: r.last_message_at }),
  pinnedMessageIds: r.pinned_message_ids ?? [],
});

// ─── Helper: map DB row → Message ─────────────────────────────────────────
type MessageRow = {
  message_id: string;
  chat_id: string;
  sender_id: string;
  sender_name: string | null;
  sender_avatar: string | null;
  content: string;
  type: string;
  timestamp: string;
  read_by: string[];
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  encrypted: boolean | null;
  deleted: boolean | null;
  deleted_for: string[];
  is_edited: boolean | null;
  forwarded: boolean | null;
  reply_to: Message['replyTo'] | null;
  call_type: string | null;
  call_duration: number | null;
  call_status: string | null;
  call_status_receiver: string | null;
  delivered_to: string[];
  reactions: Record<string, string[]> | null;
};

const rowToMessage = (r: MessageRow): Message => ({
  messageId: r.message_id,
  chatId: r.chat_id,
  senderId: r.sender_id,
  ...(r.sender_name !== null && { senderName: r.sender_name }),
  ...(r.sender_avatar !== null && { senderAvatar: r.sender_avatar }),
  content: r.content,
  type: r.type as Message['type'],
  timestamp: r.timestamp,
  readBy: r.read_by ?? [],
  deliveredTo: r.delivered_to ?? [],
  ...(r.file_url !== null && { fileUrl: r.file_url }),
  ...(r.file_name !== null && { fileName: r.file_name }),
  ...(r.file_size !== null && { fileSize: r.file_size }),
  ...(r.encrypted !== null && { encrypted: r.encrypted }),
  ...(r.deleted !== null && { deleted: r.deleted }),
  ...(r.deleted_for?.length && { deletedFor: r.deleted_for }),
  ...(r.is_edited !== null && { isEdited: r.is_edited }),
  ...(r.forwarded !== null && { forwarded: r.forwarded }),
  ...(r.reply_to !== null && { replyTo: r.reply_to }),
  ...(r.call_type !== null && { callType: r.call_type as Message['callType'] }),
  ...(r.call_duration !== null && { callDuration: r.call_duration }),
  ...(r.call_status !== null && { callStatus: r.call_status as Message['callStatus'] }),
  ...(r.call_status_receiver !== null && { callStatusReceiver: r.call_status_receiver as Message['callStatusReceiver'] }),
  reactions: r.reactions ?? {},
});


// ─── Find or create a private chat ────────────────────────────────────────

export const getOrCreatePrivateChat = async (
  userA: string,
  userB: string,
): Promise<Chat> => {
  const { data: rows } = await supabase
    .from('chats')
    .select('*')
    .eq('type', 'private')
    .contains('members', [userA]);

  const existing = (rows ?? []) as ChatRow[];

  if (userA === userB) {
    const selfChat = existing.find((c) => c.members.every((m) => m === userA));
    if (selfChat) return rowToChat(selfChat);

    const chatId = generateId();
    const chat: Chat = { chatId, type: 'private', members: [userA, userA], createdAt: now() };
    await supabase.from('chats').insert({
      chat_id: chatId,
      type: 'private',
      members: [userA, userA],
      created_at: chat.createdAt,
    });
    logger.info(`Self-chat created: ${chatId}`);
    return chat;
  }

  const found = existing.find((c) => c.members.includes(userB));
  if (found) return rowToChat(found);

  const chatId = generateId();
  const chat: Chat = { chatId, type: 'private', members: [userA, userB], createdAt: now() };
  await supabase.from('chats').insert({
    chat_id: chatId,
    type: 'private',
    members: [userA, userB],
    created_at: chat.createdAt,
  });
  logger.info(`Private chat created: ${chatId}`);
  return chat;
};

export const getUserChats = async (uid: string): Promise<Chat[]> => {
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .contains('members', [uid])
    .limit(100);

  if (error) throw new Error(error.message);

  const chats = ((data ?? []) as ChatRow[])
    .map(rowToChat)
    .sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });

  if (chats.length === 0) return chats;

  // Count unread messages per chat for this user (not sent by them, not in read_by)
  const chatIds = chats.map((c) => c.chatId);
  const { data: unreadRows } = await supabase
    .from('messages')
    .select('chat_id')
    .in('chat_id', chatIds)
    .neq('sender_id', uid)
    .filter('read_by', 'not.cs', `{"${uid}"}`);

  const unreadCounts: Record<string, number> = {};
  for (const row of (unreadRows ?? []) as { chat_id: string }[]) {
    unreadCounts[row.chat_id] = (unreadCounts[row.chat_id] || 0) + 1;
  }

  return chats.map((c) => ({
    ...c,
    unreadCount: unreadCounts[c.chatId] ?? 0,
  }));
};

export const saveMessage = async (message: Message): Promise<Message> => {
  const { error: msgErr } = await supabase.from('messages').upsert({
    message_id: message.messageId,
    chat_id: message.chatId,
    sender_id: message.senderId,
    sender_name: message.senderName ?? null,
    sender_avatar: message.senderAvatar ?? null,
    content: message.content,
    type: message.type,
    timestamp: message.timestamp,
    read_by: message.readBy,
    delivered_to: message.deliveredTo ?? [],
    file_url: message.fileUrl ?? null,
    file_name: message.fileName ?? null,
    file_size: message.fileSize ?? null,
    encrypted: message.encrypted ?? null,
    deleted: message.deleted ?? false,
    deleted_for: message.deletedFor ?? [],
    is_edited: message.isEdited ?? false,
    forwarded: message.forwarded ?? false,
    reply_to: message.replyTo ?? null,
    call_type: message.callType ?? null,
    call_duration: message.callDuration ?? null,
    call_status: message.callStatus ?? null,
    call_status_receiver: message.callStatusReceiver ?? null,
    reactions: message.reactions ?? {},
  });
  if (msgErr) throw new Error(msgErr.message);

  await supabase
    .from('chats')
    .update({ last_message: message, last_message_at: message.timestamp })
    .eq('chat_id', message.chatId);

  return message;
};

export const getMessages = async (
  chatId: string,
  limit = 50,
  before?: string,
): Promise<Message[]> => {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('timestamp', before);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as MessageRow[]).map(rowToMessage).reverse();
};

export const markMessageDelivered = async (messageId: string, userId: string): Promise<void> => {
  const { data } = await supabase
    .from('messages')
    .select('delivered_to')
    .eq('message_id', messageId)
    .single();
  if (!data) return;
  const current: string[] = data.delivered_to ?? [];
  if (current.includes(userId)) return;
  await supabase
    .from('messages')
    .update({ delivered_to: [...current, userId] })
    .eq('message_id', messageId);
};

/**
 * Returns messages sent to the user while they were offline (not yet in delivered_to).
 * Used on socket reconnect to backfill delivery status.
 */
export const getUndeliveredMessagesForUser = async (uid: string): Promise<Message[]> => {
  // Get all chat IDs where this user is a member
  const { data: chatData } = await supabase
    .from('chats')
    .select('chat_id')
    .filter('members', 'cs', JSON.stringify([uid]));

  const chatIds = (chatData ?? []).map((r: { chat_id: string }) => r.chat_id);
  if (chatIds.length === 0) return [];

  // Only look back 7 days to keep the query scoped
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .in('chat_id', chatIds)
    .neq('sender_id', uid)
    .filter('delivered_to', 'not.cs', JSON.stringify([uid]))
    .gte('timestamp', since)
    .order('timestamp', { ascending: false })
    .limit(100);

  if (error) {
    logger.error(`getUndeliveredMessagesForUser error: ${error.message}`);
    return [];
  }

  return ((data ?? []) as MessageRow[]).map(rowToMessage);
};

export const markMessagesRead = async (chatId: string, userId: string): Promise<void> => {
  const { data, error } = await supabase
    .from('messages')
    .select('message_id, read_by')
    .eq('chat_id', chatId)
    .neq('sender_id', userId);

  if (error) throw new Error(error.message);

  const toUpdate = (data ?? []).filter(
    (m: { message_id: string; read_by: string[] }) => !m.read_by.includes(userId),
  );

  for (const m of toUpdate) {
    await supabase
      .from('messages')
      .update({ read_by: [...m.read_by, userId] })
      .eq('message_id', m.message_id);
  }
};

export const getChatById = async (chatId: string, uid: string): Promise<Chat | null> => {
  const { data } = await supabase
    .from('chats')
    .select('*')
    .eq('chat_id', chatId)
    .single();

  if (!data) return null;
  const chat = rowToChat(data as ChatRow);
  if (!chat.members.includes(uid)) return null;
  return chat;
};

export const deleteChatForUser = async (chatId: string, uid: string): Promise<void> => {
  const { data } = await supabase.from('chats').select('*').eq('chat_id', chatId).single();
  if (!data) return;
  const chat = rowToChat(data as ChatRow);
  if (!chat.members.includes(uid)) return;

  const remaining = chat.members.filter((m) => m !== uid);
  if (remaining.length === 0) {
    await deleteChatForAll(chatId, uid);
  } else {
    await supabase.from('chats').update({ members: remaining }).eq('chat_id', chatId);
  }
};

export const deleteChatForAll = async (chatId: string, uid: string): Promise<string[]> => {
  const { data } = await supabase.from('chats').select('*').eq('chat_id', chatId).single();
  if (!data) return [];
  const chat = rowToChat(data as ChatRow);
  if (!chat.members.includes(uid)) return [];

  const members = [...chat.members];
  // Messages are cascade-deleted via FK (on delete cascade)
  await supabase.from('chats').delete().eq('chat_id', chatId);
  logger.info(`Chat ${chatId} deleted by ${uid}`);
  return members;
};

export const deleteMessageForUser = async (messageId: string, uid: string): Promise<boolean> => {
  const { data: msgData } = await supabase
    .from('messages')
    .select('chat_id, deleted_for')
    .eq('message_id', messageId)
    .single();
  if (!msgData) return false;

  const { data: chatData } = await supabase
    .from('chats')
    .select('members')
    .eq('chat_id', msgData.chat_id)
    .single();
  if (!chatData || !(chatData.members as string[]).includes(uid)) return false;

  const existing: string[] = (msgData.deleted_for as string[]) ?? [];
  if (!existing.includes(uid)) {
    await supabase
      .from('messages')
      .update({ deleted_for: [...existing, uid] })
      .eq('message_id', messageId);
  }
  return true;
};

export const deleteMessageForAll = async (
  messageId: string,
  uid: string,
): Promise<{ chatId: string; members: string[] } | null> => {
  const { data: msgData } = await supabase
    .from('messages')
    .select('chat_id')
    .eq('message_id', messageId)
    .single();
  if (!msgData) return null;

  const { data: chatData } = await supabase
    .from('chats')
    .select('members')
    .eq('chat_id', msgData.chat_id)
    .single();
  if (!chatData || !(chatData.members as string[]).includes(uid)) return null;

  await supabase
    .from('messages')
    .update({ deleted: true, content: '' })
    .eq('message_id', messageId);

  logger.info(`Message ${messageId} deleted for all by ${uid}`);
  return { chatId: msgData.chat_id as string, members: chatData.members as string[] };
};

export const editMessage = async (
  messageId: string,
  uid: string,
  newContent: string,
): Promise<{ chatId: string; members: string[] } | null> => {
  const { data: msgData } = await supabase
    .from('messages')
    .select('chat_id, sender_id, deleted')
    .eq('message_id', messageId)
    .single();
  if (!msgData) return null;
  if ((msgData.sender_id as string) !== uid || msgData.deleted) return null;

  const { data: chatData } = await supabase
    .from('chats')
    .select('members')
    .eq('chat_id', msgData.chat_id)
    .single();
  if (!chatData || !(chatData.members as string[]).includes(uid)) return null;

  await supabase
    .from('messages')
    .update({ content: newContent.trim(), is_edited: true })
    .eq('message_id', messageId);

  logger.info(`Message ${messageId} edited by ${uid}`);
  return { chatId: msgData.chat_id as string, members: chatData.members as string[] };
};

const MAX_PINS = 50;

export const pinMessage = async (
  chatId: string,
  messageId: string,
  uid: string,
): Promise<{ pinnedMessageIds: string[]; members: string[] } | null> => {
  const { data } = await supabase.from('chats').select('*').eq('chat_id', chatId).single();
  if (!data) return null;
  const chat = rowToChat(data as ChatRow);
  if (!chat.members.includes(uid)) return null;

  const current = chat.pinnedMessageIds ?? [];
  if (current.includes(messageId)) return { pinnedMessageIds: current, members: chat.members };
  if (current.length >= MAX_PINS) return null;

  const updated = [...current, messageId];
  await supabase.from('chats').update({ pinned_message_ids: updated }).eq('chat_id', chatId);
  logger.info(`Message ${messageId} pinned in chat ${chatId} by ${uid}`);
  return { pinnedMessageIds: updated, members: chat.members };
};

export const unpinMessage = async (
  chatId: string,
  messageId: string,
  uid: string,
): Promise<{ pinnedMessageIds: string[]; members: string[] } | null> => {
  const { data } = await supabase.from('chats').select('*').eq('chat_id', chatId).single();
  if (!data) return null;
  const chat = rowToChat(data as ChatRow);
  if (!chat.members.includes(uid)) return null;

  const updated = (chat.pinnedMessageIds ?? []).filter((id) => id !== messageId);
  await supabase.from('chats').update({ pinned_message_ids: updated }).eq('chat_id', chatId);
  logger.info(`Message ${messageId} unpinned in chat ${chatId} by ${uid}`);
  return { pinnedMessageIds: updated, members: chat.members };
};

// ─── Message Reactions ────────────────────────────────────────────────────

export const addReaction = async (
  messageId: string,
  emoji: string,
  uid: string,
): Promise<{ 
  chatId: string; 
  senderId: string; 
  members: string[]; 
  reactions: Record<string, string[]>; 
  readBy: string[];
  content: string;
  timestamp: string;
} | null> => {
  const { data: msgData } = await supabase
    .from('messages')
    .select('chat_id, reactions, sender_id, read_by, content, timestamp')
    .eq('message_id', messageId)
    .single();
  if (!msgData) return null;

  const { data: chatData } = await supabase
    .from('chats')
    .select('members')
    .eq('chat_id', msgData.chat_id)
    .single();
  if (!chatData || !(chatData.members as string[]).includes(uid)) return null;

  const reactions: Record<string, string[]> = (msgData.reactions as Record<string, string[]>) ?? {};
  const current = reactions[emoji] ?? [];
  if (current.includes(uid)) {
    return {
      chatId: msgData.chat_id as string,
      senderId: msgData.sender_id as string,
      members: chatData.members as string[],
      reactions,
      readBy: msgData.read_by ?? [],
      content: msgData.content,
      timestamp: msgData.timestamp,
    };
  }

  reactions[emoji] = [...current, uid];
  const updatedReadBy = [uid];
  await supabase.from('messages').update({ reactions, read_by: updatedReadBy }).eq('message_id', messageId);

  // Always update chat's last_message and bump to top (Telegram style)
  const updatedLastMsg = { 
    messageId, 
    chatId: msgData.chat_id, 
    senderId: msgData.sender_id,
    content: msgData.content,
    timestamp: msgData.timestamp, // Keep original message timestamp inside message object
    reactions, 
    readBy: updatedReadBy 
  };
  
  await supabase
    .from('chats')
    .update({ 
      last_message: updatedLastMsg, 
      last_message_at: now() // Use current time for sorting chats list (the "bump")
    })
    .eq('chat_id', msgData.chat_id);

  logger.info(`Reaction ${emoji} added to ${messageId} by ${uid} (chat bumped)`);
  return {
    chatId: msgData.chat_id as string,
    senderId: msgData.sender_id as string,
    members: chatData.members as string[],
    reactions,
    readBy: updatedReadBy,
    content: msgData.content,
    timestamp: msgData.timestamp,
  };
};

export const removeReaction = async (
  messageId: string,
  emoji: string,
  uid: string,
): Promise<{ chatId: string; members: string[]; reactions: Record<string, string[]> } | null> => {
  const { data: msgData } = await supabase
    .from('messages')
    .select('chat_id, reactions')
    .eq('message_id', messageId)
    .single();
  if (!msgData) return null;

  const { data: chatData } = await supabase
    .from('chats')
    .select('members')
    .eq('chat_id', msgData.chat_id)
    .single();
  if (!chatData || !(chatData.members as string[]).includes(uid)) return null;

  const reactions: Record<string, string[]> = (msgData.reactions as Record<string, string[]>) ?? {};
  const current = reactions[emoji] ?? [];
  const filtered = current.filter((id) => id !== uid);
  if (filtered.length === 0) {
    delete reactions[emoji];
  } else {
    reactions[emoji] = filtered;
  }
  await supabase.from('messages').update({ reactions }).eq('message_id', messageId);

  // Update chat's last_message if this is the last message
  const { data: lastMsgChat } = await supabase
    .from('chats')
    .select('last_message')
    .eq('chat_id', msgData.chat_id)
    .single();

  if (lastMsgChat?.last_message?.messageId === messageId) {
    const updatedLastMsg = { ...lastMsgChat.last_message, reactions };
    await supabase
      .from('chats')
      .update({ last_message: updatedLastMsg })
      .eq('chat_id', msgData.chat_id);
  }

  logger.info(`Reaction ${emoji} removed from ${messageId} by ${uid}`);
  return { chatId: msgData.chat_id as string, members: chatData.members as string[], reactions };
};
