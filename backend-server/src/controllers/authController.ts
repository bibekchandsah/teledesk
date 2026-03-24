import { Request, Response } from 'express';
import { auth } from '../config/firebase';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';
import { extractBearerToken, extractClientIP } from '../utils/helpers';
import { getSessionByTokenId, updateSessionActivity } from '../services/deviceSessionService';

/**
 * Generate a custom token for the authenticated user
 * This allows seamless account switching without re-entering password
 */
export const generateCustomToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user?.uid;
    
    if (!uid) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    // Generate custom token for this user
    const customToken = await auth.createCustomToken(uid);
    
    logger.info(`Generated custom token for user: ${uid}`);
    
    res.json({
      success: true,
      data: { customToken, uid },
    });
  } catch (error) {
    logger.error(`Failed to generate custom token: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to generate custom token',
    });
  }
};

let certsCache: Record<string, string> | null = null;
let certsExpiry = 0;

async function getFirebasePublicKeys() {
  if (certsCache && Date.now() < certsExpiry) return certsCache;
  const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 3600000;
  certsExpiry = Date.now() + maxAge;
  certsCache = (await res.json()) as Record<string, string>;
  return certsCache;
}

/**
 * Refresh the access token for the authenticated user
 * This allows long-term sessions without forcing re-login
 * Safely accepts expired ID tokens if they match a valid device session
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    
    if (!token) {
      res.status(401).json({ success: false, error: 'No authorization token provided' });
      return;
    }

    let decodedUid: string;
    try {
      // Decode without verification first to get the kid
      const decodedHeader = jwt.decode(token, { complete: true });
      if (!decodedHeader || typeof decodedHeader === 'string' || !decodedHeader.header.kid) {
        throw new Error('Invalid token format');
      }

      const certs = await getFirebasePublicKeys();
      const cert = certs[decodedHeader.header.kid];
      if (!cert) throw new Error('Firebase public key not found');

      const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
      if (!projectId) throw new Error('Firebase project ID is not configured');
      
      // Verify signature, but allow expired tokens
      const verified = jwt.verify(token, cert, {
        algorithms: ['RS256'],
        ignoreExpiration: true,
        audience: projectId,
        issuer: `https://securetoken.google.com/${projectId}`
      }) as { user_id?: string, uid?: string, sub?: string };
      
      decodedUid = verified.user_id || verified.uid || verified.sub || '';
      if (!decodedUid) throw new Error('No UID in token payload');
    } catch (verifyError) {
      logger.error(`Token signature verification failed during refresh: ${(verifyError as Error).message}`);
      res.status(401).json({ success: false, error: 'Invalid token signature' });
      return;
    }

    // Verify session fingerprint against the database
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ipAddress = extractClientIP(req);
    const crypto = await import('crypto');
    const deviceFingerprint = crypto.createHash('md5').update(userAgent).digest('hex');
    const sessionFingerprint = `${decodedUid}_${deviceFingerprint}_${ipAddress}`;

    logger.debug(`[AuthRefresh] Attempting refresh for UID: ${decodedUid}`);
    logger.debug(`[AuthRefresh] IP: ${ipAddress}, UA: ${userAgent.slice(0, 50)}...`);
    logger.debug(`[AuthRefresh] Calculated Fingerprint: ${sessionFingerprint}`);

    const session = await getSessionByTokenId(sessionFingerprint);
    if (!session || session.isRevoked) {
      logger.warn(`Refresh rejected: Session ${sessionFingerprint} is ${!session ? 'not found' : 'revoked'}.`);
      res.status(401).json({ success: false, error: 'SESSION_REVOKED', message: 'Your session has been revoked or expired.' });
      return;
    }

    // Verify the user still exists in Firebase
    try {
      await auth.getUser(decodedUid);
    } catch (error) {
      res.status(404).json({ success: false, error: 'User not found in Firebase' });
      return;
    }

    // Generate a fresh custom token
    const customToken = await auth.createCustomToken(decodedUid);
    
    // Update session activity so it stays alive
    await updateSessionActivity(sessionFingerprint);
    
    logger.info(`Securely refreshed token for user: ${decodedUid}`);
    
    res.json({
      success: true,
      data: { token: customToken, uid: decodedUid },
    });
  } catch (error) {
    logger.error(`Failed to refresh token: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token',
    });
  }
};

/**
 * Switch to another account
 * Validates the target account and generates a custom token
 */
export const switchAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUid = req.user?.uid;
    const { targetUid } = req.body;
    
    if (!currentUid) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    if (!targetUid) {
      res.status(400).json({ success: false, error: 'Target UID required' });
      return;
    }

    // Verify the target user exists
    try {
      await auth.getUser(targetUid);
    } catch (error) {
      res.status(404).json({ success: false, error: 'Target user not found' });
      return;
    }

    // Generate custom token for the target user
    const customToken = await auth.createCustomToken(targetUid);
    
    logger.info(`User ${currentUid} switching to account ${targetUid}`);
    
    res.json({
      success: true,
      data: { customToken, uid: targetUid },
    });
  } catch (error) {
    logger.error(`Failed to switch account: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to switch account',
    });
  }
};
