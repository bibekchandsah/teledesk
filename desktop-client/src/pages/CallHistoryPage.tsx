import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Video, VideoOff, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff, MoreVertical, Trash2, CheckSquare, X } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { Message } from '@shared/types';
import UserAvatar from '../components/UserAvatar';
import { formatDuration } from '../utils/formatters';

interface CallEntry {
  message: Message;
  chatId: string;
  peerName: string;
  peerAvatar: string;
  peerUid: string;
  direction: 'incoming' | 'outgoing';
  date: Date;
}

const formatCallDate = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'long' });
  return date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatCallTime = (date: Date): string =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const CallHistoryPage: React.FC = () => {
  const { userProfiles, chats, nicknames } = useChatStore();
  const { currentUser } = useAuthStore();
  const navigate = useNavigate();

  // State for menu and selection
  const [showMenu, setShowMenu] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<'all' | 'selected' | 'single' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [callLogs, setCallLogs] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load call logs from backend
  const loadCallLogs = async (before?: string) => {
    try {
      if (before) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      const { getCallLogs } = await import('../services/apiService');
      const limit = 50;
      const result = await getCallLogs(limit, before);

      if (result.success && result.data) {
        const logs = result.data;
        if (before) {
          setCallLogs((prev) => [...prev, ...logs]);
        } else {
          setCallLogs(logs);
        }
        
        // If we got fewer than the limit, there are no more logs
        if (logs.length < limit) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }
      }
    } catch (error) {
      console.error('Failed to load call logs:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadCallLogs();
    }
  }, [currentUser]);

  // Infinite scroll handler
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMore || isLoading || isLoadingMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Load more when 100px from bottom
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      const lastLog = callLogs[callLogs.length - 1];
      if (lastLog) {
        loadCallLogs(lastLog.timestamp);
      }
    }
  };

  const callEntries = useMemo<CallEntry[]>(() => {
    if (!currentUser) return [];
    const entries: CallEntry[] = [];

    for (const msg of callLogs) {
      const chat = chats.find((c) => c.chatId === msg.chatId);
      if (!chat) continue;

      const peerUid = chat.members.find((m) => m !== currentUser.uid) ?? '';
      const peer = userProfiles[peerUid];
      const peerName = nicknames[peerUid] || peer?.name || 'Unknown';
      const peerAvatar = peer?.avatar ?? '';

      entries.push({
        message: msg,
        chatId: msg.chatId,
        peerName,
        peerAvatar,
        peerUid,
        direction: msg.senderId === currentUser.uid ? 'outgoing' : 'incoming',
        date: new Date(msg.timestamp),
      });
    }

    // Sort newest first
    return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [callLogs, userProfiles, chats, currentUser, nicknames]);

  // Group by day label
  const grouped = useMemo(() => {
    const map: { label: string; entries: CallEntry[] }[] = [];
    const seen = new Map<string, CallEntry[]>();

    for (const entry of callEntries) {
      const label = formatCallDate(entry.date);
      if (!seen.has(label)) {
        seen.set(label, []);
        map.push({ label, entries: seen.get(label)! });
      }
      seen.get(label)!.push(entry);
    }
    return map;
  }, [callEntries]);

  const getStatusIcon = (entry: CallEntry) => {
    const { callStatus, callStatusReceiver, callType } = entry.message;
    const status = entry.direction === 'outgoing' ? callStatus : callStatusReceiver;
    const isVideo = callType === 'video';

    if (status === 'missed' || status === 'no_answer') {
      return isVideo
        ? <VideoOff size={16} color="#f87171" />
        : <PhoneMissed size={16} color="#f87171" />;
    }
    if (status === 'declined' || status === 'cancelled') {
      return isVideo
        ? <VideoOff size={16} color="#f87171" />
        : <PhoneOff size={16} color="#f87171" />;
    }
    if (entry.direction === 'incoming') {
      return isVideo
        ? <Video size={16} color="#34d399" />
        : <PhoneIncoming size={16} color="#34d399" />;
    }
    return isVideo
      ? <Video size={16} color="var(--accent)" />
      : <PhoneOutgoing size={16} color="var(--accent)" />;
  };

  const getStatusLabel = (entry: CallEntry) => {
    const { callStatus, callStatusReceiver } = entry.message;
    const status = entry.direction === 'outgoing' ? callStatus : callStatusReceiver;

    if (status === 'missed') return 'Missed';
    if (status === 'no_answer') return entry.direction === 'outgoing' ? 'No answer' : 'Missed';
    if (status === 'declined') return entry.direction === 'outgoing' ? 'Declined' : 'Declined';
    if (status === 'cancelled') return 'Cancelled';
    if (entry.message.callDuration && entry.message.callDuration > 0) {
      return formatDuration(entry.message.callDuration);
    }
    return entry.direction === 'incoming' ? 'Incoming' : 'Outgoing';
  };

  const getStatusColor = (entry: CallEntry) => {
    const { callStatus, callStatusReceiver } = entry.message;
    const status = entry.direction === 'outgoing' ? callStatus : callStatusReceiver;
    if (status === 'missed' || status === 'no_answer') return '#f87171';
    if (status === 'declined' || status === 'cancelled') return '#f87171';
    return 'var(--text-secondary)';
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle selection
  const toggleSelection = (messageId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  // Select all
  const selectAll = () => {
    setSelectedIds(new Set(callEntries.map((e) => e.message.messageId)));
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Toggle select/deselect all
  const toggleSelectAll = () => {
    if (selectedIds.size === callEntries.length) {
      deselectAll();
    } else {
      selectAll();
    }
  };

  // Check if all items are selected
  const allSelected = callEntries.length > 0 && selectedIds.size === callEntries.length;

  // Clear selection
  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  // Delete call logs
  const deleteCallLogs = async (messageIds: string[]) => {
    setIsDeleting(true);
    try {
      const { deleteMessage } = await import('../services/apiService');
      
      // Delete each message
      for (const messageId of messageIds) {
        const entry = callEntries.find((e) => e.message.messageId === messageId);
        if (entry) {
          await deleteMessage(entry.chatId, messageId, 'me');
        }
      }
      
      // Remove deleted logs from state
      setCallLogs((prev) => prev.filter((log) => !messageIds.includes(log.messageId)));
      
      // Clear selection and close modals
      clearSelection();
      setShowDeleteConfirm(null);
      setContextMenu(null);
    } catch (error) {
      console.error('Failed to delete call logs:', error);
      alert('Failed to delete call logs. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle delete all
  const handleDeleteAll = () => {
    setShowDeleteConfirm('all');
  };

  // Handle delete selected
  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setShowDeleteConfirm('selected');
  };

  // Handle delete single (from context menu)
  const handleDeleteSingle = (messageId: string) => {
    setSelectedIds(new Set([messageId]));
    setShowDeleteConfirm('single');
  };

  // Confirm delete
  const confirmDelete = () => {
    if (showDeleteConfirm === 'all') {
      deleteCallLogs(callEntries.map((e) => e.message.messageId));
    } else if (showDeleteConfirm === 'selected' || showDeleteConfirm === 'single') {
      deleteCallLogs(Array.from(selectedIds));
    }
  };

  return (
    <div
      style={{
        width: 340,
        minWidth: 280,
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-primary)',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'calc(env(safe-area-inset-top) + 20px) 20px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {selectionMode && (
            <button
              onClick={clearSelection}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-primary)',
              }}
            >
              <X size={20} />
            </button>
          )}
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            {selectionMode ? `${selectedIds.size} selected` : 'Calls'}
          </h2>
        </div>

        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 6,
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-primary)',
              borderRadius: 6,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <MoreVertical size={20} />
          </button>

          {showMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                minWidth: 180,
                zIndex: 1000,
                overflow: 'hidden',
              }}
            >
              {selectionMode ? (
                <>
                  <button
                    onClick={() => {
                      toggleSelectAll();
                      setShowMenu(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 14,
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <CheckSquare size={16} />
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                  <button
                    onClick={() => {
                      handleDeleteSelected();
                      setShowMenu(false);
                    }}
                    disabled={selectedIds.size === 0}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      color: selectedIds.size === 0 ? 'var(--text-secondary)' : '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      opacity: selectedIds.size === 0 ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (selectedIds.size > 0) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                      }
                    }}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setSelectionMode(true);
                      setShowMenu(false);
                    }}
                    disabled={callEntries.length === 0}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      cursor: callEntries.length === 0 ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      color: callEntries.length === 0 ? 'var(--text-secondary)' : 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      opacity: callEntries.length === 0 ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (callEntries.length > 0) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                      }
                    }}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <CheckSquare size={16} />
                    Select call logs
                  </button>
                  <button
                    onClick={() => {
                      handleDeleteAll();
                      setShowMenu(false);
                    }}
                    disabled={callEntries.length === 0}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      cursor: callEntries.length === 0 ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      color: callEntries.length === 0 ? 'var(--text-secondary)' : '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      opacity: callEntries.length === 0 ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (callEntries.length > 0) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                      }
                    }}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Trash2 size={16} />
                    Clear call logs
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div 
        style={{ flex: 1, overflowY: 'auto' }}
        onScroll={handleScroll}
      >
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 12,
              color: 'var(--text-secondary)',
              padding: 32,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                border: '3px solid var(--border)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p style={{ margin: 0, fontSize: 14 }}>Loading call logs...</p>
          </div>
        ) : callEntries.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 12,
              color: 'var(--text-secondary)',
              padding: 32,
              textAlign: 'center',
            }}
          >
            <Phone size={48} style={{ opacity: 0.25 }} />
            <p style={{ margin: 0, fontSize: 14 }}>No call history yet</p>
          </div>
        ) : (
          grouped.map(({ label, entries }) => (
            <div key={label}>
              {/* Day separator */}
              <div
                style={{
                  padding: '10px 20px 4px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: 'var(--bg-primary)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}
              >
                {label}
              </div>

              {entries.map((entry) => (
                <div
                  key={entry.message.messageId}
                  onClick={() => {
                    if (selectionMode) {
                      toggleSelection(entry.message.messageId);
                    } else {
                      navigate(`/chats/${entry.chatId}`);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      messageId: entry.message.messageId,
                    });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    backgroundColor: selectedIds.has(entry.message.messageId)
                      ? 'var(--bg-secondary)'
                      : 'transparent',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = selectedIds.has(entry.message.messageId)
                      ? 'var(--bg-secondary)'
                      : 'transparent')
                  }
                >
                  {/* Selection checkbox */}
                  {selectionMode && (
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        border: `2px solid ${
                          selectedIds.has(entry.message.messageId) ? 'var(--accent)' : 'var(--border)'
                        }`,
                        backgroundColor: selectedIds.has(entry.message.messageId)
                          ? 'var(--accent)'
                          : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {selectedIds.has(entry.message.messageId) && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M10 3L4.5 8.5L2 6"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  )}

                  {/* Avatar */}
                  <div style={{ flexShrink: 0 }}>
                    <UserAvatar name={entry.peerName} avatar={entry.peerAvatar} size={44} />
                  </div>

                  {/* Middle: name + status */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginBottom: 3,
                      }}
                    >
                      {entry.peerName}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12,
                        color: getStatusColor(entry),
                      }}
                    >
                      {getStatusIcon(entry)}
                      <span>
                        {entry.direction === 'incoming' ? 'Incoming' : 'Outgoing'}{' '}
                        {entry.message.callType === 'video' ? 'video' : 'voice'} call
                        {' · '}
                        {getStatusLabel(entry)}
                      </span>
                    </div>
                  </div>

                  {/* Right: time */}
                  <div
                    style={{
                      flexShrink: 0,
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      textAlign: 'right',
                    }}
                  >
                    {formatCallTime(entry.date)}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}

        {/* Loading more indicator */}
        {isLoadingMore && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '16px 0',
            color: 'var(--text-secondary)'
          }}>
            <div style={{
              width: 24,
              height: 24,
              border: '2px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: 160,
            zIndex: 10000,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => handleDeleteSingle(contextMenu.messageId)}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 14,
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
          }}
          onClick={() => !isDeleting && setShowDeleteConfirm(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              Delete Call Log{showDeleteConfirm === 'all' || selectedIds.size > 1 ? 's' : ''}?
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {showDeleteConfirm === 'all'
                ? `Are you sure you want to delete all ${callEntries.length} call logs? This action cannot be undone.`
                : showDeleteConfirm === 'selected'
                ? `Are you sure you want to delete ${selectedIds.size} selected call log${selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.`
                : 'Are you sure you want to delete this call log? This action cannot be undone.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                disabled={isDeleting}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'none',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#ef4444',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  color: '#fff',
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CallHistoryPage;
