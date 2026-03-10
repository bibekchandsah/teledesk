import { Request, Response } from 'express';
import { getUserSessions, revokeDeviceSession, revokeAllOtherSessions } from '../services/deviceSessionService';
import logger from '../utils/logger';

export const getDeviceSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessions = await getUserSessions(req.user!.uid);
    res.json({ success: true, data: sessions });
  } catch (error) {
    logger.error(`getDeviceSessions error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get device sessions' });
  }
};

export const revokeSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      res.status(400).json({ success: false, error: 'Session ID is required' });
      return;
    }

    const success = await revokeDeviceSession(req.user!.uid, sessionId);
    
    if (!success) {
      res.status(404).json({ success: false, error: 'Session not found or already revoked' });
      return;
    }

    res.json({ success: true, message: 'Session revoked successfully' });
  } catch (error) {
    logger.error(`revokeSession error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to revoke session' });
  }
};

export const revokeAllOtherDeviceSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentSessionId = req.sessionId;
    
    if (!currentSessionId) {
      res.status(400).json({ success: false, error: 'Current session not found' });
      return;
    }

    const revokedCount = await revokeAllOtherSessions(req.user!.uid, currentSessionId);
    
    res.json({ 
      success: true, 
      message: `${revokedCount} other sessions revoked successfully`,
      revokedCount 
    });
  } catch (error) {
    logger.error(`revokeAllOtherSessions error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to revoke other sessions' });
  }
};