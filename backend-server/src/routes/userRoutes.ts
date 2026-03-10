import { Router } from 'express';
import { body } from 'express-validator';
import multer from 'multer';
import { syncUser, getMe, updateMe, uploadAvatar, getUserProfile, searchUsersHandler, updatePinnedChatsHandler, updateArchivedChatsHandler, updateNicknamesHandler, checkUsername, updateUsername } from '../controllers/userController';
import { authenticateToken } from '../middleware/authMiddleware';
import { handleValidationErrors } from '../middleware/errorHandler';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

// Public routes (no authentication required)
// GET /api/users/check-username/:username - Check username availability
router.get('/check-username/:username', checkUsername);

// All other routes require authentication
router.use(authenticateToken);

// POST /api/auth/sync - Sync user after login
router.post(
  '/sync',
  [
    body('name').trim().notEmpty().isLength({ max: 100 }),
    body('email').isEmail().normalizeEmail(),
    body('avatar').optional({ checkFalsy: true }).isURL({ require_tld: false }),
    handleValidationErrors,
  ],
  syncUser,
);

// GET /api/users/me
router.get('/me', getMe);

// POST /api/users/avatar - upload profile picture
router.post('/avatar', upload.single('avatar'), uploadAvatar);

// PATCH /api/users/me - Update profile
router.patch(
  '/me',
  [
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('avatar').optional({ checkFalsy: true }).isURL({ require_tld: false }),
    body('showActiveStatus').optional().isBoolean(),
    handleValidationErrors,
  ],
  updateMe,
);

// PATCH /api/users/me/pinned-chats
router.patch(
  '/me/pinned-chats',
  [body('pinnedChatIds').isArray(), handleValidationErrors],
  updatePinnedChatsHandler,
);

// PATCH /api/users/me/archived-chats
router.patch(
  '/me/archived-chats',
  [body('archivedChatIds').isArray(), handleValidationErrors],
  updateArchivedChatsHandler,
);

// PATCH /api/users/me/nicknames
router.patch(
  '/me/nicknames',
  [body('nicknames').isObject(), handleValidationErrors],
  updateNicknamesHandler,
);

// PATCH /api/users/me/username - Set/update username
router.patch(
  '/me/username',
  [
    body('username').trim().notEmpty().isLength({ min: 3, max: 20 }),
    handleValidationErrors,
  ],
  updateUsername,
);

// GET /api/users/search?q=...
router.get('/search', searchUsersHandler);

// GET /api/users/:uid
router.get('/:uid', getUserProfile);

export default router;
