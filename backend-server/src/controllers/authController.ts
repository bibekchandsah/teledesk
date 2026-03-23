import { Request, Response } from 'express';
import { auth } from '../config/firebase';
import logger from '../utils/logger';

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

/**
 * Refresh the access token for the authenticated user
 * This allows long-term sessions without forcing re-login
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user?.uid;
    
    if (!uid) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    // Verify the user still exists
    try {
      await auth.getUser(uid);
    } catch (error) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Generate a fresh custom token
    const customToken = await auth.createCustomToken(uid);
    
    logger.info(`Refreshed token for user: ${uid}`);
    
    res.json({
      success: true,
      data: { token: customToken, uid },
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
