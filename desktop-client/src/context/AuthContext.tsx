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
} from '../services/firebaseService';
import { syncUserProfile } from '../services/apiService';
import { initSocket, disconnectSocket } from '../services/socketService';
import { clearAllKeys } from '../services/encryptionService';
import { requestNotificationPermission } from '../services/notificationService';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  loginWithGoogle: () => Promise<void>;
  loginWithGithub: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const pendingDisplayNameRef = useRef<string | null>(null);
  const { setCurrentUser, setLoading, setError, logout: storeLogout } = useAuthStore();
  const { setUserProfile } = useChatStore();

  useEffect(() => {
    const unsubscribe = onAuthChange(async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // ── Step 1: Unblock the UI immediately with data we already have ──────
        // Firebase resolves the cached auth state from local storage in ~50-100ms.
        // Setting currentUser here removes the loading screen right away instead of
        // waiting for backend HTTP + Firestore calls (which take 3-5 seconds).
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
        setUserProfile(immediateProfile); // Also update chat store cache
        setLoading(false);

        // ── Step 2: Background sync — enrich profile without blocking the UI ──
        (async () => {
          try {
            const token = await fbUser.getIdToken();
            initSocket(token);
            requestNotificationPermission().catch(() => {});

            // Try to sync with backend
            let userProfile = null;
            try {
              const response = await syncUserProfile(
                displayName,
                fbUser.email || '',
                fbUser.photoURL || '',
              );
              if (response.success && response.data) {
                userProfile = response.data;
              }
            } catch (syncErr) {
              console.warn('[Auth] Backend sync failed, continuing offline:', syncErr);
            }

            // Always write to Firestore directly (ensures user is searchable by others)
            try {
              const fsProfile = await upsertUserProfile(fbUser, displayName);
              if (!userProfile) userProfile = fsProfile;
            } catch (fsErr) {
              console.warn('[Auth] Firestore write failed:', fsErr);
            }

            // Update with the richer profile once the background sync completes
            if (userProfile) {
              setCurrentUser(userProfile);
              setUserProfile(userProfile); // Also update chat store cache
              useChatStore.getState().setPinnedChatIds(userProfile.pinnedChatIds ?? []);
              useChatStore.getState().setArchivedChatIds(userProfile.archivedChatIds ?? []);
              useChatStore.getState().setNicknames(userProfile.nicknames ?? {});
            }
            
            // Clear pending name after sync completes
            if (pendingDisplayNameRef.current) {
              pendingDisplayNameRef.current = null;
            }
          } catch (err) {
            console.error('[Auth] Background sync failed:', err);
          }
        })();
      } else {
        setCurrentUser(null);
        disconnectSocket();
        clearAllKeys();
      }
    });

    return unsubscribe;
  }, [setCurrentUser, setLoading, setError]);

  const loginWithGoogle = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
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

  const logout = async (): Promise<void> => {
    try {
      await signOutUser();
      disconnectSocket();
      clearAllKeys();
      storeLogout();
    } catch (err) {
      console.error('[Auth] Logout error:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, loginWithGoogle, loginWithGithub, loginWithEmail, registerWithEmail, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
