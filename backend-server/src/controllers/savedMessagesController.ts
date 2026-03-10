import { Request, Response } from 'express';
import logger from '../utils/logger';
import { listSavedMessages, softDeleteSavedMessage, upsertSavedMessageForUser } from '../services/savedMessagesService';
import { getIo } from './chatController';
import { SOCKET_EVENTS } from '../../../shared/constants/events';

/**
 * GET /api/saved-messages
 */
export const getSavedMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const entries = await listSavedMessages(uid);
    res.json({ success: true, data: entries });
  } catch (error) {
    logger.error(`getSavedMessages error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get saved messages' });
  }
};

/**
 * PUT /api/saved-messages/:messageId
 * Body: { entry: SavedMessage }
 */
export const upsertSavedMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { messageId } = req.params;
    const entry = req.body?.entry;

    if (!entry || typeof entry !== 'object') {
      res.status(400).json({ success: false, error: 'entry is required' });
      return;
    }

    // Enforce messageId path param as the canonical key.
    entry.messageId = messageId;

    await upsertSavedMessageForUser(uid, entry);
    const io = getIo();
    io?.to(`user:${uid}`).emit(SOCKET_EVENTS.SAVED_MESSAGE_UPDATED, { entry });
    res.json({ success: true });
  } catch (error) {
    logger.error(`upsertSavedMessage error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to save message' });
  }
};

/**
 * DELETE /api/saved-messages/:messageId
 * Soft-deletes the saved message (keeps tombstone for sync).
 */
export const deleteSavedMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { messageId } = req.params;
    const tombstone = await softDeleteSavedMessage(uid, messageId);
    const io = getIo();
    io?.to(`user:${uid}`).emit(SOCKET_EVENTS.SAVED_MESSAGE_UPDATED, { entry: tombstone });
    res.json({ success: true });
  } catch (error) {
    logger.error(`deleteSavedMessage error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to delete saved message' });
  }
};

