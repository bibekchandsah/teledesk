import { Router } from 'express';
import { getLatestRelease } from '../controllers/updateController';

const router = Router();

// GET /api/updates/latest
router.get('/latest', getLatestRelease);

export default router;
