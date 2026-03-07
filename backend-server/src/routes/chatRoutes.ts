import { Router } from 'express';
import { body } from 'express-validator';
import { getChats, createOrGetPrivateChat, getChatMessages, markChatRead, deleteChat, deleteMessage, editMessage, updatePins } from '../controllers/chatController';
import { authenticateToken } from '../middleware/authMiddleware';
import { handleValidationErrors } from '../middleware/errorHandler';

const router = Router();

router.use(authenticateToken);

// GET /api/chats
router.get('/', getChats);

// POST /api/chats/private
router.post(
  '/private',
  [body('targetUid').trim().notEmpty(), handleValidationErrors],
  createOrGetPrivateChat,
);

// GET /api/chats/:chatId/messages
router.get('/:chatId/messages', getChatMessages);

// POST /api/chats/:chatId/read
router.post('/:chatId/read', markChatRead);

// DELETE /api/chats/:chatId  body: { scope: 'me' | 'both' }
router.delete('/:chatId', deleteChat);

// DELETE /api/chats/:chatId/messages/:messageId  body: { scope: 'me' | 'both' }
router.delete('/:chatId/messages/:messageId', deleteMessage);

// PATCH /api/chats/:chatId/messages/:messageId  body: { content: string }
router.patch(
  '/:chatId/messages/:messageId',
  [body('content').trim().notEmpty(), handleValidationErrors],
  editMessage,
);

// PATCH /api/chats/:chatId/pins  body: { messageId, action: 'pin'|'unpin' }
router.patch(
  '/:chatId/pins',
  [body('messageId').trim().notEmpty(), body('action').isIn(['pin', 'unpin']), handleValidationErrors],
  updatePins,
);

export default router;
