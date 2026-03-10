import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { extractBearerToken, extractClientIP } from '../utils/helpers';
import logger from '../utils/logger';
import { createDeviceSession, updateSessionActivity, getSessionByTokenId, cleanupDuplicateSessions } from '../services/deviceSessionService';

// Extend Express Request to include authenticated user and session
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        name?: string;
      };
      sessionId?: string;
    }
  }
}

/**
 * Middleware that verifies Firebase ID token from Authorization header
 * and tracks device sessions
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({ success: false, error: 'No authorization token provided' });
    return;
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
    };

    // Track device session (optional - don't fail auth if this fails)
    try {
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const ipAddress = extractClientIP(req);
      
      // Create a stable session identifier based on user, device, and location
      // This will be the same for the same user on the same device/browser
      // Include more device-specific info to differentiate between devices on same network
      const deviceFingerprint = Buffer.from(userAgent).toString('base64').slice(0, 30); // Increased from 20 to 30
      const sessionFingerprint = `${decodedToken.uid}_${deviceFingerprint}_${ipAddress}`;
      
      // Log session fingerprint for debugging
      logger.debug(`HTTP auth session fingerprint: ${sessionFingerprint}, IP: ${ipAddress}, UA: ${userAgent.slice(0, 50)}...`);
      
      // Check if session exists for this fingerprint
      let session = await getSessionByTokenId(sessionFingerprint);
      
      if (!session) {
        // Create new session
        session = await createDeviceSession(
          decodedToken.uid,
          sessionFingerprint,
          ipAddress,
          userAgent,
        );
      } else {
        // Update existing session activity
        await updateSessionActivity(sessionFingerprint);
      }
      
      req.sessionId = session.sessionId;
    } catch (sessionError) {
      // Log the error but don't fail authentication
      logger.warn(`Device session tracking failed: ${(sessionError as Error).message}`);
    }
    
    next();
  } catch (error) {
    logger.warn(`Token verification failed: ${(error as Error).message}`);
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

/**
 * Socket.io authentication middleware
 */
export const authenticateSocket = async (
  token: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<{ uid: string; email?: string; name?: string; sessionFingerprint?: string } | null> => {
  if (!token) return null;
  try {
    const decoded = await auth.verifyIdToken(token);
    
    // Create session fingerprint if we have the required info
    let sessionFingerprint: string | undefined;
    if (userAgent && ipAddress) {
      const deviceFingerprint = Buffer.from(userAgent).toString('base64').slice(0, 30); // Increased from 20 to 30
      sessionFingerprint = `${decoded.uid}_${deviceFingerprint}_${ipAddress}`;
      logger.debug(`Socket auth creating session fingerprint: ${sessionFingerprint}`);
    }
    
    return { 
      uid: decoded.uid, 
      email: decoded.email, 
      name: decoded.name,
      sessionFingerprint 
    };
  } catch {
    return null;
  }
};
