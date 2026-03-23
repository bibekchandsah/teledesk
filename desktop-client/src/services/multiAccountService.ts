import { firebaseAuth, setCachedToken } from './firebaseService';
import { signInWithCustomToken } from 'firebase/auth';
import { StoredAccount } from '../store/multiAccountStore';
import { multiAccountAuthService } from './multiAccountAuthService';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/**
 * Switch to a different account using stored token
 * This allows seamless switching without re-entering password
 */
export const switchToAccount = async (account: StoredAccount): Promise<boolean> => {
  try {
    console.log('[MultiAccount] Switching to account:', account.email);
    
    // Get the account data from multi-account storage
    const allAccounts = await multiAccountAuthService.getAllAccounts();
    const targetAccount = allAccounts.find(a => a.uid === account.uid);
    
    if (!targetAccount) {
      throw new Error('Account not found in storage');
    }
    
    // Set the account as active
    await multiAccountAuthService.setActiveAccount(targetAccount.uid);
    
    // Set the cached token for API calls
    setCachedToken(targetAccount.accessToken);
    
    console.log(`[MultiAccount] Successfully switched to account: ${account.email}`);
    return true;
  } catch (error) {
    console.error('[MultiAccount] Failed to switch account:', error);
    throw error;
  }
};

/**
 * Get current Firebase refresh token (for storage)
 * Note: This is a workaround since Firebase doesn't expose refresh tokens directly
 */
export const getCurrentRefreshToken = async (): Promise<string> => {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('No user logged in');
  
  // Firebase manages refresh tokens internally
  // We'll use the UID as a placeholder and rely on Firebase's persistence
  return user.uid;
};

/**
 * Check if user is already logged in with this account
 */
export const isAccountActive = (uid: string): boolean => {
  return firebaseAuth.currentUser?.uid === uid;
};
