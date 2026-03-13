import { firebaseAuth } from './firebaseService';
import { signInWithCredential, GoogleAuthProvider, GithubAuthProvider, EmailAuthProvider } from 'firebase/auth';
import { StoredAccount } from '../store/multiAccountStore';

/**
 * Switch to a different account using stored refresh token
 */
export const switchToAccount = async (account: StoredAccount): Promise<void> => {
  try {
    // Firebase doesn't expose refresh token directly, so we need to use custom token
    // For now, we'll sign out and require re-authentication
    // In production, you'd implement a custom token exchange with your backend
    
    // Note: Firebase doesn't allow direct refresh token usage from client
    // The refresh token is managed internally by Firebase SDK
    // We'll need to implement a different approach
    
    throw new Error('Account switching requires re-authentication. Please use "Add Account" to login again.');
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
