import { Router } from 'express';
import { body } from 'express-validator';
import {
  createGroupHandler,
  getGroupHandler,
  addMemberHandler,
  removeMemberHandler,
  updateGroupHandler,
} from '../controllers/groupController';
import { authenticateToken } from '../middleware/authMiddleware';
import { handleValidationErrors } from '../middleware/errorHandler';

const router = Router();

router.use(authenticateToken);

// POST /api/groups
router.post(
  '/',
  [body('name').trim().notEmpty().isLength({ max: 100 }), handleValidationErrors],
  createGroupHandler,
);

// GET /api/groups/:groupId
router.get('/:groupId', getGroupHandler);

// PUT /api/groups/:groupId
router.put('/:groupId', updateGroupHandler);

// POST /api/groups/:groupId/members
router.post(
  '/:groupId/members',
  [body('memberUid').trim().notEmpty(), handleValidationErrors],
  addMemberHandler,
);

// DELETE /api/groups/:groupId/members/:memberUid
router.delete('/:groupId/members/:memberUid', removeMemberHandler);

export default router;
