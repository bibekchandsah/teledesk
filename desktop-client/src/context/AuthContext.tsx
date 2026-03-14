import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  onAuthChange,
  signInWithGoogle,
  signInWithGithub,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  getUserProfile,
  upsertUserProfile,
  signInWithCustomToken,
} from '../services/firebaseService';
import { syncUserProfile, get2FAStatus } from '../services/apiService';
import { initSocket, disconnectSocket } from '../services/socketService';
import { clearAllKeys } from '../services/encryptionService';
import { requestNotificationPermission } from '../services/notificationService';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useMultiAccountStore } from '../store/multiAccountStore';
import TwoFactorVerifyModal from '../components/modals/TwoFactorVerifyModal';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  loginWithGoogle: () => Promise<void>;
  loginWithGithub: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name: string) => Promise<void>;
  logout: (switchingAccount?: boolean) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [show2FAVerify, setShow2FAVerify] = useState(false);
  const [pending2FAUser, setPending2FAUser] = useState<FirebaseUser | null>(null);
  const pendingDisplayNameRef = useRef<string | null>(null);
  const { setCurrentUser, setLoading, setError, logout: storeLogout } = useAuthStore();
  const { setUserProfile } = useChatStore();
  const { addAccount, setActiveAccount } = useMultiAccountStore();

  // Check if user has verified 2FA in this session
  const is2FAVerifiedInSession = (uid: string): boolean => {
    try {
      const verified = sessionStorage.getItem('2fa_verified_uid');
      return verified === uid;
    } catch {
      return false;
    }
  };

  // Mark user as 2FA verified in this session
  const mark2FAVerified = (uid: string): void => {
    try {
      sessionStorage.setItem('2fa_verified_uid', uid);
    } catch (err) {
      console.error('Failed to save 2FA session:', err);
    }
  };

  // Clear 2FA verification status
  const clear2FAVerification = (): void => {
    try {
      sessionStorage.removeItem('2fa_verified_uid');
    } catch (err) {
      console.error('Failed to clear 2FA session:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthChange(async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // Check if user already verified 2FA in this session
        if (is2FAVerifiedInSession(fbUser.uid)) {
          // Already verified in this session, proceed with login
          await completeLogin(fbUser);
          return;
        }

        // Check if 2FA is enabled for this user
        try {
          const token = await fbUser.getIdToken();
          const result = await get2FAStatus();
          
          if (result.success && result.data?.enabled) {
            // 2FA is enabled - show verification modal
            setPending2FAUser(fbUser);
            setShow2FAVerify(true);
            setLoading(false);
            return; // Don't proceed with login until 2FA is verified
          }
        } catch (err) {
          console.error('[Auth] Failed to check 2FA status:', err);
          // Continue with login if 2FA check fails
        }

        // No 2FA or 2FA check failed - proceed with normal login
        await completeLogin(fbUser);
      } else {
        setCurrentUser(null);
        disconnectSocket();
        clearAllKeys();
        // Clear 2FA session tracking on logout
        clear2FAVerification();
      }
    });

    return unsubscribe;
  }, [setCurrentUser, setLoading, setError]);

  // Complete login after 2FA verification (or if 2FA not enabled)
  const completeLogin = async (fbUser: FirebaseUser) => {
    // ── Step 1: Unblock the UI immediately with data we already have ──────
    const displayName = fbUser.displayName || pendingDisplayNameRef.current || 'User';
    const immediateProfile = {
      uid: fbUser.uid,
      name: displayName,
      email: fbUser.email || '',
      avatar: fbUser.photoURL || '',
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      onlineStatus: 'online' as const,
    };
    setCurrentUser(immediateProfile);
    setUserProfile(immediateProfile);
    setLoading(false);

    // ── Step 2: Background sync ──
    (async () => {
      try {
        const token = await fbUser.getIdToken();
        initSocket(token);
        requestNotificationPermission().catch(() => {});

        let userProfile = null;
        try {
          const response = await syncUserProfile(displayName, fbUser.email || '', fbUser.photoURL || '');
          if (response.success && response.data) {
            userProfile = response.data;
          }
        } catch (syncErr) {
          console.warn('[Auth] Backend sync failed:', syncErr);
        }

        try {
          const fsProfile = await upsertUserProfile(fbUser, displayName);
          if (!userProfile) userProfile = fsProfile;
        } catch (fsErr) {
          console.warn('[Auth] Firestore write failed:', fsErr);
        }

        if (userProfile) {
          setCurrentUser(userProfile);
          setUserProfile(userProfile);
          useChatStore.getState().setPinnedChatIds(userProfile.pinnedChatIds ?? []);
          useChatStore.getState().setArchivedChatIds(userProfile.archivedChatIds ?? []);
          useChatStore.getState().setLockedChatIds(userProfile.lockedChatIds ?? []);
          useChatStore.getState().setNicknames(userProfile.nicknames ?? {});
          
          addAccount({
            uid: userProfile.uid,
            email: userProfile.email,
            name: userProfile.name,
            avatar: userProfile.avatar,
            refreshToken: fbUser.uid,
            lastUsed: new Date().toISOString(),
          });
          setActiveAccount(userProfile.uid);
        }
        
        if (pendingDisplayNameRef.current) {
          pendingDisplayNameRef.current = null;
        }
      } catch (err) {
        console.error('[Auth] Background sync failed:', err);
      }
    })();
  };

  // Handle external auth tokens (Deep Linking)
  useEffect(() => {
    if (window.electronAPI) {
      const cleanup = window.electronAPI.onAuthExternalToken(async (token: string) => {
        console.log('[Auth] Received external auth token');
        try {
          setLoading(true);
          setError(null);
          
          const startSignIn = Date.now();
          await signInWithCustomToken(token);
          console.log(`[Auth] Firebase sign-in finished in ${Date.now() - startSignIn}ms`);
          
          // The onAuthChange effect will handle the rest of the sync.
          // For deletion re-auth, simply signing in with the fresh token is enough
          // to update the "recent login" requirement.
        } catch (err) {
          console.error('[Auth] External token login failed:', err);
          setLoading(false);
          setError((err as Error).message);
        }
      });
      return cleanup;
    }
  }, [setLoading, setError]);

  const loginWithGoogle = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // If in Electron, use the system browser
      if (window.electronAPI) {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        await window.electronAPI.openExternalUrl(`${BACKEND_URL}/api/auth/desktop/google`);
        return;
      }

      await signInWithGoogle();
    } catch (err) {
      setLoading(false);
      setError((err as Error).message);
    }
  };

  const loginWithGithub = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // If in Electron, use the system browser
      if (window.electronAPI) {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        await window.electronAPI.openExternalUrl(`${BACKEND_URL}/api/auth/desktop/github`);
        return;
      }

      await signInWithGithub();
    } catch (err) {
      setLoading(false);
      setError((err as Error).message);
    }
  };

  const loginWithEmail = async (email: string, password: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await signInWithEmail(email, password);
    } catch (err) {
      setLoading(false);
      setError((err as Error).message);
    }
  };

  const registerWithEmail = async (email: string, password: string, name: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      // Store the intended name before registration
      pendingDisplayNameRef.current = name;
      await signUpWithEmail(email, password, name);
    } catch (err) {
      setLoading(false);
      setError((err as Error).message);
      // Clear pending name on error
      pendingDisplayNameRef.current = null;
    }
  };

  const logout = async (switchingAccount = false): Promise<void> => {
    try {
      await signOutUser();
      disconnectSocket();
      clearAllKeys();
      storeLogout();
      
      // Clear 2FA session tracking
      clear2FAVerification();
      
      // Don't clear multi-account store when switching accounts
      if (!switchingAccount) {
        // User is fully logging out, not switching
        // Keep accounts stored for quick re-login
      }
    } catch (err) {
      console.error('[Auth] Logout error:', err);
    }
  };

  const handle2FASuccess = async () => {
    setShow2FAVerify(false);
    if (pending2FAUser) {
      // Mark this session as verified
      mark2FAVerified(pending2FAUser.uid);
      await completeLogin(pending2FAUser);
      setPending2FAUser(null);
    }
  };

  const handle2FACancel = async () => {
    setShow2FAVerify(false);
    setPending2FAUser(null);
    // Sign out the user since they cancelled 2FA
    await signOutUser();
  };

  return (
    <>
      <AuthContext.Provider value={{ firebaseUser, loginWithGoogle, loginWithGithub, loginWithEmail, registerWithEmail, logout, isLoading: useAuthStore.getState().isLoading }}>
        {children}
      </AuthContext.Provider>

      {/* 2FA Verification Modal */}
      {show2FAVerify && (
        <TwoFactorVerifyModal
          onSuccess={handle2FASuccess}
          onCancel={handle2FACancel}
        />
      )}
    </>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
