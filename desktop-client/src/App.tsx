import React, { useEffect, Component, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { MessageCircle, User, Settings, AlertTriangle, Loader2, Archive, Phone, Bookmark, Lock, Unlock } from 'lucide-react';
import { AccountSwitcher } from './components/AccountSwitcher';

// ─── Error Boundary ───────────────────────────────────────────────────────
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ padding: 32, color: '#f87171', fontFamily: 'monospace', background: '#0f172a', minHeight: '100vh' }}>
          <h2 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={28} color="#f87171" /> App Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{err.message}\n\n{err.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
import { SocketProvider } from './context/SocketContext';
import { CallProvider } from './context/CallContext';
import { useAuthStore } from './store/authStore';
import { useUIStore } from './store/uiStore';
import UserAvatar from './components/UserAvatar';
import LoginPage from './pages/LoginPage';
import ChatListPage from './pages/ChatListPage';
import ChatWindow from './pages/ChatWindow';
import PopupChatPage from './pages/PopupChatPage';
import SettingsPage from './pages/SettingsPage';
import DeviceSessionsPage from './pages/DeviceSessionsPage';
import UserProfile from './pages/UserProfile';
import CallScreen from './pages/CallScreen';
import IncomingCallModal from './pages/IncomingCallModal';
import CallHistoryPage from './pages/CallHistoryPage';
import BookmarksPage from './pages/BookmarksPage';
import CallWindowPage from './pages/CallWindowPage';
import IncomingCallWindowPage from './pages/IncomingCallWindowPage';
import { useCallStore } from './store/callStore';
import { useChatStore } from './store/chatStore';
import { useBookmarkStore } from './store/bookmarkStore';
import { useMultiAccountStore } from './store/multiAccountStore';
import PinModal from './components/modals/PinModal';
import AppLockScreen from './components/AppLockScreen';
import AppLockPinModal from './components/modals/AppLockPinModal';
import ToastProvider from './components/ToastProvider';
import NetworkListener from './components/NetworkListener';
import PopupBlockedNotification from './components/PopupBlockedNotification';

// ─── Inner App (has access to stores) ────────────────────────────────────
const AppInner: React.FC = () => {
  const { isAuthenticated, isLoading, setLoading, currentUser, setCurrentUser } = useAuthStore();
  const { theme, showArchived, setShowArchived, sidebarOpen, setSidebarOpen, toggleSidebar, lastActiveChatId, appLockModal, setAppLockModal } = useUIStore();
  const { activeCall, incomingCall, isCallInPopup, showPopupBlockedNotification } = useCallStore();
  // const { activeCall, incomingCall } = useCallStore();
  const { archivedChatIds, lockedChatIds, toggleLockChat } = useChatStore();
  const { showLocked, setShowLocked, isUnlocked, setIsUnlocked, pinModal, setPinModal } = useUIStore();
  const { accounts, activeAccountUid } = useMultiAccountStore();
  const hasArchived = archivedChatIds.length > 0;
  const hasLocked = lockedChatIds.length > 0;
  const navigate = useNavigate();
  const location = useLocation();
  const isPopupWindow = location.pathname.startsWith('/popup');
  const isCallWindow = location.pathname.startsWith('/call-window');
  const isIncomingCallWindow = location.pathname.startsWith('/incoming-call');
  
  // Debug logging for call state
  useEffect(() => {
    if (activeCall) {
      const willShow = !window.electronAPI?.openCallWindow && !isCallInPopup;
      console.log('[App] ActiveCall state changed:', { 
        callId: activeCall.callId, 
        isCallInPopup, 
        hasElectronAPI: !!window.electronAPI?.openCallWindow,
        willShowCallScreen: willShow
      });
      
      if (!willShow && activeCall) {
        console.warn('[App] CallScreen will NOT render - isCallInPopup:', isCallInPopup, 'hasElectron:', !!window.electronAPI?.openCallWindow);
      }
    } else {
      console.log('[App] activeCall is null, CallScreen will unmount');
    }
  }, [activeCall, isCallInPopup]);
  
  useEffect(() => {
    if (incomingCall) {
      console.log('[App] IncomingCall state changed:', { 
        callId: incomingCall.callId, 
        isCallInPopup, 
        hasElectronAPI: !!window.electronAPI?.openIncomingCallWindow,
        willShowModal: !window.electronAPI?.openIncomingCallWindow && !isCallInPopup
      });
    }
  }, [incomingCall, isCallInPopup]);

  // Handle popup blocked notification
  const handleUseInAppCall = () => {
    const { setIsCallInPopup, setShowPopupBlockedNotification } = useCallStore.getState();
    
    // Switch to in-app mode
    setIsCallInPopup(false);
    setShowPopupBlockedNotification(false);
    
    console.log('[App] User chose to use in-app call');
  };

  const handleDismissPopupNotification = () => {
    const { setShowPopupBlockedNotification } = useCallStore.getState();
    setShowPopupBlockedNotification(false);
  };
  
  // App lock state - check immediately on mount, before any content renders
  const [appLockReady, setAppLockReady] = React.useState(false);
  const [isAppUnlocked, setIsAppUnlocked] = React.useState(false);
  const appUnlockedRef = useRef(false);

  // Window focus/blur overlay (disabled when devtools are allowed)
  const [isWindowFocused, setIsWindowFocused] = React.useState(true);
  useEffect(() => {
    // Only show blur overlay when devtools are NOT allowed
    const allowDevTools = import.meta.env.VITE_ALLOW_DEVTOOLS === 'true';
    if (allowDevTools) return;

    const onFocus = () => setIsWindowFocused(true);
    const onBlur = () => setIsWindowFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Disable right-click context menu globally (except for inputs)
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Allow native menu only on inputs and textareas for copy/paste/etc.
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      e.preventDefault();
      return false;
    };

    // Also block common DevTools shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const isF12 = e.key === 'F12';
      const isDevToolsShortcut =
        (e.ctrlKey || e.metaKey) && e.shiftKey &&
        ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key);
      
      if (isF12 || isDevToolsShortcut) {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Check app lock status IMMEDIATELY when user data becomes available
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      // User data is loaded, we can now determine if app lock should show
      setAppLockReady(true);
    } else if (!isAuthenticated && !isLoading) {
      // Not authenticated and not loading, safe to proceed
      setAppLockReady(true);
    }
  }, [isAuthenticated, currentUser, isLoading]);

  // Sync app lock state with main process (for tray menu)
  useEffect(() => {
    if (!window.electronAPI?.setAppLockState) return;
    window.electronAPI.setAppLockState({
      enabled: !!(currentUser?.appLockEnabled),
      locked: !isAppUnlocked && !!(currentUser?.appLockEnabled),
    });
  }, [currentUser?.appLockEnabled, isAppUnlocked]);

  // Listen for lock command from tray
  useEffect(() => {
    if (!window.electronAPI?.onTrayLockApp) return;
    const cleanup = window.electronAPI.onTrayLockApp(() => {
      appUnlockedRef.current = false;
      setIsAppUnlocked(false);
    });
    return cleanup;
  }, []);

  // Sync accounts to tray menu
  useEffect(() => {
    if (!window.electronAPI?.setTrayAccounts) return;
    window.electronAPI.setTrayAccounts({
      accounts: accounts.map(({ uid, name, email }) => ({ uid, name, email })),
      activeAccountUid,
    });
  }, [accounts, activeAccountUid]);

  // Handle account switch triggered from tray
  useEffect(() => {
    if (!window.electronAPI?.onTraySwitchAccount) return;
    const cleanup = window.electronAPI.onTraySwitchAccount(async (uid) => {
      const { switchToAccount } = await import('./services/multiAccountService');
      const { setActiveAccount } = useMultiAccountStore.getState();
      const account = useMultiAccountStore.getState().accounts.find(a => a.uid === uid);
      if (!account) return;
      try {
        await switchToAccount(account);
        setActiveAccount(uid);
        window.location.href = '/';
      } catch {
        // fallback to login page
        const { useAuth: _useAuth } = await import('./context/AuthContext');
        window.location.href = `/login?switch=${encodeURIComponent(account.email)}&uid=${uid}`;
      }
    });
    return cleanup;
  }, []);

  // Apply theme immediately (before first paint)
  document.documentElement.setAttribute('data-theme', theme);

  // ─── Standalone call window (bypass auth entirely) ───────────────────────
  if (isCallWindow) {
    return (
      <SocketProvider>
        <div style={{ height: '100vh', overflow: 'hidden', backgroundColor: '#0f172a' }}>
          <Routes>
            <Route path="/call-window" element={<CallWindowPage />} />
            <Route path="*" element={<CallWindowPage />} />
          </Routes>
        </div>
      </SocketProvider>
    );
  }

  // ─── Incoming call notification window (bypass auth entirely) ────────────
  if (isIncomingCallWindow) {
    return (
      <div style={{ height: '100vh', overflow: 'hidden' }}>
        <Routes>
          <Route path="/incoming-call" element={<IncomingCallWindowPage />} />
          <Route path="*" element={<IncomingCallWindowPage />} />
        </Routes>
      </div>
    );
  }

  // Failsafe: if still loading after 8s, unblock the UI
  useEffect(() => {
    const timer = setTimeout(() => {
      if (useAuthStore.getState().isLoading) {
        console.warn('[App] Loading timeout — forcing isLoading=false');
        setLoading(false);
      }
    }, 8000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate Saved Messages from cloud (sync across devices)
  useEffect(() => {
    if (!isAuthenticated) return;
    const uid = currentUser?.uid;
    if (!uid) return;
    useBookmarkStore.getState().initializeForUser(uid).catch(() => {});
    
    // Load drafts from backend
    import('./services/apiService').then(async (api) => {
      try {
        const result = await api.getAllDrafts();
        if (result.success && result.data) {
          const { useDraftStore } = await import('./store/draftStore');
          const draftsMap: Record<string, string> = {};
          result.data.forEach(draft => {
            draftsMap[draft.chatId] = draft.content;
          });
          useDraftStore.getState().setDrafts(draftsMap);
        }
      } catch (error) {
        console.error('Failed to load drafts:', error);
      }
    });
    
    // Request notification permission
    import('./services/notificationService').then(m => m.requestNotificationPermission());
  }, [isAuthenticated, currentUser?.uid]);

  // Auto-lock logic: re-locks only if navigating to a non-locked chat or away from chats.
  const lastPathRef = useRef(location.pathname);
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const pathChanged = location.pathname !== lastPathRef.current;
    if (pathChanged && isUnlocked) {
      const isChatsPage = location.pathname.startsWith('/chats/');
      const currentChatId = isChatsPage ? location.pathname.split('/')[2] : null;
      
      // If we are on a chats page, only re-lock if the destination chat is NOT locked
      if (isChatsPage && currentChatId) {
        if (!lockedChatIds.includes(currentChatId)) {
          setIsUnlocked(false);
          setShowLocked(false);
        }
      } else if (!location.pathname.startsWith('/chats')) {
        // If we moved away from chats entirely
        setIsUnlocked(false);
        setShowLocked(false);
      }
    }
    lastPathRef.current = location.pathname;
  }, [location.pathname, isUnlocked, setIsUnlocked, setShowLocked, isAuthenticated, lockedChatIds]);

  // ─── Popup window mode (bypass loading screen — auth resolves inside) ────
  if (isPopupWindow) {
    return (
      <SocketProvider>
        <CallProvider>
          <div style={{ height: '100vh', overflow: 'hidden' }}>
            <Routes>
              <Route path="/popup/:chatId" element={<PopupChatPage />} />
              <Route path="*" element={<Navigate to="/popup" replace />} />
            </Routes>
          </div>
        </CallProvider>
      </SocketProvider>
    );
  }

  if (isLoading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Loader2 size={48} style={{ marginBottom: 16, opacity: 0.5, animation: 'spin 1s linear infinite' }} />
          <p>Loading TeleDesk...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Check if we're in the middle of account switching
    const isSwitching = document.getElementById('account-switching-overlay');
    if (isSwitching) {
      // Don't show login page during account switch
      return null;
    }
    
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  // CRITICAL: Wait for app lock check to complete before showing ANY content
  // This prevents the sidebar/chat flash when app lock is enabled
  if (!appLockReady) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Loader2 size={48} style={{ marginBottom: 16, opacity: 0.5, animation: 'spin 1s linear infinite' }} />
          <p>Loading TeleDesk...</p>
        </div>
      </div>
    );
  }

  // Show app lock screen if enabled and not unlocked this session
  if (currentUser?.appLockEnabled && !isAppUnlocked && !appUnlockedRef.current) {
    return (
      <AppLockScreen
        onUnlock={() => {
          appUnlockedRef.current = true;
          setIsAppUnlocked(true);
          window.electronAPI?.setAppLockState?.({ enabled: true, locked: false });
        }}
      />
    );
  }

  // ─── Standalone call window ──────────────────────────────────────────────
  if (isCallWindow) {
    return (
      <div style={{ height: '100vh', overflow: 'hidden', backgroundColor: '#0f172a' }}>
        <Routes>
          <Route path="/call-window" element={<CallWindowPage />} />
          <Route path="*" element={<CallWindowPage />} />
        </Routes>
      </div>
    );
  }

  // ─── Incoming call notification window ───────────────────────────────────
  if (isIncomingCallWindow) {
    return (
      <div style={{ height: '100vh', overflow: 'hidden' }}>
        <Routes>
          <Route path="/incoming-call" element={<IncomingCallWindowPage />} />
          <Route path="*" element={<IncomingCallWindowPage />} />
        </Routes>
      </div>
    );
  }

  return (
    <SocketProvider>
      <CallProvider>
        <div className="app-container">
          {/* Navigation Sidebar */}
          <nav className="nav-sidebar">
            <button
              className={`nav-btn${location.pathname.startsWith('/chats') && sidebarOpen ? ' active' : ''}`}
              title="Chats"
              onClick={() => {
                setShowArchived(false);
                setShowLocked(false);
                setIsUnlocked(false);
                
                // If already on chats page
                if (location.pathname.startsWith('/chats')) {
                  // On mobile, toggle sidebar
                  if (window.innerWidth < 768) {
                    // On mobile devices, if a chat is open, go back to chat list
                    if (location.pathname !== '/chats') {
                      navigate('/chats');
                    } else {
                      toggleSidebar();
                    }
                  } else {
                    // On desktop, just ensure sidebar is visible — don't close the open chat
                    // setSidebarOpen(true);
                    toggleSidebar();
                  }
                } else {
                  // Navigate to chats from another page
                  setSidebarOpen(true);
                  // Check if lastActiveChatId still exists in chats
                  const { chats } = useChatStore.getState();
                  const chatExists = lastActiveChatId && chats.some(c => c.chatId === lastActiveChatId);
                  navigate(chatExists ? `/chats/${lastActiveChatId}` : '/chats');
                }
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <MessageCircle size={22} />
            </button>
            <NavLink
              to="/calls"
              className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
              title="Calls"
              onClick={() => { setShowArchived(false); setShowLocked(false); setIsUnlocked(false); }}
            >
              <Phone size={22} />
            </NavLink>
            <NavLink
              to="/bookmarks"
              className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
              title="Saved Messages"
              onClick={() => { setShowArchived(false); setShowLocked(false); setIsUnlocked(false); }}
            >
              <Bookmark size={22} />
            </NavLink>

            {hasArchived && (
              <button
                className={`nav-btn nav-btn--archive${showArchived ? ' active' : ''}`}
                title="Archived chats"
                onClick={() => {
                  setShowLocked(false);
                  setShowArchived(true);
                  navigate('/chats');
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <Archive size={22} />
              </button>
            )}

            {hasLocked && (
              <button
                className={`nav-btn nav-btn--lock desktop-only${showLocked ? ' active' : ''}`}
                title="Locked chats"
                onClick={() => {
                  setShowArchived(false);
                  if (isUnlocked) {
                    setShowLocked(true);
                    navigate('/chats');
                  } else {
                    setPinModal({ mode: 'verify' });
                  }
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {isUnlocked ? <Unlock size={22} /> : <Lock size={22} />}
              </button>
            )}
            <NavLink
              to="/settings"
              className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
              title="Settings"
              style={{ marginTop: 'auto' }}
            >
              <Settings size={22} />
            </NavLink>
            <NavLink
              to="/profile"
              className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
              title="Profile"
              style={{ position: 'relative', marginTop: 8 }}
            >
              {currentUser?.avatar ? (
                <img 
                  src={currentUser.avatar} 
                  alt="Profile" 
                  style={{ 
                    width: 28, 
                    height: 28, 
                    borderRadius: '50%', 
                    objectFit: 'cover',
                    flexShrink: 0,
                  }} 
                />
              ) : (
                <div style={{ flexShrink: 0 }}>
                  <UserAvatar name={currentUser?.name || 'User'} size={28} />
                </div>
              )}
              <AccountSwitcher />
            </NavLink>
          </nav>

          {/* Main Content */}
          <div className="main-content-area">
            <Routes>
              <Route path="/" element={<Navigate to="/chats" replace />} />
              <Route path="/chats" element={<ChatListPage />}>
                <Route path=":chatId" element={<ChatWindow />} />
              </Route>
              <Route path="/settings" element={
                <div style={{ flex: 1, display: 'flex', overflow: 'auto' }}>
                  <SettingsPage />
                </div>
              } />
              <Route path="/device-sessions" element={
                <div style={{ flex: 1, display: 'flex', overflow: 'auto' }}>
                  <DeviceSessionsPage />
                </div>
              } />
              <Route path="/calls" element={
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                  <CallHistoryPage />
                </div>
              } />
              <Route path="/bookmarks" element={
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                  <BookmarksPage />
                </div>
              } />
              <Route path="/profile/:uid?" element={
                <div style={{ flex: 1, display: 'flex', overflow: 'auto' }}>
                  <UserProfile />
                </div>
              } />
              <Route path="*" element={<Navigate to="/chats" replace />} />
            </Routes>
          </div>

          {/* Overlays — shown only as fallback when not running in Electron or when popup is blocked */}
          {activeCall && !window.electronAPI?.openCallWindow && !isCallInPopup && <CallScreen key={activeCall.callId} />}
          {incomingCall && !window.electronAPI?.openIncomingCallWindow && !isCallInPopup && <IncomingCallModal key={incomingCall.callId} />}
          {/* {activeCall && !window.electronAPI?.openCallWindow && <CallScreen key={activeCall.callId} />}
          {incomingCall && !window.electronAPI?.openIncomingCallWindow && <IncomingCallModal key={incomingCall.callId} />} */}

          {/* Popup blocked notification */}
          {showPopupBlockedNotification && activeCall && (
            <PopupBlockedNotification
              callType={activeCall.type}
              targetName={activeCall.receiverName || 'Contact'}
              onUseInApp={handleUseInAppCall}
              onDismiss={handleDismissPopupNotification}
            />
          )}

          {/* PIN Modal */}
          {pinModal && (
            <PinModal
              mode={pinModal.mode}
              onSuccess={(pin) => {
                if (pinModal.mode === 'setup' && pinModal.chatId) {
                  toggleLockChat(pinModal.chatId, true);
                  // Update currentUser in store immediately so UI reflects PIN is set
                  if (currentUser) {
                    setCurrentUser({ ...currentUser, chatLockPin: '********' }); // placeholder since pin is hashed
                  }
                } else if (pinModal.mode === 'verify' || pinModal.mode === 'reset') {
                  setIsUnlocked(true);
                  setShowLocked(true);
                  // Only navigate to base /chats if we are not already in a chat view
                  if (!location.pathname.startsWith('/chats/')) {
                    navigate('/chats');
                  }
                  if (pinModal.mode === 'reset' && currentUser) {
                     setCurrentUser({ ...currentUser, chatLockPin: '********' });
                  }
                } else if (pinModal.mode === 'change') {
                  // PIN change successful
                  if (currentUser) {
                    setCurrentUser({ ...currentUser, chatLockPin: '********' });
                  }
                }
                setPinModal(null);
              }}
              onCancel={() => setPinModal(null)}
            />
          )}

          {/* App Lock PIN Modal */}
          {appLockModal && (
            <AppLockPinModal
              mode={appLockModal.mode}
              onSuccess={(pin) => {
                setAppLockModal(null);
                if (appLockModal.mode === 'setup' || appLockModal.mode === 'change') {
                  if (currentUser) {
                    setCurrentUser({ ...currentUser, appLockEnabled: true, appLockPin: '********' });
                  }
                }
              }}
              onCancel={() => setAppLockModal(null)}
            />
          )}

          {/* Global Notifications & Listeners */}
          <ToastProvider />
          <NetworkListener />

          {/* Window blur overlay */}
          {!isWindowFocused && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99998,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'all',
                userSelect: 'none',
                cursor: 'default',
              }}
            >
              <div style={{
                color: 'rgba(255,255,255,0.75)',
                fontSize: 15,
                fontWeight: 500,
                letterSpacing: '0.02em',
                userSelect: 'none',
              }}>
                You are no longer present here
              </div>
            </div>
          )}
        </div>
      </CallProvider>
    </SocketProvider>
  );
};

// ─── Root App (wraps with router & auth provider) ─────────────────────────
const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
