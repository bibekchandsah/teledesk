import { firebaseAuth } from './firebaseService';
import { signInWithCustomToken } from 'firebase/auth';
import { StoredAccount } from '../store/multiAccountStore';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/**
 * Switch to a different account using custom token
 * This allows seamless switching without re-entering password
 */
export const switchToAccount = async (account: StoredAccount): Promise<boolean> => {
  try {
    // Get current user's ID token
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) {
      throw new Error('No user logged in');
    }

    const idToken = await currentUser.getIdToken();

    // Request custom token for target account from backend
    const response = await fetch(`${API_BASE}/api/auth/switch-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        targetUid: account.uid,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to switch account');
    }

    const data = await response.json();
    const { customToken } = data.data;

    // Sign in with custom token (this switches the account)
    await signInWithCustomToken(firebaseAuth, customToken);

    console.log(`Successfully switched to account: ${account.email}`);
    return true;
  } catch (error) {
    console.error('Failed to switch account:', error);
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
