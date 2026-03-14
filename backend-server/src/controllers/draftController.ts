import { Request, Response } from 'express';
import { saveDraft, getDraft, getUserDrafts, deleteDraft } from '../services/draftService';
import logger from '../utils/logger';
import { Server } from 'socket.io';
import { SOCKET_EVENTS } from '../../../shared/constants/events';

let _io: Server | null = null;
export const setIo = (io: Server) => { _io = io; };

/**
 * PUT /api/drafts/:chatId
 * Save or update a draft for a specific chat
 */
export const saveDraftHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.uid) {
      logger.error('saveDraft: req.user is undefined or missing uid');
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const userId = req.user.uid;
    const { chatId } = req.params;
    const { content } = req.body as { content: string };

    if (typeof content !== 'string') {
      res.status(400).json({ success: false, error: 'content is required' });
      return;
    }

    const draft = await saveDraft(userId, chatId, content);

    // Notify other devices of this user about the draft update or deletion
    if (_io) {
      if (draft.content === '') {
        // Draft was deleted (empty content)
        _io.to(`user:${userId}`).emit(SOCKET_EVENTS.DRAFT_DELETED, { chatId });
      } else {
        // Draft was updated
        _io.to(`user:${userId}`).emit(SOCKET_EVENTS.DRAFT_UPDATED, draft);
      }
    }

    res.json({ success: true, data: draft });
  } catch (error) {
    const errorMessage = (error as Error).message;
    logger.error(`saveDraft error: ${errorMessage}`);
    
    // If it's a table not found error, return success but log warning
    if (errorMessage.includes('relation "drafts" does not exist')) {
      logger.warn('Drafts table does not exist. Feature disabled until migration is run.');
      res.json({ 
        success: true, 
        data: { 
          userId: req.user?.uid || 'unknown', 
          chatId: req.params.chatId, 
          content: req.body.content, 
          updatedAt: new Date().toISOString() 
        } 
      });
      return;
    }
    
    res.status(500).json({ success: false, error: 'Failed to save draft' });
  }
};

/**
 * GET /api/drafts/:chatId
 * Get a draft for a specific chat
 */
export const getDraftHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.uid) {
      logger.error('getDraft: req.user is undefined or missing uid');
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const userId = req.user.uid;
    const { chatId } = req.params;

    const draft = await getDraft(userId, chatId);

    res.json({ success: true, data: draft });
  } catch (error) {
    logger.error(`getDraft error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get draft' });
  }
};

/**
 * GET /api/drafts
 * Get all drafts for the current user
 */
export const getUserDraftsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.uid) {
      logger.error('getUserDrafts: req.user is undefined or missing uid');
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const userId = req.user.uid;

    const drafts = await getUserDrafts(userId);

    res.json({ success: true, data: drafts });
  } catch (error) {
    logger.error(`getUserDrafts error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get drafts' });
  }
};

/**
 * DELETE /api/drafts/:chatId
 * Delete a draft for a specific chat
 */
export const deleteDraftHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.uid) {
      logger.error('deleteDraft: req.user is undefined or missing uid');
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const userId = req.user.uid;
    const { chatId } = req.params;

    await deleteDraft(userId, chatId);

    // Notify other devices of this user about the draft deletion
    if (_io) {
      _io.to(`user:${userId}`).emit(SOCKET_EVENTS.DRAFT_DELETED, { chatId });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`deleteDraft error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to delete draft' });
  }
};
