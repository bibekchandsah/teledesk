import React, { useEffect, Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { MessageCircle, User, Settings, AlertTriangle, Loader2, Archive, Phone, Bookmark } from 'lucide-react';

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
import LoginPage from './pages/LoginPage';
import ChatListPage from './pages/ChatListPage';
import ChatWindow from './pages/ChatWindow';
import PopupChatPage from './pages/PopupChatPage';
import SettingsPage from './pages/SettingsPage';
import UserProfile from './pages/UserProfile';
import CallScreen from './pages/CallScreen';
import IncomingCallModal from './pages/IncomingCallModal';
import CallHistoryPage from './pages/CallHistoryPage';
import BookmarksPage from './pages/BookmarksPage';
import CallWindowPage from './pages/CallWindowPage';
import IncomingCallWindowPage from './pages/IncomingCallWindowPage';
import { useCallStore } from './store/callStore';
import { useChatStore } from './store/chatStore';

// ─── Inner App (has access to stores) ────────────────────────────────────
const AppInner: React.FC = () => {
  const { isAuthenticated, isLoading, setLoading } = useAuthStore();
  const { theme, showArchived, setShowArchived, sidebarOpen, setSidebarOpen, toggleSidebar, lastActiveChatId } = useUIStore();
  const { activeCall, incomingCall } = useCallStore();
  const { archivedChatIds } = useChatStore();
  const hasArchived = archivedChatIds.length > 0;
  const navigate = useNavigate();
  const location = useLocation();
  const isPopupWindow = location.pathname.startsWith('/popup');
  const isCallWindow = location.pathname.startsWith('/call-window');
  const isIncomingCallWindow = location.pathname.startsWith('/incoming-call');

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
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
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
                if (location.pathname.startsWith('/chats')) {
                  toggleSidebar();
                } else {
                  setSidebarOpen(true);
                  navigate(lastActiveChatId ? `/chats/${lastActiveChatId}` : '/chats');
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
            >
              <Phone size={22} />
            </NavLink>
            <NavLink
              to="/bookmarks"
              className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
              title="Saved Messages"
            >
              <Bookmark size={22} />
            </NavLink>
            <NavLink
              to="/profile"
              className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
              title="Profile"
            >
              <User size={22} />
            </NavLink>
            {hasArchived && (
              <button
                className={`nav-btn nav-btn--archive${showArchived ? ' active' : ''}`}
                title="Archived chats"
                onClick={() => { setShowArchived(true); navigate('/chats'); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <Archive size={22} />
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

          {/* Overlays — shown only as fallback when not running in Electron */}
          {activeCall && !window.electronAPI?.openCallWindow && <CallScreen />}
          {incomingCall && !window.electronAPI?.openIncomingCallWindow && <IncomingCallModal />}
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
