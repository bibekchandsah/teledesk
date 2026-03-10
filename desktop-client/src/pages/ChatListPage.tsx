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
  const isResizingSidebar = useRef(false);

  const handleSidebarResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingSidebar.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizingSidebar.current) return;
      setSidebarWidth(Math.min(600, Math.max(200, startWidth + (ev.clientX - startX))));
    };
    const onMouseUp = () => {
      isResizingSidebar.current = false;
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
      // Only fetch profiles not already cached in the store.
      const memberIds = new Set<string>();
      chats.forEach((c) => c.members.forEach((m) => memberIds.add(m)));
      const hasSelfChat = chats.some((c) => c.members.every((m) => m === currentUser.uid));
      if (!hasSelfChat) memberIds.delete(currentUser.uid);

      for (const uid of memberIds) {
        if (userProfilesRef.current[uid]) continue; // already loaded — skip the network call
        const res = await getUserById(uid);
        if (res.success && res.data) setUserProfile(res.data);
      }
    });

    return unsubscribe;
  }, [currentUser, setChats, setUserProfile]);

  // ─── User search for new chat ──────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const res = await searchUsers(searchQuery);
      if (res.success && res.data) setSearchResults(res.data);
      setIsSearching(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleStartChatWithUser = async (user: User) => {
    if (!currentUser) return;
    let chatId: string | undefined;
    try {
      // Try backend first
      const res = await createPrivateChat(user.uid);
      if (res.success && res.data) {
        chatId = res.data.chatId;
      }
    } catch {
      // Backend unavailable — fall through to client-side creation
    }
    if (!chatId) {
      // Fallback: create chat directly in Firestore
      const chat = await getOrCreatePrivateChatDirect(currentUser.uid, user.uid);
      chatId = chat.chatId;
    }
    // Immediately refresh Chat list so the new chat appears in the sidebar
    // without waiting for the Supabase realtime event.
    const refreshed = await getChats();
    if (refreshed.success && refreshed.data) setChats(refreshed.data);
    setShowNewChat(false);
    setSearchQuery('');
    setSearchResults([]);
    navigate(`/chats/${chatId}`);
  };

  return (
    <div
      className={`chat-list-layout${chatId ? ' has-chat' : ''}${!sidebarOpen ? ' sidebar-hidden' : ''}`}
      style={{ position: 'relative', height: '100%', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' }}
    >
      {sidebarOpen && (
        <>
          <ChatSidebar onNewChat={() => setShowNewChat(true)} width={sidebarWidth} />

          {/* Resize handle */}
          <div
            onMouseDown={handleSidebarResizeMouseDown}
            style={{
              width: 5,
              height: '100%',
              cursor: 'col-resize',
              flexShrink: 0,
              backgroundColor: 'transparent',
              transition: 'background-color 0.15s',
              zIndex: 5,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--accent)'; (e.currentTarget as HTMLDivElement).style.opacity = '0.4'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
            title="Drag to resize"
          />
        </>
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
            <input
              type="text"
              placeholder="Search by name or email..."
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
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user.email}</div>
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
