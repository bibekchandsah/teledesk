import { supabase } from '../config/supabase';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger';

export type VerificationType = 'otp' | 'link';
export type VerificationAction = 'delete_account' | 'reset_chat_pin' | 'app_lock' | 'two_factor';

export interface VerificationToken {
  id: string;
  user_id: string;
  token_hash: string;
  type: VerificationType;
  action: VerificationAction;
  expires_at: string;
  created_at: string;
  used_at: string | null;
}

/**
 * Generate a 6-digit OTP
 */
export const generateOtp = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate a secure long-form token for links
 */
export const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Create and store a verification token/OTP
 */
export const createVerificationToken = async (
  userId: string,
  type: VerificationType,
  action: VerificationAction,
  token: string,
  expiryMinutes: number = 10
): Promise<void> => {
  try {
    // 1. Invalidate any existing unused tokens of the same type and action for this user
    await supabase
      .from('verification_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('type', type)
      .eq('action', action)
      .is('used_at', null);

    // 2. Hash the token before storing
    const tokenHash = await bcrypt.hash(token, 10);
    
    // 3. Set expiry
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    // 4. Insert new token
    const { error } = await supabase.from('verification_tokens').insert({
      user_id: userId,
      token_hash: tokenHash,
      type,
      action,
      expires_at: expiresAt.toISOString(),
    });

    if (error) throw error;
  } catch (error) {
    logger.error(`Error creating verification token: ${(error as Error).message}`);
    throw new Error('Failed to create verification token');
  }
};

/**
 * Verify a token/OTP
 */
export const verifyToken = async (
  userId: string,
  type: VerificationType,
  action: VerificationAction,
  token: string
): Promise<boolean> => {
  try {
    // 1. Fetch the most recent unused and non-expired token for this user and action
    const { data: tokens, error } = await supabase
      .from('verification_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('type', type)
      .eq('action', action)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!tokens || tokens.length === 0) return false;

    const tokenRecord = tokens[0];

    // 2. Compare the provided token with the stored hash
    const isValid = await bcrypt.compare(token, tokenRecord.token_hash);

    if (isValid) {
      // 3. Mark as used
      await supabase
        .from('verification_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', tokenRecord.id);
    }

    return isValid;
  } catch (error) {
    logger.error(`Error verifying token: ${(error as Error).message}`);
    return false;
  }
};
