import { Router } from 'express';
import { body } from 'express-validator';
import multer from 'multer';
import { syncUser, getMe, updateMe, uploadAvatar, getUserProfile, searchUsersHandler, updatePinnedChatsHandler, updateArchivedChatsHandler, updateNicknamesHandler, checkUsername, updateUsername, setPin, verifyPin, toggleLock, forgotPin, resetPin } from '../controllers/userController';
import { getDeviceSessions, revokeSession, revokeAllOtherDeviceSessions, cleanupDuplicateDeviceSessions, debugSessionInfo } from '../controllers/deviceSessionController';
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

// ─── PIN Management & Chat Locking ─────────────────────────────────────────
// POST /api/users/me/set-pin
router.post('/me/set-pin', setPin);

// POST /api/users/me/verify-pin
router.post('/me/verify-pin', verifyPin);

// PATCH /api/users/me/toggle-lock
router.patch('/me/toggle-lock', toggleLock);

// POST /api/users/me/forgot-pin
router.post('/me/forgot-pin', forgotPin);

// POST /api/users/me/reset-pin
router.post('/me/reset-pin', resetPin);

// GET /api/users/search?q=...
router.get('/search', searchUsersHandler);

// ─── Device Sessions (temporary workaround) ────────────────────────────────
// GET /api/users/device-sessions - Get all device sessions for current user
router.get('/device-sessions', getDeviceSessions);

// GET /api/users/device-sessions/debug - Debug session fingerprint info
router.get('/device-sessions/debug', debugSessionInfo);

// POST /api/users/device-sessions/cleanup - Clean up duplicate sessions
router.post('/device-sessions/cleanup', cleanupDuplicateDeviceSessions);

// DELETE /api/users/device-sessions/:sessionId - Revoke specific device session
router.delete('/device-sessions/:sessionId', revokeSession);

// DELETE /api/users/device-sessions/others/all - Revoke all other device sessions
router.delete('/device-sessions/others/all', revokeAllOtherDeviceSessions);

// GET /api/users/:uid
router.get('/:uid', getUserProfile);

export default router;
