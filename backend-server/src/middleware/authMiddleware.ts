import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { extractBearerToken } from '../utils/helpers';
import logger from '../utils/logger';

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        name?: string;
      };
    }
  }
}

/**
 * Middleware that verifies Firebase ID token from Authorization header
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
