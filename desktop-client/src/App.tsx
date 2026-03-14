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
import PinModal from './components/modals/PinModal';
import AppLockScreen from './components/AppLockScreen';
import AppLockPinModal from './components/modals/AppLockPinModal';
import ToastProvider from './components/ToastProvider';
import NetworkListener from './components/NetworkListener';

// ─── Inner App (has access to stores) ────────────────────────────────────
const AppInner: React.FC = () => {
  const { isAuthenticated, isLoading, setLoading, currentUser, setCurrentUser } = useAuthStore();
  const { theme, showArchived, setShowArchived, sidebarOpen, setSidebarOpen, toggleSidebar, lastActiveChatId, appLockModal, setAppLockModal } = useUIStore();
  const { activeCall, incomingCall, isCallInPopup } = useCallStore();
  const { archivedChatIds, lockedChatIds, toggleLockChat } = useChatStore();
  const { showLocked, setShowLocked, isUnlocked, setIsUnlocked, pinModal, setPinModal } = useUIStore();
  const hasArchived = archivedChatIds.length > 0;
  const hasLocked = lockedChatIds.length > 0;
  const navigate = useNavigate();
  const location = useLocation();
  const isPopupWindow = location.pathname.startsWith('/popup');
  const isCallWindow = location.pathname.startsWith('/call-window');
  const isIncomingCallWindow = location.pathname.startsWith('/incoming-call');
  
  // App lock state - persists until app exit
  const [isAppLocked, setIsAppLocked] = React.useState(true);
  const appUnlockedRef = useRef(false);

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

  // Check app lock on mount
  useEffect(() => {
    if (isAuthenticated && currentUser?.appLockEnabled && !appUnlockedRef.current) {
      setIsAppLocked(true);
    } else {
      setIsAppLocked(false);
    }
  }, [isAuthenticated, currentUser?.appLockEnabled]);

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

  // Show app lock screen if enabled and not unlocked this session
  if (isAppLocked && currentUser?.appLockEnabled) {
    return (
      <AppLockScreen
        onUnlock={() => {
          setIsAppLocked(false);
          appUnlockedRef.current = true;
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
                    toggleSidebar();
                  } else {
                    // On desktop, if a chat is open, go back to chat list
                    if (location.pathname !== '/chats') {
                      navigate('/chats');
                    } else {
                      // If already on chat list, toggle sidebar
                      toggleSidebar();
                    }
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
          {activeCall && !window.electronAPI?.openCallWindow && !isCallInPopup && <CallScreen />}
          {incomingCall && !window.electronAPI?.openIncomingCallWindow && !isCallInPopup && <IncomingCallModal />}

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
