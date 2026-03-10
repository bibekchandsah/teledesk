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

export const cleanupDuplicateDeviceSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cleanupDuplicateSessions } = await import('../services/deviceSessionService');
    await cleanupDuplicateSessions(req.user!.uid);
    
    // Get updated session count
    const { getUserSessions } = await import('../services/deviceSessionService');
    const sessions = await getUserSessions(req.user!.uid);
    
    res.json({ 
      success: true, 
      message: 'Duplicate sessions cleaned up successfully',
      sessionCount: sessions.length
    });
  } catch (error) {
    logger.error(`cleanupDuplicateSessions error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to cleanup duplicate sessions' });
  }
};

export const debugSessionInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { extractClientIP } = await import('../utils/helpers');
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ipAddress = extractClientIP(req);
    const deviceFingerprint = Buffer.from(userAgent).toString('base64').slice(0, 30);
    const sessionFingerprint = `${req.user!.uid}_${deviceFingerprint}_${ipAddress}`;
    
    const { getSessionSockets } = await import('../sockets/socketManager');
    const { getUserSessions } = await import('../services/deviceSessionService');
    const sessionSockets = getSessionSockets();
    
    // Get all sessions for this user
    const allSessions = await getUserSessions(req.user!.uid);
    
    res.json({
      success: true,
      debug: {
        uid: req.user!.uid,
        userAgent: userAgent,
        userAgentBase64: deviceFingerprint,
        ipAddress,
        sessionFingerprint,
        currentSessionId: req.sessionId,
        socketMappings: Array.from(sessionSockets.entries()),
        hasActiveSocket: sessionSockets.has(sessionFingerprint),
        allSessions: allSessions.map(s => ({
          sessionId: s.sessionId,
          deviceName: s.deviceName,
          deviceType: s.deviceType,
          isCurrent: s.isCurrent,
          firebaseTokenId: s.firebaseTokenId,
          ipAddress: s.ipAddress,
          userAgent: s.userAgent.slice(0, 100)
        }))
      }
    });
  } catch (error) {
    logger.error(`debugSessionInfo error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get debug info' });
  }
};