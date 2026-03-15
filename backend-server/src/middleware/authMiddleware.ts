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
      const crypto = require('crypto');
      const deviceFingerprint = crypto.createHash('md5').update(userAgent).digest('hex');
      const sessionFingerprint = `${decodedToken.uid}_${deviceFingerprint}_${ipAddress}`;
      
      // Log session fingerprint for debugging
      logger.debug(`HTTP auth session fingerprint: ${sessionFingerprint}, IP: ${ipAddress}, UA: ${userAgent.slice(0, 50)}...`);
      
      // Check if session exists for this fingerprint
      let session = await getSessionByTokenId(sessionFingerprint);
      
      if (session && session.isRevoked) {
        const authTimeMs = decodedToken.auth_time * 1000;
        const sessionLastActiveMs = new Date(session.lastActive).getTime();
        
        logger.debug(`Checking revoked session ${sessionFingerprint}. authTime: ${new Date(authTimeMs).toISOString()}, lastActive: ${session.lastActive}`);
        
        // If the token was issued AFTER the session was last active/revoked,
        // it signifies a legitimate re-login from the exact same device.
        if (authTimeMs > sessionLastActiveMs) {
          logger.info(`Un-revoking session ${sessionFingerprint} due to fresh login. (${authTimeMs} > ${sessionLastActiveMs})`);
          const { supabase } = await import('../config/supabase');
          await supabase.from('device_sessions').update({ is_revoked: false }).eq('firebase_token_id', sessionFingerprint);
          session.isRevoked = false;
        } else {
          // Reject the old hijacked/revoked session
          logger.warn(`Rejected HTTP request for session ${sessionFingerprint} because it is revoked. (authTime: ${authTimeMs} <= lastActive: ${sessionLastActiveMs})`);
          res.status(401).json({ success: false, error: 'SESSION_REVOKED', message: 'Your session has been revoked from another device.' });
          return;
        }
      }

      if (!session) {
        // Create new session
        session = await createDeviceSession(
          decodedToken.uid,
          sessionFingerprint,
          ipAddress,
          userAgent,
        );
      } else if (!session.isRevoked) {
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
      const crypto = require('crypto');
      const deviceFingerprint = crypto.createHash('md5').update(userAgent).digest('hex');
      sessionFingerprint = `${decoded.uid}_${deviceFingerprint}_${ipAddress}`;
      logger.debug(`Socket auth creating session fingerprint: ${sessionFingerprint}`);
      
      const { getSessionByTokenId } = await import('../services/deviceSessionService');
      const session = await getSessionByTokenId(sessionFingerprint);
      
      if (session && session.isRevoked) {
        const authTimeMs = decoded.auth_time * 1000;
        const sessionLastActiveMs = new Date(session.lastActive).getTime();
        
        if (authTimeMs > sessionLastActiveMs) {
          logger.info(`Un-revoking Socket session ${sessionFingerprint} due to fresh login.`);
          const { supabase } = await import('../config/supabase');
          await supabase.from('device_sessions').update({ is_revoked: false }).eq('firebase_token_id', sessionFingerprint);
        } else {
          logger.warn(`Rejected Socket connection for session ${sessionFingerprint} because it is revoked.`);
          return null; // Deny socket connection
        }
      }
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
