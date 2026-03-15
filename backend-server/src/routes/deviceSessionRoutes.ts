import { Router } from 'express';
import { getDeviceSessions, revokeSession, revokeAllOtherDeviceSessions } from '../controllers/deviceSessionController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/device-sessions - Get all device sessions for current user
router.get('/', getDeviceSessions);

// DELETE /api/device-sessions/others/all - Revoke all other device sessions
router.delete('/others/all', revokeAllOtherDeviceSessions);

// DELETE /api/device-sessions/:sessionId - Revoke specific device session
router.delete('/:sessionId', revokeSession);

export default router;