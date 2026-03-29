import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import ChatSidebar from '../components/ChatSidebar';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { listenToUserChats, getOrCreatePrivateChatDirect } from '../services/firebaseService';
import { getUserById, searchUsers, createPrivateChat, getChats } from '../services/apiService';
import { useUIStore } from '../store/uiStore';
import UserAvatar from '../components/UserAvatar';
import { User } from '@shared/types';
import { LUMINA_AI_UID, LUMINA_PROFILE } from '../services/luminaService';

const ChatListPage: React.FC = () => {
  const { setChats, setUserProfile, userProfiles } = useChatStore();
  const { currentUser } = useAuthStore();
  const { newGroupModalOpen, setNewGroupModal, setLastActiveChatId } = useUIStore();
  const { sidebarOpen } = useUIStore();
  const navigate = useNavigate();
  const { chatId } = useParams<{ chatId?: string }>();

  // Remember the last opened chat so navigating back to /chats restores it
  useEffect(() => {
    if (chatId) setLastActiveChatId(chatId);
  }, [chatId, setLastActiveChatId]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const sidebarWrapperRef = useRef<HTMLDivElement>(null);
  const isResizingSidebar = useRef(false);

  const handleSidebarResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingSidebar.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    let lastWidth = startWidth;

    // Disable transition for instant drag response
    if (sidebarWrapperRef.current) {
      sidebarWrapperRef.current.style.transition = 'none';
    }

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizingSidebar.current) return;
      lastWidth = Math.min(600, Math.max(200, startWidth + (ev.clientX - startX)));
      // Directly mutate DOM — no React re-render on every pixel
      if (sidebarWrapperRef.current) {
        sidebarWrapperRef.current.style.width = `${lastWidth}px`;
        sidebarWrapperRef.current.style.setProperty('--sidebar-w', `${lastWidth}px`);
      }
    };

    const onMouseUp = () => {
      isResizingSidebar.current = false;
      setSidebarWidth(lastWidth);
      if (sidebarWrapperRef.current) {
        // Clear inline width so CSS class (.open { width: var(--sidebar-w) }) takes over
        // Only keep --sidebar-w updated so the CSS variable drives the width
        sidebarWrapperRef.current.style.width = '';
        sidebarWrapperRef.current.style.transition = '';
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Keep a ref so the Firestore callback can read current profiles without
  // being listed as a dependency (which would cause infinite re-subscriptions).
  const userProfilesRef = useRef(userProfiles);
  useEffect(() => { userProfilesRef.current = userProfiles; }, [userProfiles]);

  // ─── Listen to chats in realtime ──────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = listenToUserChats(currentUser.uid, async (chats) => {
      setChats(chats);

      // Load profiles of chat members (including own uid for self-chats).
      // Always re-fetch profiles that look deleted or aren't cached yet.
      const memberIds = new Set<string>();
      chats.forEach((c) => c.members.forEach((m) => memberIds.add(m)));
      const hasSelfChat = chats.some((c) => c.members.every((m) => m === currentUser.uid));
      if (!hasSelfChat) memberIds.delete(currentUser.uid);

      for (const uid of memberIds) {
        const cached = userProfilesRef.current[uid];
        // Skip only if cached AND not marked deleted (deleted profiles must be re-fetched
        // in case the user deleted their account since we last loaded their profile)
        if (uid === LUMINA_AI_UID) {
          setUserProfile(LUMINA_PROFILE);
          continue;
        }
        if (cached && !cached.isDeleted) continue;
        const res = await getUserById(uid);
        if (res.success && res.data) setUserProfile(res.data);
      }
    });

    return unsubscribe;
  }, [currentUser, setChats, setUserProfile]);

  // ─── User search for new chat ──────────────────────────────────────────────
  useEffect(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    
    // Privacy requirement: Only search for exact emails or @usernames
    const isEmail = trimmed.includes('@') && !trimmed.startsWith('@');
    const isUsername = trimmed.startsWith('@') && trimmed.length >= 2;

    if (!isEmail && !isUsername) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const res = await searchUsers(trimmed);
      if (res.success && res.data) {
        // Enforce exact match filtering on frontend as well
        const filtered = res.data.filter(u => {
          if (isUsername) {
            return u.username?.toLowerCase() === trimmed.slice(1);
          }
          if (isEmail) {
            return u.email?.toLowerCase() === trimmed;
          }
          return false;
        });
        setSearchResults(filtered);
      }
      setIsSearching(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleStartChatWithUser = async (user: User) => {
    if (!currentUser) return;

    // Close modal immediately for snappy UX
    setShowNewChat(false);
    setSearchQuery('');
    setSearchResults([]);

    // Pre-populate profile so avatar shows instantly
    setUserProfile(user);

    // Fast path: chat already exists locally — navigate instantly
    const { chats } = useChatStore.getState();
    const existing = chats.find(c =>
      c.type === 'private' && c.members?.includes(user.uid) &&
      (user.uid === currentUser.uid
        ? c.members.every(m => m === currentUser.uid)
        : c.members.includes(currentUser.uid))
    );
    if (existing) {
      navigate(`/chats/${existing.chatId}`);
      return;
    }

    // Slow path: create chat, then navigate — refresh sidebar in background
    let chatId: string | undefined;
    try {
      const res = await createPrivateChat(user.uid);
      if (res.success && res.data) chatId = res.data.chatId;
    } catch {}

    if (!chatId) {
      const chat = await getOrCreatePrivateChatDirect(currentUser.uid, user.uid);
      chatId = chat.chatId;
    }

    // Navigate immediately — don't wait for getChats()
    navigate(`/chats/${chatId}`);

    // Refresh sidebar in background so the new chat appears in the list
    getChats().then(refreshed => {
      if (refreshed.success && refreshed.data) setChats(refreshed.data);
    });
  };

  const handleStartLuminaChat = async () => {
    if (!currentUser) return;
    setShowNewChat(false);
    setSearchQuery('');
    setSearchResults([]);
    setUserProfile(LUMINA_PROFILE);
    const { chats } = useChatStore.getState();
    const existingLumina = chats.find(c =>
      c.type === 'private' && c.members.includes(LUMINA_AI_UID)
    );
    if (existingLumina) {
      navigate(`/chats/${existingLumina.chatId}`);
      return;
    }
    try {
      const res = await createPrivateChat(LUMINA_AI_UID);
      if (res.success && res.data) {
        navigate(`/chats/${res.data.chatId}`);
        getChats().then(refreshed => {
          if (refreshed.success && refreshed.data) setChats(refreshed.data);
        });
        return;
      }
    } catch {}
    const chat = await getOrCreatePrivateChatDirect(currentUser.uid, LUMINA_AI_UID);
    navigate(`/chats/${chat.chatId}`);
    getChats().then(refreshed => {
      if (refreshed.success && refreshed.data) setChats(refreshed.data);
    });
  };

  return (
    <div
      className={`chat-list-layout${chatId ? ' has-chat' : ''}${!sidebarOpen ? ' sidebar-hidden' : ''}`}
      style={{ position: 'relative', height: '100%', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Sidebar wrapper — always mounted for smooth animation */}
      <div ref={sidebarWrapperRef} className={`chat-sidebar-wrapper${sidebarOpen ? ' open' : ''}`} style={{ '--sidebar-w': `${sidebarWidth}px` } as React.CSSProperties}>
        <ChatSidebar onNewChat={() => setShowNewChat(true)} width={sidebarWidth} />
      </div>

      {/* Resize handle — only interactive when open */}
      {sidebarOpen && (
        <div
          onMouseDown={handleSidebarResizeMouseDown}
          className="sidebar-resize-handle"
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--accent)'; (e.currentTarget as HTMLDivElement).style.opacity = '0.4'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
          title="Drag to resize"
        />
      )}

      {/* Main content (chat window or empty state) */}
      <div className="chat-main-area">
        {chatId ? (
          <Outlet />
        ) : (
          <div
            className="chat-no-chat-placeholder"
            style={{
              flex: 1,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              color: 'var(--text-secondary)',
              userSelect: 'none',
            }}
          >
            <MessageCircle size={56} style={{ opacity: 0.9 }} />
            <p style={{ margin: 0, fontSize: 16, opacity: 0.8 }}>Select a chat to start messaging</p>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>New Chat</h3>
              <button onClick={() => setShowNewChat(false)} style={closeBtnStyle}>✕</button>
            </div>

            {/* ── Lumina AI — always pinned at top ── */}
            <div
              onClick={handleStartLuminaChat}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(168,85,247,0.10) 100%)',
                border: '1px solid rgba(99,102,241,0.3)',
                marginBottom: 16, transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.background = 'linear-gradient(135deg, rgba(99,102,241,0.22) 0%, rgba(168,85,247,0.18) 100%)';
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.6)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.background = 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(168,85,247,0.10) 100%)';
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.3)';
              }}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <UserAvatar name="Lumina" avatar={LUMINA_PROFILE.avatar} size={42} online />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Lumina</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                    background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                    color: '#fff', letterSpacing: 0.5, textTransform: 'uppercase',
                  }}>AI</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Your personal AI companion · Always online</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#6366f1" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.7 }}>
                <path d="M7 4l6 6-6 6" />
              </svg>
            </div>

            <div style={{ height: 1, backgroundColor: 'var(--border)', marginBottom: 14 }} />
            <input
              type="text"
              placeholder="Search by @username or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              style={searchInputStyle}
            />
            <div style={{ marginTop: 12, maxHeight: 320, overflowY: 'auto' }}>
              {isSearching && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 16 }}>
                  Searching...
                </div>
              )}
              {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 16 }}>
                  No users found
                </div>
              )}
              {searchResults.map((user) => (
                <div
                  key={user.uid}
                  onClick={() => handleStartChatWithUser(user)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                  }}
                >
                  <UserAvatar name={user.name} avatar={user.avatar} size={40} />
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {user.name}
                      {user.uid === currentUser?.uid && (
                        <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 400 }}>(You)</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {user.username ? `@${user.username}` : user.email}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Shared styles
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 500,
  backgroundColor: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-secondary)',
  borderRadius: 16,
  padding: 24,
  width: 400,
  maxWidth: '92vw',
  boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 18,
  padding: 4,
  borderRadius: 4,
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

export default ChatListPage;
