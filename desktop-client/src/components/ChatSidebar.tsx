import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import UserAvatar from './UserAvatar';
import { formatTime, truncate, getMessagePreview, getMessagePreviewIcon, getMessagePreviewColor } from '../utils/formatters';
import { Chat } from '@shared/types';
import { deleteChat as deleteChatApi } from '../services/apiService';
import { Users, PenSquare, Trash2, Paperclip, MoreVertical, Pin, PinOff, Archive, ArchiveRestore, X, ChevronLeft, ExternalLink, Phone, Video, Image, Film, Mic, PhoneMissed, PhoneOff, Lock, Unlock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const PREVIEW_ICON_MAP = { Phone, Video, Image, Film, Mic, Paperclip, PhoneMissed, PhoneOff } as const;
type PreviewIconKey = keyof typeof PREVIEW_ICON_MAP;

const PreviewIcon: React.FC<{ msg: Parameters<typeof getMessagePreviewIcon>[0]; color?: string }> = ({ msg, color }) => {
  const key = getMessagePreviewIcon(msg) as PreviewIconKey | null;
  if (!key) return null;
  const Icon = PREVIEW_ICON_MAP[key];
  return <Icon size={12} style={{ flexShrink: 0, color: color ?? 'inherit' }} />;
};

interface ChatSidebarProps {
  onNewChat: () => void;
  width?: number;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat, width }) => {
  const { chats, activeChat, setActiveChat, onlineUsers, userProfiles, unreadCounts, removeChat, pinnedChatIds, togglePinChat, archivedChatIds, toggleArchiveChat, lockedChatIds, toggleLockChat } =
    useChatStore();
  

  const { currentUser } = useAuthStore();
  const { searchQuery, setSearchQuery, setNewGroupModal, showArchived, setShowArchived, showLocked, setShowLocked, isUnlocked, setIsUnlocked } = useUIStore();
  const navigate = useNavigate();

  // ─── Context Menu State ───────────────────────────────────────────────────
  type CtxMenu = { chatId: string; x: number; y: number };
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [adjustedCtxPos, setAdjustedCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ chatId: string; scope: 'me' | 'both' } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showTopBar, setShowTopBar] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const ctxRef = useRef<HTMLDivElement | null>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  const cooldownRef = useRef(false);       // prevents flicker on layout reflow
  const touchStartYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  // Re-show top-bar when user types a search query
  useEffect(() => { if (searchQuery) setShowTopBar(true); }, [searchQuery]);

  // Safe toggle — ignores changes while layout is settling after a toggle
  const setTopBarSafe = useCallback((visible: boolean) => {
    if (cooldownRef.current) return;
    setShowTopBar((prev) => {
      if (prev === visible) return prev;
      cooldownRef.current = true;
      setTimeout(() => { cooldownRef.current = false; }, 450);
      return visible;
    });
  }, []);

  // Scroll handler — shows topbar only when at the top, hides when scrolling down
  const handleListScroll = useCallback(() => {
    const el = chatListRef.current;
    if (!el) return;
    const current = el.scrollTop;
    const diff = current - lastScrollTopRef.current;
    lastScrollTopRef.current = current;
    
    // Show topbar only when at the top (within 5px)
    if (current < 5) {
      setTopBarSafe(true);
    } 
    // Hide topbar when scrolling down
    else if (diff > 10) {
      setTopBarSafe(false);
    }
  }, [setTopBarSafe]);

  // Wheel handler — for desktop users, allow pull-down effect with mouse wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const el = chatListRef.current;
    if (!el) return;
    
    const atTop = el.scrollTop < 5;
    const isScrollable = el.scrollHeight > el.clientHeight;
    
    // If at top or not scrollable, and scrolling up (negative deltaY), show topbar
    if ((atTop || !isScrollable) && e.deltaY < 0) {
      setTopBarSafe(true);
    }
    // Scrolling down hides the topbar
    else if (e.deltaY > 0) {
      setTopBarSafe(false);
    }
  }, [setTopBarSafe]);

  // Touch handlers — pull-down reveals only when at top, swipe-up hides anywhere
  // Works even when there's no scrollable area
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = chatListRef.current;
    if (!el) return;
    
    // Always capture touch start for swipe detection
    touchStartYRef.current = e.touches[0].clientY;
    isPullingRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const el = chatListRef.current;
    if (!el) return;
    
    const atTop = el.scrollTop < 5;
    const isScrollable = el.scrollHeight > el.clientHeight;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    
    // Swipe-up hides the topbar (works anywhere)
    if (deltaY < -45) {
      setPullDistance(0);
      setTopBarSafe(false);
    }
    // Pull-down to reveal (only works at top or when not scrollable)
    else if ((atTop || !isScrollable) && deltaY > 0) {
      // Prevent default scroll behavior when pulling down
      if (deltaY > 10) {
        e.preventDefault();
        isPullingRef.current = true;
      }
      
      // Apply resistance effect (diminishing returns as you pull further)
      const resistance = 0.4;
      const adjustedDistance = Math.min(deltaY * resistance, 80);
      setPullDistance(adjustedDistance);
      
      // Reveal topbar when pulled enough
      if (deltaY > 60) {
        setTopBarSafe(true);
      }
    }
  }, [setTopBarSafe]);

  const handleTouchEnd = useCallback(() => {
    touchStartYRef.current = null;
    isPullingRef.current = false;
    
    // Animate back to original position
    setPullDistance(0);
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (!ctxRef.current?.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [ctxMenu]);

  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ chatId, x: e.clientX, y: e.clientY });
    setAdjustedCtxPos(null);
  };

  useEffect(() => {
    if (ctxMenu && ctxRef.current) {
      const rect = ctxRef.current.getBoundingClientRect();
      const padding = 12;
      let newX = ctxMenu.x;
      let newY = ctxMenu.y;
      if (newX + rect.width > window.innerWidth) newX = window.innerWidth - rect.width - padding;
      if (newY + rect.height > window.innerHeight) newY = window.innerHeight - rect.height - padding;
      setAdjustedCtxPos({ x: newX, y: newY });
    } else {
      setAdjustedCtxPos(null);
    }
  }, [ctxMenu]);

  const requestDelete = (chatId: string, scope: 'me' | 'both') => {
    setCtxMenu(null);
    // Show confirmation modal for both "me" and "both"
    setConfirmDelete({ chatId, scope });
  };

  const performDelete = async (chatId: string, scope: 'me' | 'both') => {
    setDeleting(true);
    setConfirmDelete(null);
    try {
      await deleteChatApi(chatId, scope);
      if (activeChat?.chatId === chatId) navigate('/chats');
      removeChat(chatId);
    } catch (err) {
      console.error('Failed to delete chat:', err);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (showLocked && lockedChatIds.length === 0) {
      setShowLocked(false);
      setIsUnlocked(false);
    }
    if (showArchived && archivedChatIds.length === 0) {
      setShowArchived(false);
    }
  }, [showLocked, lockedChatIds.length, showArchived, archivedChatIds.length, setShowLocked, setIsUnlocked, setShowArchived]);

  const { nicknames } = useChatStore();

  const getChatDisplayInfo = useCallback(
    (chat: Chat) => {
      if (chat.type === 'private') {
        const isSelfChat = chat.members.every((m: string) => m === currentUser?.uid);
        const otherUid = isSelfChat
          ? currentUser?.uid
          : chat.members.find((m: string) => m !== currentUser?.uid);
        
        // For the current user, always use the latest currentUser data
        // For other users, use the cached profile
        const profile = otherUid === currentUser?.uid 
          ? currentUser 
          : (otherUid ? userProfiles[otherUid] : null);
          
        const isPeerVisible = profile?.showActiveStatus !== false;
        const baseName = isSelfChat
          ? `${profile?.name || profile?.email?.split('@')[0] || 'Unknown'} (You)`
          : profile?.name || profile?.email?.split('@')[0] || 'Unknown';
        const displayName = (!isSelfChat && otherUid && nicknames[otherUid])
          ? nicknames[otherUid]
          : baseName;

        // Self-chat: online if showActiveStatus enabled (user is actively using the app)
        // Other chat: online if peer is in onlineUsers and has showActiveStatus enabled
        const online = isSelfChat
          ? currentUser?.showActiveStatus !== false
          : !!(otherUid && onlineUsers.has(otherUid) && isPeerVisible);

        return {
          name: displayName,
          avatar: profile?.avatar,
          online,
        };
      }
      return {
        name: chat.chatId, // Will be replaced by group name
        avatar: undefined,
        online: false,
      };
    },
    [currentUser, userProfiles, onlineUsers, nicknames],
  );

  const filteredChats = useMemo(() => {
    let list = chats;
    if (showLocked) {
      list = chats.filter(c => lockedChatIds.includes(c.chatId));
    } else if (showArchived) {
      list = chats.filter(c => archivedChatIds.includes(c.chatId));
    } else {
      list = chats.filter(c => !archivedChatIds.includes(c.chatId) && !lockedChatIds.includes(c.chatId));
    }

    // Filter out empty chats (no messages) unless it's the actively open chat.
    // This prevents "ghost" chats created by clicking a profile or searching
    // from cluttering the sidebar for either the initiator or the recipient.
    list = list.filter(c => c.lastMessage || c.chatId === activeChat?.chatId);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((chat) => {
        const info = getChatDisplayInfo(chat);
        return (
          info.name.toLowerCase().includes(q) ||
          chat.lastMessage?.content.toLowerCase().includes(q)
        );
      });
    }
    // Pinned chats float to the top
    return [...list]
      .sort((a, b) => {
        const aP = pinnedChatIds.includes(a.chatId) ? 0 : 1;
        const bP = pinnedChatIds.includes(b.chatId) ? 0 : 1;
        if (aP !== bP) return aP - bP;
        
        const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bt - at;
      });
  }, [chats, searchQuery, getChatDisplayInfo, pinnedChatIds, archivedChatIds, lockedChatIds, showLocked, showArchived]);

  const handleChatClick = (chat: Chat) => {
    // Only lock if we are navigating out of the locked view/group
    const isTargetLocked = lockedChatIds.includes(chat.chatId);
    if (!isTargetLocked) {
      setIsUnlocked(false);
      setShowLocked(false);
    }
    setActiveChat(chat);
    navigate(`/chats/${chat.chatId}`);
  };

  return (
    <aside
      className="chat-sidebar"
      style={{
        width: width ?? 320,
        minWidth: 200,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        position: 'relative',
      }}
    >
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {showArchived ? (
          <>
            <button
              onClick={() => setShowArchived(false)}
              style={{ ...iconBtnStyle, marginRight: 6 }}
              title="Back"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
              Archived Chats
            </h2>
          </>
        ) : showLocked ? (
          <>
            <button
              onClick={() => setShowLocked(false)}
              style={{ ...iconBtnStyle, marginRight: 6 }}
              title="Back"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
              Locked Chats
            </h2>
          </>
        ) : (
          <>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
              Chats
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setNewGroupModal(true)}
                title="New group"
                style={iconBtnStyle}
              >
                <Users size={18} />
              </button>
              <button onClick={onNewChat} title="New chat" style={iconBtnStyle}>
                <PenSquare size={18} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Pull-to-reveal indicator */}
      {pullDistance > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: pullDistance,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontSize: 12,
            opacity: Math.min(pullDistance / 60, 1),
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <ChevronLeft 
            size={16} 
            style={{ 
              transform: 'rotate(90deg)',
              transition: 'transform 0.2s ease',
            }} 
          />
        </div>
      )}

      {/* Search + Folders — collapses on scroll-down on mobile */}
      {!showArchived && !showLocked && (
        <div className={`sidebar-topbar${showTopBar ? '' : ' sidebar-topbar--hidden'}`}>
          <div style={{ padding: '8px 12px' }}>
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 20,
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {lockedChatIds.length > 0 && (
            <div
              onClick={() => {
                if (isUnlocked) setShowLocked(true);
                else {
                  useUIStore.getState().setPinModal({ mode: 'verify' });
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
                cursor: 'pointer', transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: '50%', backgroundColor: 'var(--bg-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Lock size={18} style={{ color: 'var(--text-secondary)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Locked Chats</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {lockedChatIds.length} {lockedChatIds.length === 1 ? 'chat' : 'chats'}
                </div>
              </div>
              <ChevronLeft size={16} style={{ color: 'var(--text-secondary)', transform: 'rotate(180deg)', flexShrink: 0 }} />
            </div>
          )}
          {archivedChatIds.length > 0 && (
            <div
              onClick={() => setShowArchived(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
                cursor: 'pointer', transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: '50%', backgroundColor: 'var(--bg-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Archive size={18} style={{ color: 'var(--text-secondary)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>Archived</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {archivedChatIds.length} {archivedChatIds.length === 1 ? 'chat' : 'chats'}
                </div>
              </div>
              <ChevronLeft size={16} style={{ color: 'var(--text-secondary)', transform: 'rotate(180deg)', flexShrink: 0 }} />
            </div>
          )}
          <div style={{ height: 1, backgroundColor: 'var(--border)' }} />
        </div>
      )}

      {/* Chat List */}
      <div
        ref={chatListRef}
        onScroll={handleListScroll}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ 
          flex: 1, 
          overflowY: 'auto',
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance === 0 ? 'transform 0.3s ease-out' : 'none',
        }}
      >
        {/* ─── Filtered Chats View ──────────────────────────────────────── */}
        {(showArchived || showLocked) && filteredChats.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)', fontSize: 14 }}>
            No {showArchived ? 'archived' : 'locked'} chats {searchQuery ? 'matching your search' : ''}
          </div>
        )}
        {filteredChats.length === 0 && !showArchived && !showLocked && (
          <div
            style={{
              textAlign: 'center',
              padding: 32,
              color: 'var(--text-secondary)',
              fontSize: 14,
            }}
          >
            {searchQuery ? 'No chats found' : 'No chats yet. Start a conversation!'}
          </div>
        )}
        {filteredChats.map((chat) => {
          const info = getChatDisplayInfo(chat);
          const unread = unreadCounts[chat.chatId] || 0;
          const isActive = activeChat?.chatId === chat.chatId;
          const isChatPinned = pinnedChatIds.includes(chat.chatId);
          const isContextView = showArchived || showLocked;

          return (
            <div
              key={chat.chatId}
              onClick={() => handleChatClick(chat)}
              onContextMenu={(e) => !isContextView && handleContextMenu(e, chat.chatId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: isContextView ? '10px 16px' : '12px 16px',
                cursor: 'pointer',
                backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
                transition: 'background-color 0.15s',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-hover)';
                const btn = (e.currentTarget as HTMLDivElement).querySelector<HTMLButtonElement>('.chat-menu-btn');
                if (btn) btn.style.display = 'flex';
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                const btn = (e.currentTarget as HTMLDivElement).querySelector<HTMLButtonElement>('.chat-menu-btn');
                if (btn) btn.style.display = 'none';
              }}
            >
              <UserAvatar
                name={info.name}
                avatar={info.avatar}
                size={isContextView ? 42 : 46}
                online={chat.type === 'private' ? info.online : undefined}
              />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        fontWeight: unread > 0 ? 700 : 500,
                        fontSize: isContextView ? 14 : 15,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {!isContextView && isChatPinned && <Pin size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                      {info.name}
                    </span>
                    <span style={{ fontSize: 11, color: unread > 0 ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }}>
                      {chat.lastMessage?.timestamp ? formatTime(chat.lastMessage.timestamp) : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: isContextView ? 12 : 13,
                        fontWeight: unread > 0 ? 600 : 400,
                        color: chat.lastMessage ? (getMessagePreviewColor(chat.lastMessage) ?? (unread > 0 ? 'var(--text-primary)' : 'var(--text-secondary)')) : 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flex: 1
                      }}
                    >
                      {chat.lastMessage ? (
                        <>
                          <PreviewIcon msg={chat.lastMessage} color={getMessagePreviewColor(chat.lastMessage) ?? undefined} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truncate(getMessagePreview(chat.lastMessage), 50)}</span>
                        </>
                      ) : (isContextView ? 'No messages' : 'Start a conversation')}
                    </span>
                    {unread > 0 && (
                      <span
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: '#fff',
                          borderRadius: 10,
                          padding: '1px 7px',
                          fontSize: isContextView ? 10 : 11,
                          fontWeight: 700,
                          minWidth: 18,
                          textAlign: 'center',
                        }}
                      >
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                </div>
                {isContextView ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (showArchived) toggleArchiveChat(chat.chatId);
                      else toggleLockChat(chat.chatId, false);
                    }}
                    title={showArchived ? "Unarchive" : "Unlock"}
                    style={{ ...iconBtnStyle, flexShrink: 0 }}
                  >
                    {showArchived ? <ArchiveRestore size={16} /> : <Unlock size={16} />}
                  </button>
                ) : (
                  <button
                    className="chat-menu-btn"
                    onClick={(e) => { e.stopPropagation(); handleContextMenu(e, chat.chatId); }}
                    style={{
                      display: 'none',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--bg-tertiary)',
                      border: 'none',
                      borderRadius: '50%',
                      width: 28,
                      height: 28,
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    <MoreVertical size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}


      </div>

      {/* ─── Context Menu ─────────────────────────────────────────────────── */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{
            position: 'fixed',
            top: adjustedCtxPos ? adjustedCtxPos.y : ctxMenu.y,
            left: adjustedCtxPos ? adjustedCtxPos.x : ctxMenu.x,
            opacity: adjustedCtxPos ? 1 : 0,
            pointerEvents: adjustedCtxPos ? 'auto' : 'none',
            zIndex: 1000,
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            minWidth: 180,
          }}
        >
          <button
            onClick={() => {
              if (window.electronAPI) {
                window.electronAPI.openChatWindow(ctxMenu.chatId);
              } else {
                window.open(`/popup/${ctxMenu.chatId}`, '_blank', 'width=900,height=680,noopener');
              }
              setCtxMenu(null);
            }}
            style={ctxMenuItemStyle}
          >
            <ExternalLink size={14} style={{ marginRight: 6 }} />Open in new window
          </button>
          <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
          <button
            onClick={() => { togglePinChat(ctxMenu.chatId); setCtxMenu(null); }}
            style={ctxMenuItemStyle}
          >
            {pinnedChatIds.includes(ctxMenu.chatId)
              ? <><PinOff size={14} style={{ marginRight: 6 }} />Unpin chat</>
              : <><Pin size={14} style={{ marginRight: 6 }} />Pin chat</>}
          </button>
          <button
            onClick={() => { toggleArchiveChat(ctxMenu.chatId); setCtxMenu(null); }}
            style={ctxMenuItemStyle}
          >
            {archivedChatIds.includes(ctxMenu.chatId)
              ? <><ArchiveRestore size={14} style={{ marginRight: 6 }} />Unarchive chat</>
              : <><Archive size={14} style={{ marginRight: 6 }} />Archive chat</>}
          </button>
          <button
            onClick={() => {
              const isLocked = lockedChatIds.includes(ctxMenu.chatId);
              if (!isLocked && !currentUser?.chatLockPin) {
                useUIStore.getState().setPinModal({ mode: 'setup', chatId: ctxMenu.chatId });
              } else if (!isLocked) {
                toggleLockChat(ctxMenu.chatId, true);
              } else {
                toggleLockChat(ctxMenu.chatId, false);
              }
              setCtxMenu(null);
            }}
            style={ctxMenuItemStyle}
          >
            {lockedChatIds.includes(ctxMenu.chatId)
              ? <><Unlock size={14} style={{ marginRight: 6 }} />Unlock chat</>
              : <><Lock size={14} style={{ marginRight: 6 }} />Lock chat</>}
          </button>
          {activeChat?.chatId === ctxMenu.chatId && (
            <button
              onClick={() => { setActiveChat(null); navigate('/chats'); setCtxMenu(null); }}
              style={ctxMenuItemStyle}
            >
              <X size={14} style={{ marginRight: 6 }} />Close chat
            </button>
          )}
          <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
          <button
            onClick={() => requestDelete(ctxMenu.chatId, 'me')}
            style={ctxMenuItemStyle}
          >
            <Trash2 size={14} style={{ marginRight: 6 }} />Delete for me
          </button>
          <button
            onClick={() => requestDelete(ctxMenu.chatId, 'both')}
            style={{ ...ctxMenuItemStyle, color: 'var(--error, #e74c3c)' }}
          >
            <Trash2 size={14} style={{ marginRight: 6 }} />Delete for everyone
          </button>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ──────────────────────────────────── */}
      {confirmDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              {confirmDelete.scope === 'both' ? 'Delete for Everyone?' : 'Delete Chat?'}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {confirmDelete.scope === 'both'
                ? 'This will permanently delete the chat for all participants. This action cannot be undone.'
                : 'This will delete the chat from your device. Other participants will still have access to it.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                style={{
                  ...btnStyle,
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  opacity: deleting ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => performDelete(confirmDelete.chatId, confirmDelete.scope)}
                disabled={deleting}
                style={{
                  ...btnStyle,
                  backgroundColor: 'var(--error, #e74c3c)',
                  color: '#fff',
                  opacity: deleting ? 0.5 : 1,
                }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </aside>
  );
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 18,
  padding: 4,
  borderRadius: 6,
  color: 'var(--text-secondary)',
};

const ctxMenuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '10px 16px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 14,
  color: 'var(--text-primary)',
};

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};

export default ChatSidebar;
