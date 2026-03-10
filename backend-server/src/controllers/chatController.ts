import { Request, Response } from 'express';
import {
  getOrCreatePrivateChat,
  getUserChats,
  getMessages,
  markMessagesRead,
  getChatById,
  deleteChatForUser,
  deleteChatForAll,
  deleteMessageForUser,
  deleteMessageForAll,
  editMessage as editMessageService,
  pinMessage as pinMessageService,
  unpinMessage as unpinMessageService,
} from '../services/chatService';
import { SOCKET_EVENTS } from '../../../shared/constants/events';
import logger from '../utils/logger';

/**
 * GET /api/chats
 */
export const getChats = async (req: Request, res: Response): Promise<void> => {
  try {
    const chats = await getUserChats(req.user!.uid);
    res.json({ success: true, data: chats });
  } catch (error) {
    logger.error(`getChats error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get chats' });
  }
};

/**
 * POST /api/chats/private
 * Body: { targetUid: string }
 */
export const createOrGetPrivateChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const { targetUid } = req.body;
    if (!targetUid || typeof targetUid !== 'string') {
      res.status(400).json({ success: false, error: 'targetUid is required' });
      return;
    }
    const chat = await getOrCreatePrivateChat(req.user!.uid, targetUid);
    res.json({ success: true, data: chat });
  } catch (error) {
    logger.error(`createOrGetPrivateChat error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to create chat' });
  }
};

/**
 * GET /api/chats/:chatId/messages?limit=50&before=timestamp
 */
export const getChatMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const chat = await getChatById(chatId, req.user!.uid);
    if (!chat) {
      res.status(404).json({ success: false, error: 'Chat not found or access denied' });
      return;
    }
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before as string | undefined;
    const messages = await getMessages(chatId, limit, before);
    res.json({ success: true, data: messages });
  } catch (error) {
    logger.error(`getChatMessages error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get messages' });
  }
};

/**
 * POST /api/chats/:chatId/read
 */
export const markChatRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    await markMessagesRead(chatId, req.user!.uid);
    res.json({ success: true });
  } catch (error) {
    logger.error(`markChatRead error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
};

// io is injected at server startup so controller can emit socket events
let _io: import('socket.io').Server | null = null;
export const setIo = (io: import('socket.io').Server) => { _io = io; };
export const getIo = () => _io;

/**
 * DELETE /api/chats/:chatId
 * Body: { scope: 'me' | 'both' }
 */
export const deleteChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const scope = req.body?.scope === 'both' ? 'both' : 'me';
    const uid = req.user!.uid;

    if (scope === 'both') {
      const members = await deleteChatForAll(chatId, uid);
      // Notify all members (including the requester) to remove the chat from their UI
      if (_io) {
        members.forEach((memberId) => {
          _io!.to(`user:${memberId}`).emit('chat_deleted', { chatId });
        });
      }
    } else {
      await deleteChatForUser(chatId, uid);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`deleteChat error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to delete chat' });
  }
};

/**
 * DELETE /api/chats/:chatId/messages/:messageId
 * Body: { scope: 'me' | 'both' }
 */
export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const scope = req.body?.scope === 'both' ? 'both' : 'me';
    const uid = req.user!.uid;

    if (scope === 'both') {
      const result = await deleteMessageForAll(messageId, uid);
      if (!result) {
        res.status(404).json({ success: false, error: 'Message not found or access denied' });
        return;
      }
      if (_io) {
        result.members.forEach((memberId) => {
          _io!.to(`user:${memberId}`).emit(SOCKET_EVENTS.MESSAGE_DELETED, {
            messageId,
            chatId: result.chatId,
          });
        });
      }
    } else {
      const ok = await deleteMessageForUser(messageId, uid);
      if (!ok) {
        res.status(404).json({ success: false, error: 'Message not found or access denied' });
        return;
      }
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`deleteMessage error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to delete message' });
  }
};

/**
 * PATCH /api/chats/:chatId/messages/:messageId
 * Body: { content: string }
 */
export const editMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const uid = req.user!.uid;

    if (!content || typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ success: false, error: 'content is required' });
      return;
    }

    const result = await editMessageService(messageId, uid, content);
    if (!result) {
      res.status(404).json({ success: false, error: 'Message not found or access denied' });
      return;
    }

    if (_io) {
      result.members.forEach((memberId) => {
        _io!.to(`user:${memberId}`).emit(SOCKET_EVENTS.MESSAGE_EDITED, {
          messageId,
          chatId: result.chatId,
          content: content.trim(),
        });
      });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`editMessage error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to edit message' });
  }
};

/**
 * PATCH /api/chats/:chatId/pins
 * Body: { messageId: string, action: 'pin' | 'unpin' }
 */
export const updatePins = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const { messageId, action } = req.body;
    if (!messageId || !action) {
      res.status(400).json({ success: false, error: 'messageId and action are required' });
      return;
    }
    const uid = req.user!.uid;
    const fn = action === 'pin' ? pinMessageService : unpinMessageService;
    const result = await fn(chatId, messageId, uid);
    if (!result) {
      const msg = action === 'pin' ? 'Cannot pin message (limit reached or not found)' : 'Cannot unpin message';
      res.status(400).json({ success: false, error: msg });
      return;
    }
    if (_io) {
      result.members.forEach((memberId) => {
        _io!.to(`user:${memberId}`).emit(SOCKET_EVENTS.PINS_UPDATED, {
          chatId,
          pinnedMessageIds: result.pinnedMessageIds,
        });
      });
    }
    res.json({ success: true, data: { pinnedMessageIds: result.pinnedMessageIds } });
  } catch (error) {
    logger.error(`updatePins error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to update pins' });
  }
};
