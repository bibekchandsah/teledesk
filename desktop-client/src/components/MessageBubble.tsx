import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Message } from '@shared/types';
import { formatTime, formatFileSize } from '../utils/formatters';
import UserAvatar from './UserAvatar';
import { Ban, Phone, Video, Paperclip, Trash2, Pencil, Copy, X, CornerUpLeft, Forward, Pin, PinOff, CheckSquare, Bookmark, BookmarkCheck, Check, CheckCheck, SmilePlus } from 'lucide-react';
import { useBookmarkStore } from '../store/bookmarkStore';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  senderName?: string;
  senderAvatar?: string;
  showSender?: boolean;
  onDelete?: (messageId: string, scope: 'me' | 'both') => void;
  onStartEdit?: (message: Message) => void;
  onCall?: (callType: 'voice' | 'video') => void;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onBookmark?: (message: Message) => void;
  onPin?: (message: Message, action: 'pin' | 'unpin') => void;
  isPinned?: boolean;
  onScrollToMessage?: (messageId: string) => void;
  onCloseChat?: () => void;
  onEnterSelect?: (messageId: string) => void;
  searchQuery?: string;
  isActiveSearchMatch?: boolean;
  isHighlighted?: boolean;
  currentUserShowMessageStatus?: boolean;
  otherUserShowMessageStatus?: boolean;
  onReact?: (messageId: string, emoji: string) => void;
  currentUserId?: string;
  getUserName?: (uid: string) => string;
}

const PRESET_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '👎'];

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  senderName,
  senderAvatar,
  showSender = false,
  onDelete,
  onStartEdit,
  onCall,
  onReply,
  onForward,
  onBookmark,
  onPin,
  isPinned = false,
  onScrollToMessage,
  onCloseChat,
  onEnterSelect,
  searchQuery,
  isActiveSearchMatch = false,
  isHighlighted = false,
  currentUserShowMessageStatus = true,
  otherUserShowMessageStatus = true,
  onReact,
  currentUserId,
  getUserName,
}) => {
  // ─── Context menu state ───────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // ─── Double-click reply flash ─────────────────────────────────────────────
  const [replyFlash, setReplyFlash] = useState(false);
  // ─── Bookmark state ───────────────────────────────────────────────────────
  const { isBookmarked, addBookmark, removeBookmark } = useBookmarkStore();
  const bookmarked = isBookmarked(message.messageId);
  // ─── Reaction bar state ───────────────────────────────────────────────────
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [showExtended, setShowExtended] = useState(false);
  const [tooltipEmoji, setTooltipEmoji] = useState<string | null>(null);
  const emojiBarRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setCtxMenu(null);
        setAdjustedPos(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  // Close extended emoji picker on outside click
  useEffect(() => {
    if (!showExtended) return;
    const close = (e: MouseEvent) => {
      if (!emojiBarRef.current?.contains(e.target as Node)) {
        setShowExtended(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showExtended]);

  // Clamp the menu position so it never overflows the viewport
  useLayoutEffect(() => {
    if (!ctxMenu || !menuRef.current) return;
    const { offsetWidth: w, offsetHeight: h } = menuRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8;
    const x = Math.min(ctxMenu.x, vw - w - MARGIN);
    const y = Math.min(ctxMenu.y, vh - h - MARGIN);
    setAdjustedPos({ x: Math.max(MARGIN, x), y: Math.max(MARGIN, y) });
  }, [ctxMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onDelete) return;
    e.preventDefault();
    setAdjustedPos(null);
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDelete = (scope: 'me' | 'both') => {
    setCtxMenu(null);
    onDelete?.(message.messageId, scope);
  };

  const handleStartEdit = () => {
    setCtxMenu(null);
    onStartEdit?.(message);
  };

  const handleCopy = () => {
    setCtxMenu(null);
    if (message.content) navigator.clipboard.writeText(message.content).catch(() => {});
  };

  const handleReply = () => {
    setCtxMenu(null);
    onReply?.(message);
  };

  const handleDoubleClick = () => {
    if (message.deleted || !onReply) return;
    setReplyFlash(true);
    setTimeout(() => setReplyFlash(false), 400);
    onReply(message);
  };

  const handleForward = () => {
    setCtxMenu(null);
    onForward?.(message);
  };

  const handleBookmark = () => {
    setCtxMenu(null);
    if (bookmarked) {
      removeBookmark(message.messageId);
    } else {
      addBookmark(message);
      onBookmark?.(message);
    }
  };

  const handlePin = () => {
    setCtxMenu(null);
    if (!message.deleted) onPin?.(message, isPinned ? 'unpin' : 'pin');
  };

  const handleEmojiClick = (emoji: string) => {
    setShowEmojiBar(false);
    setShowExtended(false);
    setCtxMenu(null);
    onReact?.(message.messageId, emoji);
  };

  const handleEmojiMartSelect = (emojiData: any) => {
    handleEmojiClick(emojiData.native);
  };

  const handleMouseEnterBubble = () => {
    if (message.deleted) return;
    hoverTimerRef.current = setTimeout(() => setShowEmojiBar(true), 150);
  };

  const handleMouseLeaveBubble = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    // Small delay so user can move mouse from bubble to emoji bar
    setTimeout(() => {
      if (!emojiBarRef.current?.matches(':hover')) {
        setShowEmojiBar(false);
        setShowExtended(false);
      }
    }, 120);
  };

  const reactions = message.reactions ?? {};
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  const renderContent = () => {
    if (message.deleted) {
      return (
        <p style={{ margin: 0, fontStyle: 'italic', opacity: 0.6, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ban size={14} /> This message was deleted
        </p>
      );
    }

    if (message.type === 'call') {
      const viewerStatus = isOwn
        ? message.callStatus
        : (message.callStatusReceiver ?? message.callStatus);

      const iconEl = message.callType === 'video' ? <Video size={18} /> : <Phone size={18} />;
      const typeName = message.callType === 'video' ? 'Video' : 'Voice';
      const dur = message.callDuration ?? 0;
      const m = Math.floor(dur / 60);
      const s = dur % 60;
      const dStr = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;

      let label: string;
      if (viewerStatus === 'completed') {
        label = `${typeName} call`;
      } else if (viewerStatus === 'missed') {
        label = `Missed ${message.callType} call`;
      } else if (viewerStatus === 'no_answer') {
        label = `${typeName} call — no answer`;
      } else if (viewerStatus === 'declined') {
        label = `${typeName} call declined`;
      } else {
        label = `${typeName} call cancelled`;
      }

      const isFailed = viewerStatus === 'missed' || viewerStatus === 'cancelled' || viewerStatus === 'declined' || viewerStatus === 'no_answer';
      const callColor = isFailed ? '#f87171' : undefined;

      return (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: onCall ? 'pointer' : 'default' }}
          onClick={() => onCall?.(message.callType ?? 'voice')}
          title={onCall ? `Call back (${message.callType ?? 'voice'})` : undefined}
        >
          <span style={{ display: 'flex', alignItems: 'center', color: callColor }}>{iconEl}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: callColor }}>{label}</div>
            {viewerStatus === 'completed' && dur > 0 && (
              <div style={{ fontSize: 12, opacity: 0.7 }}>{dStr}</div>
            )}
          </div>
        </div>
      );
    }

    switch (message.type) {
      case 'image':
      case 'gif':
      case 'sticker':
        return (
          <div className="message-image">
            <img
              src={message.fileUrl}
              alt={message.fileName || 'image'}
              style={{ 
                maxWidth: 280, 
                maxHeight: 200, 
                borderRadius: 8, 
                cursor: message.type === 'image' ? 'pointer' : 'default' 
              }}
              onClick={() => {
                if (message.type === 'image') window.open(message.fileUrl, '_blank');
              }}
            />
            {message.content && (
              <p className="message-caption">{message.content}</p>
            )}
          </div>
        );

      case 'video':
        return (
          <div className="message-video">
            <video
              src={message.fileUrl}
              controls
              style={{ maxWidth: 280, borderRadius: 8 }}
            />
          </div>
        );

      case 'audio':
        return (
          <div className="message-audio">
            <audio src={message.fileUrl} controls style={{ width: 240 }} />
          </div>
        );

      case 'file':
        return (
          <a
            href={message.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="message-file"
            style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}
          >
            <Paperclip size={18} className="file-icon" />
            <div>
              <div className="file-name" style={{ fontSize: 14, fontWeight: 500 }}>
                {message.fileName || 'File'}
              </div>
              {message.fileSize && (
                <div className="file-size" style={{ fontSize: 12, opacity: 0.7 }}>
                  {formatFileSize(message.fileSize)}
                </div>
              )}
            </div>
          </a>
        );

      default:
        return (
          <p style={{ margin: 0, wordBreak: 'break-word' }}>{highlightText(message.content ?? '', searchQuery)}</p>
        );
    }
  };

  return (
    <>
    <div
      className={`message-bubble-wrapper ${isOwn ? 'own' : 'other'}`}
      style={{
        display: 'flex',
        flexDirection: isOwn ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 8,
        marginBottom: reactionEntries.length > 0 ? 8 : 4,
        padding: '0 16px',
        position: 'relative',
      }}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnterBubble}
      onMouseLeave={handleMouseLeaveBubble}
    >
      {!isOwn && showSender && (
        <UserAvatar name={senderName || 'User'} avatar={senderAvatar} size={28} />
      )}

      <div style={{ maxWidth: '65%', position: 'relative' }}>
        {showSender && !isOwn && senderName && (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 2, paddingLeft: 2 }}>
            {senderName}
          </div>
        )}

        {/* ─── Hovering Emoji Quick-Bar ──────────────────────────────────── */}
        {showEmojiBar && !message.deleted && onReact && (
          <div
            ref={emojiBarRef}
            onMouseLeave={() => { setShowEmojiBar(false); setShowExtended(false); }}
            style={{
              position: 'absolute',
              [isOwn ? 'right' : 'left']: 0,
              bottom: '100%',
              marginBottom: 6,
              zIndex: 200,
              display: 'flex',
              flexDirection: 'column',
              alignItems: isOwn ? 'flex-end' : 'flex-start',
              gap: 4,
              animation: 'reactionBarSlideUp 0.15s ease-out',
            }}
          >
            {/* Emoji Mart Picker */}
            {showExtended && (
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(12px)',
                overflow: 'hidden',
              }}>
                <Picker 
                  data={data} 
                  onEmojiSelect={handleEmojiMartSelect} 
                  theme="auto" 
                  previewPosition="none"
                  skinTonePosition="none"
                  navPosition="bottom"
                />
              </div>
            )}

            {/* Quick preset bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: '4px 8px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 24,
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              backdropFilter: 'blur(12px)',
            }}>
              {PRESET_EMOJIS.map(em => {
                const alreadyReacted = (reactions[em] ?? []).includes(currentUserId ?? '');
                return (
                  <button
                    key={em}
                    onClick={() => handleEmojiClick(em)}
                    title={em}
                    style={{
                      background: alreadyReacted ? 'rgba(var(--accent-rgb,99,102,241),0.15)' : 'none',
                      border: 'none',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      padding: '4px',
                      fontSize: 20,
                      lineHeight: 1,
                      transition: 'transform 0.12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.4)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    {em}
                  </button>
                );
              })}
              {/* More emojis button */}
              <button
                onClick={() => setShowExtended(v => !v)}
                title="More reactions"
                style={{
                  background: 'none',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-secondary, #aaa)',
                  transition: 'transform 0.12s, color 0.12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.3)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary, #aaa)'; }}
              >
                <SmilePlus size={18} />
              </button>
            </div>
          </div>
        )}

        <div
          className={`message-bubble ${isOwn ? 'bubble-own' : 'bubble-other'}`}
          style={{
            backgroundColor: isOwn ? 'var(--accent)' : 'var(--bg-secondary)',
            color: isOwn ? '#fff' : 'var(--text-primary)',
            borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            padding: '8px 12px',
            fontSize: 14,
            lineHeight: 1.5,
            outline: isHighlighted
              ? '2px solid var(--accent)'
              : isActiveSearchMatch
              ? '2px solid var(--accent)'
              : undefined,
            outlineOffset: isHighlighted || isActiveSearchMatch ? 2 : undefined,
            boxShadow: isHighlighted ? '0 0 0 4px rgba(var(--accent-rgb, 99,102,241), 0.25)' : undefined,
            transition: 'opacity 0.15s, box-shadow 0.3s, outline 0.3s',
            opacity: replyFlash ? 0.5 : 1,
          }}
        >
          {/* Forwarded indicator */}
          {message.forwarded && !message.deleted && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginBottom: 4,
                opacity: 0.65,
                fontSize: 11,
                fontStyle: 'italic',
              }}
            >
              <Forward size={11} />
              Forwarded message
            </div>
          )}
          {/* Reply quote */}
          {message.replyTo && !message.deleted && (
            <div
              onClick={() => onScrollToMessage?.(message.replyTo!.messageId)}
              style={{
                borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.5)' : 'var(--accent)'}`,
                paddingLeft: 8,
                marginBottom: 6,
                opacity: 0.8,
                fontSize: 12,
                maxWidth: 240,
                cursor: onScrollToMessage ? 'pointer' : 'default',
                borderRadius: '0 4px 4px 0',
                backgroundColor: isOwn ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.06)',
                padding: '4px 8px',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {message.replyTo.senderName || 'Unknown'}
              </div>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.85 }}>
                {message.replyTo.type !== 'text' && !message.replyTo.content
                  ? `[${message.replyTo.type}]`
                  : message.replyTo.content || `[${message.replyTo.type}]`}
              </div>
            </div>
          )}
          {renderContent()}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 4,
              marginTop: 4,
              opacity: 0.7,
              fontSize: 11,
            }}
          >
            {isPinned && !message.deleted && (
              <Pin size={11} style={{ opacity: 0.8, flexShrink: 0 }} />
            )}
            <span>{formatTime(message.timestamp)}</span>
            {message.isEdited && !message.deleted && (
              <span style={{ fontSize: 10, opacity: 0.65, fontStyle: 'italic' }}>edited</span>
            )}
            {isOwn && !message.deleted && currentUserShowMessageStatus && otherUserShowMessageStatus && (
              <span style={{ display: 'flex', alignItems: 'center', marginLeft: 1 }}>
                {message.readBy.length > 1
                  ? <CheckCheck size={13} style={{ color: '#4fc3f7' }} />
                  : (message.deliveredTo ?? []).length > 0
                    ? <CheckCheck size={13} style={{ opacity: 0.65 }} />
                    : <Check size={13} style={{ opacity: 0.65 }} />}
              </span>
            )}
          </div>
        </div>

        {/* ─── Reaction Pill Badges ──────────────────────────────────────── */}
        {reactionEntries.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              marginTop: 4,
              justifyContent: isOwn ? 'flex-end' : 'flex-start',
            }}
          >
            {reactionEntries.map(([emoji, users]) => {
              const iMine = currentUserId ? users.includes(currentUserId) : false;
              const isHovered = tooltipEmoji === emoji;
              const names = getUserName
                ? users.map(id => getUserName(id)).filter(Boolean).join(', ')
                : `${users.length} ${users.length === 1 ? 'person' : 'people'}`;
              return (
                <div key={emoji} style={{ position: 'relative', display: 'inline-flex' }}>
                  {/* Tooltip */}
                  {isHovered && (
                    <div style={{
                      position: 'absolute',
                      bottom: '110%',
                      [isOwn ? 'right' : 'left']: 0,
                      backgroundColor: 'rgba(0,0,0,0.85)',
                      color: '#fff',
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 6,
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      zIndex: 300,
                      backdropFilter: 'blur(4px)',
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {names}
                    </div>
                  )}
                  <button
                    onClick={() => onReact?.(message.messageId, emoji)}
                    onMouseEnter={() => setTooltipEmoji(emoji)}
                    onMouseLeave={() => setTooltipEmoji(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      borderRadius: 16,
                      backgroundColor: iMine ? 'rgba(var(--accent-rgb, 99, 102, 241), 0.15)' : 'var(--bg-tertiary)',
                      border: `1px solid ${iMine ? 'rgba(var(--accent-rgb, 99, 102, 241), 0.4)' : 'var(--border)'}`,
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'transform 0.1s, background-color 0.2s',
                    }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
                    onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <span style={{ fontSize: 13, lineHeight: 1 }}>{emoji}</span>
                    {users.length > 1 && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: iMine ? 'var(--accent)' : 'var(--text-secondary)'
                      }}>
                        {users.length}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

    {/* ─── Right-click context menu ────────────────────────────────────── */}
    {ctxMenu && (
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          top: adjustedPos ? adjustedPos.y : ctxMenu.y,
          left: adjustedPos ? adjustedPos.x : ctxMenu.x,
          visibility: adjustedPos ? 'visible' : 'hidden',
          zIndex: 1000,
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          minWidth: 170,
        }}
      >
        {onCloseChat && (
          <>
            <button onClick={() => { setCtxMenu(null); onCloseChat(); }} style={menuItemStyle}>
              <X size={14} style={{ marginRight: 6 }} />Close chat
            </button>
            <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
          </>
        )}
        {onEnterSelect && (
          <>
            <button onClick={() => { setCtxMenu(null); onEnterSelect(message.messageId); }} style={menuItemStyle}>
              <CheckSquare size={14} style={{ marginRight: 6 }} />Select
            </button>
            <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
          </>
        )}
        {/* ─ React option ─ */}
        {!message.deleted && onReact && (
          <>
            <div style={{ padding: '6px 12px 4px', display: 'flex', gap: 6, alignItems: 'center' }}>
              {PRESET_EMOJIS.map(em => (
                <button
                  key={em}
                  onClick={() => handleEmojiClick(em)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 18,
                    padding: '2px',
                    borderRadius: '50%',
                    transition: 'transform 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.4)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {em}
                </button>
              ))}
            </div>
            <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
          </>
        )}
        {isOwn && !message.deleted && message.type === 'text' && (
          <button onClick={handleStartEdit} style={menuItemStyle}>
            <Pencil size={14} style={{ marginRight: 6 }} />Edit message
          </button>
        )}
        {!message.deleted && (
          <button onClick={handleReply} style={menuItemStyle}>
            <CornerUpLeft size={14} style={{ marginRight: 6 }} />Reply message
          </button>
        )}
        {!message.deleted && message.content && (
          <button onClick={handleCopy} style={menuItemStyle}>
            <Copy size={14} style={{ marginRight: 6 }} />Copy message
          </button>
        )}
        {!message.deleted && (
          <button onClick={handleForward} style={menuItemStyle}>
            <Forward size={14} style={{ marginRight: 6 }} />Forward message
          </button>
        )}
        {!message.deleted && (
          <button onClick={handleBookmark} style={bookmarked ? { ...menuItemStyle, color: 'var(--accent)' } : menuItemStyle}>
            {bookmarked
              ? <><BookmarkCheck size={14} style={{ marginRight: 6 }} />Remove bookmark</>  
              : <><Bookmark size={14} style={{ marginRight: 6 }} />Save to bookmarks</>}
          </button>
        )}
        {!message.deleted && onPin && (
          <button onClick={handlePin} style={menuItemStyle}>
            {isPinned
              ? <><PinOff size={14} style={{ marginRight: 6 }} />Unpin message</>
              : <><Pin size={14} style={{ marginRight: 6 }} />Pin message</>}
          </button>
        )}
        <button onClick={() => handleDelete('me')} style={menuItemStyle}>
          <Trash2 size={14} style={{ marginRight: 6 }} />Delete for me
        </button>
        {!message.deleted && (
          <button onClick={() => handleDelete('both')} style={{ ...menuItemStyle, color: 'var(--error, #e74c3c)' }}>
            <Trash2 size={14} style={{ marginRight: 6 }} />Delete for everyone
          </button>
        )}
      </div>
    )}

    {/* ─── Reaction animation keyframes ─────────────────────────────────── */}
    <style>{`
      @keyframes reactionBarSlideUp {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes reactionPop {
        0%   { transform: scale(0.6); opacity: 0; }
        70%  { transform: scale(1.15); }
        100% { transform: scale(1);   opacity: 1; }
      }
    `}</style>
    </>
  );
};

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 16px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 14,
  color: 'var(--text-primary)',
};

/** Splits `text` and wraps occurrences of `query` in a yellow highlight span. */
const highlightText = (text: string, query?: string): React.ReactNode => {
  if (!query || !query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} style={{ backgroundColor: '#facc15', color: '#1a1a1a', borderRadius: 2, padding: '0 1px' }}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
};

export default MessageBubble;
