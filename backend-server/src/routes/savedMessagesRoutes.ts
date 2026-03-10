import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticateToken } from '../middleware/authMiddleware';
import { handleValidationErrors } from '../middleware/errorHandler';
import { deleteSavedMessage, getSavedMessages, upsertSavedMessage } from '../controllers/savedMessagesController';

const router = Router();

router.use(authenticateToken);

// GET /api/saved-messages
router.get('/', getSavedMessages);

// PUT /api/saved-messages/:messageId  body: { entry: SavedMessage }
router.put(
  '/:messageId',
  [
    param('messageId').trim().notEmpty(),
    body('entry').isObject(),
    handleValidationErrors,
  ],
  upsertSavedMessage,
);

// DELETE /api/saved-messages/:messageId  (soft-delete in DB)
router.delete(
  '/:messageId',
  [param('messageId').trim().notEmpty(), handleValidationErrors],
  deleteSavedMessage,
);

export default router;

