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
  firebaseAuth,
  setCachedToken,
  refreshIdToken,
} from '../services/firebaseService';
import { syncUserProfile, get2FAStatus } from '../services/apiService';
import { initSocket, disconnectSocket } from '../services/socketService';
import { clearAllKeys } from '../services/encryptionService';
import { requestNotificationPermission } from '../services/notificationService';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useMultiAccountStore } from '../store/multiAccountStore';
import { sharedAuthService, SharedAuthData } from '../services/sharedAuthService';
import { multiAccountAuthService, AccountData } from '../services/multiAccountAuthService';
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
  const isManualLoginRef = useRef(false); // Track if this is a manual login vs auto-restore
  const { setCurrentUser, setLoading, setError, logout: storeLogout } = useAuthStore();
  const { setUserProfile } = useChatStore();
  const { addAccount, setActiveAccount } = useMultiAccountStore();

  // Initialize auth on mount - check multi-account storage first
  useEffect(() => {
    console.log('[Auth] Initializing authentication...');
    
    const initializeAuth = async () => {
      try {
        // First, try to restore from multi-account storage
        console.log('[Auth] Checking multi-account storage...');
        const activeAccount = await multiAccountAuthService.getActiveAccount();
        const allAccounts = await multiAccountAuthService.getAllAccounts();
        
        // Sync accounts to Zustand store for UI
        if (allAccounts && allAccounts.length > 0) {
          console.log('[Auth] Syncing', allAccounts.length, 'accounts to Zustand store');
          allAccounts.forEach(account => {
            addAccount({
              uid: account.uid,
              email: account.email,
              name: account.name,
              avatar: account.avatar,
              refreshToken: account.uid, // Use uid as placeholder
              lastUsed: account.lastUsed,
            });
          });
          
          if (activeAccount) {
            setActiveAccount(activeAccount.uid);
          }
        }
        
        if (activeAccount) {
          console.log('[Auth] Found active account, restoring user profile...', activeAccount.email);
          
          // Set the cached token for API calls
          setCachedToken(activeAccount.accessToken);
          console.log('[Auth] Cached token set from multi-account storage');
          
          // Restore user profile immediately for better UX
          const userProfile = {
            uid: activeAccount.uid,
            name: activeAccount.name,
            email: activeAccount.email,
            avatar: activeAccount.avatar,
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            onlineStatus: 'online' as const,
          };
          
          setCurrentUser(userProfile);
          setUserProfile(userProfile);
          setLoading(false);
          
          // Try to initialize socket with the cached token
          try {
            initSocket(activeAccount.accessToken);
            console.log('[Auth] Socket initialized with cached token');
          } catch (socketError) {
            console.warn('[Auth] Failed to initialize socket:', socketError);
          }
          
          console.log('[Auth] User profile restored from multi-account storage');
        } else {
          console.log('[Auth] No active account found - user may be adding new account');
          setLoading(false);
        }
      } catch (error) {
        console.error('[Auth] Failed to initialize auth:', error);
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for account updates from other instances
    const unsubscribeMultiAccount = multiAccountAuthService.onAccountUpdate(async (accountsData) => {
      console.log('[MultiAccountAuth] Received account update from another instance');
      
      if (accountsData && accountsData.accounts && accountsData.accounts.length > 0) {
        // Sync accounts to Zustand store
        console.log('[Auth] Syncing', accountsData.accounts.length, 'accounts to Zustand store');
        accountsData.accounts.forEach(account => {
          addAccount({
            uid: account.uid,
            email: account.email,
            name: account.name,
            avatar: account.avatar,
            refreshToken: account.uid,
            lastUsed: account.lastUsed,
          });
        });
        
        if (accountsData.activeAccountUid) {
          const activeAccount = accountsData.accounts.find(a => a.uid === accountsData.activeAccountUid);
          
          if (activeAccount) {
            console.log('[MultiAccountAuth] Applying account update:', activeAccount.email);
            
            // Update Zustand store
            setActiveAccount(activeAccount.uid);
            
            // Only update if we don't already have this user active
            const currentAuthState = useAuthStore.getState();
            if (!currentAuthState.currentUser || currentAuthState.currentUser.uid !== activeAccount.uid) {
              // Set cached token
              setCachedToken(activeAccount.accessToken);
              
              const userProfile = {
                uid: activeAccount.uid,
                name: activeAccount.name,
                email: activeAccount.email,
                avatar: activeAccount.avatar,
                createdAt: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                onlineStatus: 'online' as const,
              };
              
              setCurrentUser(userProfile);
              setUserProfile(userProfile);
              setLoading(false);
              
              // Reinitialize socket with new token
              disconnectSocket();
              initSocket(activeAccount.accessToken);
            }
          }
        }
      } else if (accountsData === null || (accountsData.accounts && accountsData.accounts.length === 0)) {
        console.log('[MultiAccountAuth] Received logout from another instance');
        setCachedToken(null);
        setCurrentUser(null);
        disconnectSocket();
        clearAllKeys();
      } else if (accountsData && !accountsData.activeAccountUid) {
        console.log('[MultiAccountAuth] No active account - user may be adding new account');
        // Don't clear current user, just don't auto-restore
      }
    });

    return unsubscribeMultiAccount;
  }, [setCurrentUser, setUserProfile, setLoading, addAccount, setActiveAccount]);

  useEffect(() => {
    const unsubscribe = onAuthChange(async (fbUser) => {
      console.log('[Firebase] Auth state changed:', fbUser ? 'User logged in' : 'User logged out');
      setFirebaseUser(fbUser);

      if (fbUser) {
        // Only check 2FA on manual login, not on page reload/auto-restore
        if (isManualLoginRef.current) {
          // This is a manual login - check if 2FA is enabled
          try {
            const token = await fbUser.getIdToken();
            const result = await get2FAStatus();
            
            if (result.success && result.data?.enabled) {
              // 2FA is enabled - show verification modal
              setPending2FAUser(fbUser);
              setShow2FAVerify(true);
              setLoading(false);
              isManualLoginRef.current = false; // Reset flag
              return; // Don't proceed with login until 2FA is verified
            }
          } catch (err) {
            console.error('[Auth] Failed to check 2FA status:', err);
            // Continue with login if 2FA check fails
          }
          
          // Reset manual login flag
          isManualLoginRef.current = false;
        }

        // Firebase user is available - proceed with login
        await completeLogin(fbUser);
      } else {
        // User logged out - only clear if this is a manual logout AND we have a current user
        const currentUser = useAuthStore.getState().currentUser;
        
        // Don't clear auth if:
        // 1. We don't have a current user (startup state)
        // 2. This is not a manual logout (isManualLoginRef is false)
        if (currentUser && isManualLoginRef.current) {
          console.log('[Firebase] Manual logout detected, clearing shared auth');
          setCurrentUser(null);
          disconnectSocket();
          clearAllKeys();
          await sharedAuthService.clearAuthData();
          isManualLoginRef.current = false; // Reset flag
        } else {
          console.log('[Firebase] Ignoring logout - likely startup auth state or no current user');
        }
      }
    });

    return unsubscribe;
  }, [setCurrentUser, setLoading, setError]);

  // Proactively refresh the Firebase token every 50 minutes so it never expires
  // while the user is actively using the app. Firebase tokens last 1 hour.
  useEffect(() => {
    const REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minutes

    const interval = setInterval(async () => {
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser) return; // Not logged in, nothing to refresh

      const freshToken = await refreshIdToken();
      if (!freshToken) return;

      // Update the stored token so account switching and socket reconnects use the fresh one
      try {
        const stored = await multiAccountAuthService.getActiveAccount();
        if (stored) {
          await multiAccountAuthService.addOrUpdateAccount({ ...stored, accessToken: freshToken });
        }
      } catch (e) {
        console.warn('[Auth] Failed to update stored token after refresh:', e);
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, []);

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

    // Get token for storage
    const token = await fbUser.getIdToken();
    
    // Save to multi-account storage immediately
    const accountData: AccountData = {
      uid: fbUser.uid,
      email: fbUser.email || '',
      name: displayName,
      avatar: fbUser.photoURL || '',
      accessToken: token,
      lastUsed: new Date().toISOString(),
    };
    
    console.log('[Auth] Saving account to multi-account storage');
    await multiAccountAuthService.addOrUpdateAccount(accountData);
    
    // Also save to legacy shared auth for backward compatibility
    const sharedAuthData: SharedAuthData = {
      firebaseUser: {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        photoURL: fbUser.photoURL,
        accessToken: token,
      },
      currentUser: immediateProfile,
      isAuthenticated: true,
      lastUpdated: new Date().toISOString(),
    };
    await sharedAuthService.saveAuthData(sharedAuthData);

    // ── Step 2: Background sync ──
    (async () => {
      try {
        initSocket(token);
        requestNotificationPermission().catch(() => {});

        let userProfile = null;
        try {
          const response = await syncUserProfile(displayName, fbUser.email || '', fbUser.photoURL || '');
          if (response.success && response.data) {
            userProfile = response.data;
          } else if (response.error === 'SESSION_REVOKED') {
            console.error('[Auth] Session revoked during sync. Logging out...');
            await logout();
            return;
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

          // Update multi-account storage with complete profile
          const freshToken = await fbUser.getIdToken();
          const updatedAccountData: AccountData = {
            uid: userProfile.uid,
            email: userProfile.email,
            name: userProfile.name,
            avatar: userProfile.avatar,
            accessToken: freshToken,
            lastUsed: new Date().toISOString(),
          };
          await multiAccountAuthService.addOrUpdateAccount(updatedAccountData);
          
          // Update legacy shared auth
          const updatedSharedAuthData: SharedAuthData = {
            firebaseUser: {
              uid: fbUser.uid,
              email: fbUser.email,
              displayName: fbUser.displayName,
              photoURL: fbUser.photoURL,
              accessToken: freshToken,
            },
            currentUser: userProfile,
            isAuthenticated: true,
            lastUpdated: new Date().toISOString(),
          };
          await sharedAuthService.saveAuthData(updatedSharedAuthData);
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
      console.log('[Auth] Setting up deep link listener for external OAuth tokens');
      const cleanup = window.electronAPI.onAuthExternalToken(async (token: string) => {
        console.log('═══════════════════════════════════════════════════════');
        console.log('[Auth] 🎉 RECEIVED EXTERNAL AUTH TOKEN VIA DEEP LINK!');
        console.log('[Auth] Token length:', token?.length || 0);
        console.log('[Auth] Token preview:', token?.substring(0, 50) + '...');
        console.log('[Auth] Current loading state:', useAuthStore.getState().isLoading);
        console.log('[Auth] Current user:', useAuthStore.getState().currentUser?.email || 'none');
        console.log('═══════════════════════════════════════════════════════');
        
        try {
          setLoading(true);
          setError(null);
          isManualLoginRef.current = true; // Mark as manual login
          
          console.log('[Auth] Starting Firebase sign-in with custom token...');
          const startSignIn = Date.now();
          await signInWithCustomToken(token);
          console.log(`[Auth] ✓ Firebase sign-in finished in ${Date.now() - startSignIn}ms`);
          
          // The onAuthChange effect will handle the rest of the sync.
          // For deletion re-auth, simply signing in with the fresh token is enough
          // to update the "recent login" requirement.
        } catch (err) {
          console.error('[Auth] ✗ External token login failed:', err);
          setLoading(false);
          setError((err as Error).message);
          isManualLoginRef.current = false; // Reset on error
        }
      });
      return cleanup;
    } else {
      console.log('[Auth] Not in Electron, skipping deep link listener setup');
    }
  }, [setLoading, setError]);

  const loginWithGoogle = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      isManualLoginRef.current = true; // Mark as manual login

      // If in Electron, use the system browser
      if (window.electronAPI) {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        await window.electronAPI.openExternalUrl(`${BACKEND_URL}/api/auth/desktop/google`);
        // Don't clear loading here - the deep link callback will handle it
        // But set a timeout to clear loading if callback never arrives
        setTimeout(() => {
          if (useAuthStore.getState().isLoading && !useAuthStore.getState().currentUser) {
            console.warn('[Auth] Google OAuth timeout - clearing loading state');
            setLoading(false);
            setError('Authentication timed out. Please try again.');
            isManualLoginRef.current = false;
          }
        }, 60000); // 60 second timeout
        return;
      }

      await signInWithGoogle();
    } catch (err) {
      setLoading(false);
      setError((err as Error).message);
      isManualLoginRef.current = false; // Reset on error
    }
  };

  const loginWithGithub = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      isManualLoginRef.current = true; // Mark as manual login

      // If in Electron, use the system browser
      if (window.electronAPI) {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        await window.electronAPI.openExternalUrl(`${BACKEND_URL}/api/auth/desktop/github`);
        // Don't clear loading here - the deep link callback will handle it
        // But set a timeout to clear loading if callback never arrives
        setTimeout(() => {
          if (useAuthStore.getState().isLoading && !useAuthStore.getState().currentUser) {
            console.warn('[Auth] GitHub OAuth timeout - clearing loading state');
            setLoading(false);
            setError('Authentication timed out. Please try again.');
            isManualLoginRef.current = false;
          }
        }, 60000); // 60 second timeout
        return;
      }

      await signInWithGithub();
    } catch (err) {
      setLoading(false);
      setError((err as Error).message);
      isManualLoginRef.current = false; // Reset on error
    }
  };

  const loginWithEmail = async (email: string, password: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      isManualLoginRef.current = true; // Mark as manual login
      await signInWithEmail(email, password);
    } catch (err) {
      setLoading(false);
      setError((err as Error).message);
      isManualLoginRef.current = false; // Reset on error
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
      // Mark this as a manual logout
      isManualLoginRef.current = true;
      
      const currentUser = useAuthStore.getState().currentUser;
      
      await signOutUser();
      setCachedToken(null); // Clear cached token
      disconnectSocket();
      clearAllKeys();
      storeLogout();
      
      // Remove current account from multi-account storage
      if (currentUser && !switchingAccount) {
        await multiAccountAuthService.removeAccount(currentUser.uid);
      }
      
      // Clear legacy shared auth storage
      await sharedAuthService.clearAuthData();
      
      // Don't clear multi-account store when switching accounts
      if (!switchingAccount) {
        // User is fully logging out, not switching
        // Keep accounts stored for quick re-login
      }
    } catch (err) {
      console.error('[Auth] Logout error:', err);
      // Reset flag on error
      isManualLoginRef.current = false;
    }
  };

  const handle2FASuccess = async () => {
    setShow2FAVerify(false);
    if (pending2FAUser) {
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
