import { Router } from 'express';
import { saveDraftHandler, getDraftHandler, getUserDraftsHandler, deleteDraftHandler } from '../controllers/draftController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all drafts for current user
router.get('/', getUserDraftsHandler);

// Get draft for specific chat
router.get('/:chatId', getDraftHandler);

// Save/update draft for specific chat
router.put('/:chatId', saveDraftHandler);

// Delete draft for specific chat
router.delete('/:chatId', deleteDraftHandler);

export default router;
