import { firebaseAuth, setCachedToken, signInWithCustomToken } from './firebaseService';
import { StoredAccount } from '../store/multiAccountStore';
import { multiAccountAuthService } from './multiAccountAuthService';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/**
 * Refresh the access token for an account by requesting a new custom token from backend
 * This allows long-term sessions without forcing re-login
 */
export const refreshAccountToken = async (uid: string, oldToken: string): Promise<string> => {
  try {
    console.log('[MultiAccount] Refreshing token for account:', uid);
    
    // Request a new custom token from backend using the old token
    const response = await fetch(`${API_BASE}/api/auth/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${oldToken}`
      },
      body: JSON.stringify({ uid })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error('[MultiAccount] API error text:', errText);
      throw new Error(`Failed to refresh token: ${response.status} ${errText}`);
    }
    
    const data = await response.json();
    if (data.success && data.data?.token) {
      console.log('[MultiAccount] Backend issued new custom token. Exchanging for ID token...');
      const fbUser = await signInWithCustomToken(data.data.token);
      const freshIdToken = await fbUser.getIdToken(true);
      console.log('[MultiAccount] Token refreshed and exchanged successfully');
      return freshIdToken;
    } else {
      throw new Error(data.error || 'Failed to parse refresh token response');
    }
  } catch (error) {
    console.error('[MultiAccount] Token refresh failed:', error);
    throw error;
  }
};

/**
 * Switch to a different account using stored token
 * This allows seamless switching without re-entering password
 * Automatically refreshes expired tokens
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
    
    let accessToken = targetAccount.accessToken;
    
    // Check if token is still valid by trying to use it
    try {
      const response = await fetch(`${API_BASE}/api/users/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        console.warn('[MultiAccount] Stored token is expired, attempting refresh...');
        
        // Try to refresh the token
        try {
          accessToken = await refreshAccountToken(targetAccount.uid, accessToken);
          
          // Update the stored token
          await multiAccountAuthService.addOrUpdateAccount({
            ...targetAccount,
            accessToken,
            lastUsed: new Date().toISOString()
          });
          
          console.log('[MultiAccount] Token refreshed and updated in storage');
        } catch (refreshError) {
          console.error('[MultiAccount] Token refresh failed:', refreshError);
          throw refreshError;
        }
      } else {
        console.log('[MultiAccount] Token is valid');
      }
    } catch (error) {
      console.error('[MultiAccount] Token validation failed:', error);
      throw error;
    }
    
    // Set the account as active
    await multiAccountAuthService.setActiveAccount(targetAccount.uid);
    
    // Set the cached token for API calls
    setCachedToken(accessToken);
    
    console.log(`[MultiAccount] Successfully switched to account: ${account.email}`);
    return true;
  } catch (error) {
    console.error('[MultiAccount] Failed to switch account:', error);
    throw error;
  }
};

/**
 * Check if user is already logged in with this account
 */
export const isAccountActive = (uid: string): boolean => {
  return firebaseAuth.currentUser?.uid === uid;
};
