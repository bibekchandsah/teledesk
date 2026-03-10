import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { extractBearerToken } from '../utils/helpers';
import logger from '../utils/logger';
import { createDeviceSession, updateSessionActivity, getSessionByTokenId } from '../services/deviceSessionService';

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
      const ipAddress = req.ip || 
                       req.connection.remoteAddress || 
                       req.socket.remoteAddress || 
                       (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
                       '127.0.0.1';
      
      // Use a combination of token hash and user ID as session identifier
      const tokenId = decodedToken.jti || `${decodedToken.uid}_${token.slice(-10)}`;
      
      // Check if session exists for this token
      let session = await getSessionByTokenId(tokenId);
      
      if (!session) {
        // Create new session
        session = await createDeviceSession(
          decodedToken.uid,
          tokenId,
          ipAddress,
          userAgent,
        );
      } else {
        // Update existing session activity
        await updateSessionActivity(tokenId);
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
): Promise<{ uid: string; email?: string; name?: string } | null> => {
  if (!token) return null;
  try {
    const decoded = await auth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email, name: decoded.name };
  } catch {
    return null;
  }
};
