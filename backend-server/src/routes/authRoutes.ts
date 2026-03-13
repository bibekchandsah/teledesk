import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { generateCustomToken, switchAccount } from '../controllers/authController';

const router = Router();

// Generate custom token for account switching
router.post('/custom-token', authenticateToken, generateCustomToken);

// Switch account (validates and returns custom token)
router.post('/switch-account', authenticateToken, switchAccount);

export default router;
