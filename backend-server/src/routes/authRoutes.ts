import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { generateCustomToken, switchAccount, refreshToken } from '../controllers/authController';
import { 
  initiateDesktopGoogleLogin, 
  handleDesktopGoogleCallback,
  initiateDesktopGithubLogin,
  handleDesktopGithubCallback
} from '../controllers/desktopAuthController';

const router = Router();

// Standard Auth
router.post('/custom-token', authenticateToken, generateCustomToken);
router.post('/switch-account', authenticateToken, switchAccount);
router.post('/refresh-token', authenticateToken, refreshToken);

// Desktop OAuth (System Browser Flow)
router.get('/desktop/google', initiateDesktopGoogleLogin);
router.get('/desktop/google/callback', handleDesktopGoogleCallback);

router.get('/desktop/github', initiateDesktopGithubLogin);
router.get('/desktop/github/callback', handleDesktopGithubCallback);

export default router;
