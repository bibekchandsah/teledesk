import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
// crypto.randomUUID() is available in Electron/Chromium without polyfill
const genId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import MessageBubble, { renderMessageText } from '../components/MessageBubble';
import TypingIndicator from '../components/TypingIndicator';
import UserAvatar from '../components/UserAvatar';
import { listenToMessages } from '../services/firebaseService';
import { sendMessage, sendTyping, sendLiveTyping, sendReadReceipt, joinChatRoom, leaveChatRoom, sendReaction, removeReaction, getSocket } from '../services/socketService';
import { uploadChatFile, getMessageTypeFromMime, validateFile } from '../services/fileService';
import { markChatRead, getChatMessages, deleteMessage as deleteMessageApi, editMessage as editMessageApi, pinMessage as pinMessageApi, unpinMessage as unpinMessageApi, deleteChat as deleteChatApi } from '../services/apiService';
import { Message } from '@shared/types';
import { useCallContext } from '../context/CallContext';
import { APP_CONFIG } from '@shared/constants/config';
import { useUIStore } from '../store/uiStore';
import ErrorModal from '../components/modals/ErrorModal';
import { useCallStore } from '../store/callStore';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useDraftStore } from '../store/draftStore';
import { MessageCircle, Phone, Video, Paperclip, Download, Send, ChevronLeft, Search, X, ChevronUp, ChevronDown, CornerUpLeft, Pin, PinOff, Archive, ArchiveRestore, CheckSquare, Trash2, Forward, Copy, MoreVertical, ExternalLink, Pencil, Bookmark, BookmarkCheck, UserRound, Smile, SmilePlus, Image as ImageIcon, Sticker, Mic, MicOff, VideoOff, Play, Pause, Circle, StopCircle, RefreshCw, AlertCircle, Check, CheckCheck, Plus, Lock, Unlock, Palette, Eye, EyeOff, Scissors, Clipboard, ClipboardPaste, Bold, Italic, Underline, Strikethrough, Code, List, ListOrdered, Quote, Link, EyeOff as SpoilerIcon, Sparkles } from 'lucide-react';
import { getDateKey, formatDateLabel, formatTime, formatLastSeen, formatFileSize, formatDuration } from '../utils/formatters';

import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import MessageContextMenu from '../components/MessageContextMenu';
import ChatThemeModal from '../components/modals/ChatThemeModal';
import ImageSpoiler from '../components/ImageSpoiler';
import PremiumToggle from '../components/PremiumToggle';

export const downloadMessageFile = async (m: Message) => {
  if (!m.fileUrl) return;
  if (window.electronAPI?.downloadFile) {
    window.electronAPI.downloadFile(m.fileUrl, m.fileName);
  } else {
    try {
      // 1. Try to fetch as blob to force a real download (prevents navigation)
      const res = await fetch(m.fileUrl, { mode: 'cors' });
      if (!res.ok) throw new Error('Fetch failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = m.fileName || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      // 2. Fallback to direct anchor (safeguard with target="_blank" to prevent same-page navigation)
      const link = document.createElement('a');
      link.href = m.fileUrl;
      link.download = m.fileName || 'download';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
};

const convertToPng = (blob: Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context failed')); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      reject(new Error('Image load failed'));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(blob);
  });
};

// --- MediaGroupBubble Subcomponent ---
const MediaGroupBubble = ({
  msgs,
  firstMsg,
  lastMsg,
  isOwn,
  showDatePill,
  onPreview,
  onDelete,
  onReply,
  onForward,
  onBookmark,
  onDownload,
  onPin,
  isPinned,
  bookmarkedIds,
  currentUser,
  onEnterSelect,
  onMessageReaction,
  selectionMode,
  selectedIds,
  onToggleSelect,
  highlightedMsgId,
  onMentionClick,
}: {
  msgs: Message[];
  firstMsg: Message;
  lastMsg: Message;
  isOwn: boolean;
  showDatePill: boolean;
  onPreview: (msgs: Message[], index: number) => void;
  onDelete?: (messageId: string, scope: 'me' | 'both') => void;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onBookmark?: (message: Message) => void;
  onDownload?: (message: Message) => void;
  onPin?: (message: Message, action: 'pin' | 'unpin') => void;
  isPinned: (messageId: string) => boolean;
  bookmarkedIds: Set<string>;
  currentUser?: { uid: string } | null;
  onEnterSelect?: (messageId: string) => void;
  onMessageReaction?: (messageId: string, emoji: string) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  highlightedMsgId?: string | null;
  onMentionClick?: (text: string, type: 'username' | 'email') => void;
}) => {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number, msg: Message } | null>(null);
  const [isGroupHovered, setIsGroupHovered] = useState(false);
  const [showExtended, setShowExtended] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Clear hover state when context menu opens
  useEffect(() => {
    if (ctxMenu) {
      setIsGroupHovered(false);
      setShowExtended(false);
    }
  }, [ctxMenu]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const combinedReactions = useMemo(() => {
    const combined: Record<string, string[]> = {};
    msgs.forEach(m => {
      if (m.reactions) {
        Object.entries(m.reactions).forEach(([emoji, users]) => {
          if (!combined[emoji]) combined[emoji] = [];
          users.forEach(u => {
            if (!combined[emoji].includes(u)) combined[emoji].push(u);
          });
        });
      }
    });
    return combined;
  }, [msgs]);

  const is2Col = msgs.length === 2 || msgs.length === 4;

  const menuItemStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none',
    textAlign: 'left', cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)',
  };

  const handleCopyImage = async (m: Message) => {
    if (!m.fileUrl) return;
    try {
      // 1. Electron native copy
      if (window.electronAPI?.copyImageToClipboard) {
        const ok = await window.electronAPI.copyImageToClipboard(m.fileUrl);
        if (ok) {
          showToast('Image copied to clipboard');
          return;
        }
      }

      // 2. Browser Clipboard API
      if (navigator.clipboard && (window as any).ClipboardItem) {
        try {
          // Add cache-buster to force fresh CORS request
          const fetchUrl = m.fileUrl.includes('?') ? `${m.fileUrl}&cors=1` : `${m.fileUrl}?cors=1`;
          const res = await fetch(fetchUrl, { mode: 'cors' });
          if (!res.ok) throw new Error('Fetch failed');
          const blob = await res.blob();
          
          let finalBlob = blob;
          if (blob.type !== 'image/png') {
            finalBlob = await convertToPng(blob);
          }
          
          await navigator.clipboard.write([
            new (window as any).ClipboardItem({ [finalBlob.type]: finalBlob })
          ]);
          showToast('Image copied to clipboard');
          return;
        } catch (err) {
          console.warn('Browser blocked direct image data access (CORS). Falling back to URL copy.');
        }
      }

      // 3. Fallback: Copy URL as text
      try {
        if (window.electronAPI?.copyTextToClipboard) {
          window.electronAPI.copyTextToClipboard(m.fileUrl);
        } else {
          await navigator.clipboard.writeText(m.fileUrl);
        }
        showToast('Direct copy blocked by browser. Image link copied.');
      } catch (err) {
        console.error('Copy URL fallback failed:', err);
        showToast('Failed to copy image link');
      }
    } catch (err) {
      showToast('Failed to copy image');
    }
  };

  const handleEmojiClick = (msgId: string, emoji: string) => {
    setCtxMenu(null);
    onMessageReaction?.(msgId, emoji);
  };

  return (
    <React.Fragment key={`group_${firstMsg.groupId}`}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          backgroundColor: 'rgba(30,30,30,0.92)', color: '#fff',
          padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 9999,
          pointerEvents: 'none', whiteSpace: 'nowrap',
          animation: 'fadeIn 0.2s ease',
        }}>{toast}</div>
      )}
      {showDatePill && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <span style={{
            backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
            fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
            border: '1px solid var(--border)', letterSpacing: '0.03em', userSelect: 'none',
          }}>
            {formatDateLabel(firstMsg.timestamp)}
          </span>
        </div>
      )}
      <div 
        style={{ position: 'relative' }}
        onMouseEnter={() => {
          // Only show hover on non-touch devices
          if (!('ontouchstart' in window)) {
            setIsGroupHovered(true);
          }
        }}
        onMouseLeave={() => { setIsGroupHovered(false); setShowExtended(false); }}
        onTouchStart={() => {
          // On touch devices, don't show hover reaction row
          setIsGroupHovered(false);
        }}
      >
        <div
          style={{ display: 'flex', padding: '0 16px', marginBottom: 4, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}
        >
          <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* Caption — shown above the grid when last message has custom text */}
          {(() => {
            const cap = lastMsg.content;
            const isDefaultContent = !cap || cap.startsWith('Sent a ') || cap === '';
            if (isDefaultContent) return null;
            return (
              <div style={{
                fontSize: 13,
                // color: '#fff',
                color: isOwn ? '#fff' : 'var(--text-primary)',
                padding: '7px 12px 8px',
                wordBreak: 'break-word',
                maxWidth: '100%',
                background: isOwn ? 'var(--accent)' : 'var(--bg-secondary)',
                borderRadius: '12px 12px 0px 0px',
              }}>{lastMsg.content && renderMessageText(cap, '', isOwn, onMentionClick)}</div>
            );
          })()}
          <div style={{
            display: (firstMsg.type === 'file' || firstMsg.type === 'pdf') ? 'flex' : 'grid',
            flexDirection: (firstMsg.type === 'file' || firstMsg.type === 'pdf') ? 'column' : undefined,
            gridTemplateColumns: (firstMsg.type === 'file' || firstMsg.type === 'pdf') ? undefined : 'repeat(6, 1fr)',
            gridAutoRows: msgs.length === 1 ? undefined : 'clamp(70px, 18vw, 110px)',
            gap: 3,
            borderRadius: (!lastMsg.content || lastMsg.content.startsWith('Sent a ')) ? 12 : '0px 0px 12px 12px',
            overflow: 'hidden',
            maxWidth: (firstMsg.type === 'file' || firstMsg.type === 'pdf') ? 300 : 'min(340px, calc(100vw - 96px))',
            width: msgs.length > 1 ? (is2Col ? 'min(220px, calc(100vw - 96px))' : 'min(330px, calc(100vw - 96px))') : undefined,
            backgroundColor: (firstMsg.type === 'file' || firstMsg.type === 'pdf') ? (isOwn ? 'var(--accent)' : 'var(--bg-secondary)') : (isOwn ? 'var(--accent)' : 'var(--bg-secondary)'),
            border: (firstMsg.type === 'file' || firstMsg.type === 'pdf') ? '1px solid var(--border)' : 'none',
            padding: (firstMsg.type === 'file' || firstMsg.type === 'pdf') ? '4px 0' : '4px',
            // color: '#fff',
            color: isOwn ? '#fff' : 'var(--text-primary)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            outline: msgs.some(m => m.messageId === highlightedMsgId) ? '2px solid var(--accent)' : undefined,
            outlineOffset: msgs.some(m => m.messageId === highlightedMsgId) ? 2 : undefined,
            transition: 'outline 0.3s, box-shadow 0.3s',
          }}>
            {msgs.map((m, ci) => {
              let colSpan = 'span 2';
              if (msgs.length === 1) colSpan = 'span 6';
              else if (msgs.length === 2 || msgs.length === 4) colSpan = 'span 3';
              else if (msgs.length === 5) { if (ci < 2) colSpan = 'span 3'; else colSpan = 'span 2'; }
              else if (msgs.length === 7) { if (ci < 4) colSpan = 'span 3'; else colSpan = 'span 2'; }
              else if (msgs.length === 8) { if (ci < 6) colSpan = 'span 2'; else colSpan = 'span 3'; }
              
              if (m.type === 'file' || m.type === 'pdf') {
                const isSelected = selectedIds?.has(m.messageId);
                return (
                  <div
                    key={m.messageId}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 8, 
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderBottom: ci < msgs.length - 1 ? '1px solid var(--border)' : 'none',
                      backgroundColor: isSelected ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent'
                    }}
                    onClick={() => {
                      if (selectionMode && onToggleSelect) {
                        onToggleSelect(m.messageId);
                      } else {
                        onPreview(msgs, ci);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      // Clear any text selection
                      if (window.getSelection) {
                        window.getSelection()?.removeAllRanges();
                      }
                      // Hide hover reaction row
                      setIsGroupHovered(false);
                      setCtxMenu({ x: e.clientX, y: e.clientY, msg: m });
                    }}
                  >
                    {selectionMode && (
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%',
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginRight: 4, flexShrink: 0
                      }}>
                        {isSelected && <Check size={10} color="#fff" strokeWidth={3} />}
                      </div>
                    )}
                    <div style={{ 
                      width: 36, height: 36, borderRadius: 8, 
                      // backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(var(--accent-rgb), 0.1)', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color:'#fff',
                      // color: isOwn ? '#fff' : 'var(--accent)'
                    }}>
                      <Paperclip size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.fileName || 'Document'}
                      </div>
                      {m.fileSize && (
                        <div style={{ fontSize: 11, opacity: 0.6 }}>
                          {formatFileSize(m.fileSize)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              const isSelected = selectedIds?.has(m.messageId);
              // compute per-cell border-radius
              const totalCells = msgs.length;
              const ci2 = ci; // alias for clarity
              const isFirst = ci2 === 0;
              const isLast = ci2 === totalCells - 1;
              const cellRadius = (() => {
                if (totalCells === 1) return '8px';
                if (isFirst) return '8px 8px 8px 8px';
                if (isLast) return '8px 8px 8px 8px';
                return '8px';
              })();
              return (
                <div
                  key={m.messageId}
                  style={{ position: 'relative', gridColumn: colSpan, overflow: 'hidden', cursor: 'pointer', backgroundColor: '#111', borderRadius: cellRadius, maxHeight: msgs.length === 1 ? 320 : undefined }}
                  onClick={() => {
                    if (selectionMode && onToggleSelect) {
                      onToggleSelect(m.messageId);
                    } else if (!m.isSpoiler) {
                      // When NOT a spoiler, the outer div opens preview directly.
                      // When it IS a spoiler, ImageSpoiler handles clicks internally
                      // (toggle reveal) and exposes its own expand icon to open preview.
                      onPreview(msgs, ci);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    // Clear any text selection
                    if (window.getSelection) {
                      window.getSelection()?.removeAllRanges();
                    }
                    // Hide hover reaction row
                    setIsGroupHovered(false);
                    setCtxMenu({ x: e.clientX, y: e.clientY, msg: m });
                  }}
                >
                  {m.type === 'image' || m.type === 'gif' ? (
                    m.isSpoiler ? (
                      <ImageSpoiler 
                        src={m.fileUrl!} 
                        alt={m.fileName}
                        onClick={() => onPreview(msgs, ci)}
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                    <img 
                      src={m.fileUrl} 
                      alt={m.fileName} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                    )
                  ) : m.type === 'video' ? (
                    m.isSpoiler ? (
                      <ImageSpoiler 
                        src={m.fileUrl!} 
                        alt={m.fileName}
                        isVideo={true}
                        onClick={() => onPreview(msgs, ci)}
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                      <video src={m.fileUrl} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <Paperclip size={24} color="var(--text-secondary)" />
                    </div>
                  )}
                  
                  {/* Selection Overlay */}
                  {selectionMode && (
                    <div style={{
                      position: 'absolute',
                      top: 8, left: 8,
                      width: 22, height: 22,
                      borderRadius: '50%',
                      backgroundColor: isSelected ? 'var(--accent)' : 'rgba(0,0,0,0.35)',
                      border: `2px solid ${isSelected ? 'var(--accent)' : '#fff'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      zIndex: 10
                    }}>
                      {isSelected && <Check size={14} color="#fff" strokeWidth={3} />}
                    </div>
                  )}
                  {isSelected && (
                    <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(var(--accent-rgb), 0.15)', zIndex: 5 }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Group-level hover reaction bar */}
          {!selectionMode && isGroupHovered && onMessageReaction && !ctxMenu && (
            <div 
              onMouseLeave={() => setShowExtended(false)}
              style={{
                position: 'absolute',
                [isOwn ? 'right' : 'left']: 0,
                bottom: '100%',
                paddingBottom: 6,
                zIndex: 200,
                display: 'flex',
                flexDirection: 'column',
                alignItems: isOwn ? 'flex-end' : 'flex-start',
                gap: 4,
                animation: 'reactionBarSlideUp 0.15s ease-out',
              }}>
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
                    onEmojiSelect={(emojiId: any) => {
                      handleEmojiClick(firstMsg.messageId, emojiId.native);
                      setShowExtended(false);
                    }} 
                    theme="auto" 
                    previewPosition="none"
                    skinTonePosition="none"
                    navPosition="bottom"
                  />
                </div>
              )}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 2, padding: '4px 8px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 24,
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                backdropFilter: 'blur(12px)',
              }}>
                {['❤️','👍','😂','😮','😢','👎'].map(em => {
                  const alreadyReacted = Object.entries(combinedReactions).some(([emoji, users]) => emoji === em && currentUser?.uid && users.includes(currentUser.uid));
                  return (
                    <button key={em}
                      onClick={(e) => { e.stopPropagation(); handleEmojiClick(firstMsg.messageId, em); }}
                      style={{ 
                        background: alreadyReacted ? 'rgba(var(--accent-rgb,99,102,241),0.15)' : 'none', 
                        border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '4px', borderRadius: '50%', transition: 'transform 0.12s' 
                      }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.4)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                      title={em}
                    >{em}</button>
                  );
                })}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowExtended(v => !v); }}
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

          {/* Reaction Pill Badges for Group */}
          {Object.keys(combinedReactions).length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6,
              justifyContent: isOwn ? 'flex-end' : 'flex-start',
            }}>
              {Object.entries(combinedReactions).map(([emoji, users]) => {
                const iMine = currentUser?.uid ? users.includes(currentUser.uid) : false;
                return (
                  <button
                    key={emoji}
                    onClick={() => onMessageReaction?.(firstMsg.messageId, emoji)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 12,
                      backgroundColor: iMine ? 'rgba(var(--accent-rgb, 99, 102, 241), 0.2)' : 'rgba(255,255,255,0.1)',
                      border: `1px solid ${iMine ? 'rgba(var(--accent-rgb, 99, 102, 241), 0.4)' : 'transparent'}`,
                      cursor: 'pointer', color: '#fff', fontSize: 12
                    }}
                  >
                    <span>{emoji}</span>
                    {users.length > 1 && <span style={{ fontWeight: 600 }}>{users.length}</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', marginTop: 4, fontSize: 11, opacity: 0.7, gap: 4, color: isOwn ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)' }}>
            <span>{formatTime(lastMsg.timestamp)}</span>
            {isOwn && (
              <span style={{ display: 'flex', alignItems: 'center' }}>
                {lastMsg.readBy.length > 1
                  ? <CheckCheck size={13} style={{ color: isOwn ? '#fff' : '#4fc3f7' }} />
                  : (lastMsg.deliveredTo ?? []).length > 0
                    ? <CheckCheck size={13} style={{ opacity: 0.8 }} />
                    : <Check size={13} style={{ opacity: 0.8 }} />}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
      {ctxMenu && (
        <MessageContextMenu
          message={ctxMenu.msg}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          isOwn={isOwn}
          bookmarked={bookmarkedIds.has(ctxMenu.msg.messageId)}
          isPinned={isPinned(ctxMenu.msg.messageId)}
          onReply={onReply}
          onForward={onForward}
          onBookmark={onBookmark}
          onPin={onPin}
          onDelete={onDelete}
          onCopy={(m) => {
            if (m.type === 'text' && m.content) {
              if (window.electronAPI?.copyTextToClipboard) {
                window.electronAPI.copyTextToClipboard(m.content);
              } else {
                navigator.clipboard.writeText(m.content).catch(() => {});
              }
              showToast('Message copied to clipboard');
            } else if (m.type === 'image' || m.type === 'gif' || m.type === 'sticker') {
              handleCopyImage(m);
            }
          }}
          onDownload={onDownload}
          onEnterSelect={onEnterSelect}
          onMessageReaction={onMessageReaction}
        />
      )}
    </React.Fragment>
  );
};
// ------------------------------------

const headerBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 6,
  borderRadius: 8,
  color: 'var(--text-secondary)',
  transition: 'background-color 0.15s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const headerCtxItemStyle: React.CSSProperties = {
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

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 6,
  borderRadius: 8,
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const searchNavBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 6,
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const scrollNavBtnStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  transition: 'background-color 0.15s',
};

const selActionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '6px 8px',
  borderRadius: 8,
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  fontSize: 13,
};

const selListItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '10px 16px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  fontSize: 14,
  color: 'var(--text-primary)',
};

const FilePreviewer: React.FC<{ messages: Message[]; initialIndex: number; onClose: () => void }> = ({ messages, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const message = messages[currentIndex];
  const isImage = message.type === 'image' || message.type === 'gif' || message.type === 'sticker';
  const isVideo = message.type === 'video' || message.type === 'video_note';
  const isPdf = message.fileName?.toLowerCase().endsWith('.pdf');
  const textExtensions = ['.txt', '.md', '.log', '.json', '.js', '.ts', '.py', '.html', '.css', '.xml', '.c', '.cpp', '.h', '.sql', '.yaml', '.yml'];
  const isText = textExtensions.some(ext => message.fileName?.toLowerCase().endsWith(ext));
  const isCsv = message.fileName?.toLowerCase().endsWith('.csv');
  const isVoice = message.type === 'audio' || message.type === 'voice_note';

  // Image zoom/pan — handled by react-zoom-pan-pinch
  const transformRef = useRef<any>(null);
  const resetZoom = () => {
    transformRef.current?.resetTransform();
    setZoomDisplay(100);
  };
  const [zoomDisplay, setZoomDisplay] = useState(100);
  
  // Text/CSV content state
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if ((isText || isCsv) && message.fileUrl) {
      setIsLoadingContent(true);
      fetch(message.fileUrl)
        .then(res => res.text())
        .then(text => {
          // Limit to 1MB for safety
          setTextContent(text.slice(0, 1024 * 1024));
          setIsLoadingContent(false);
        })
        .catch(err => {
          console.error('Failed to fetch text content:', err);
          setIsLoadingContent(false);
        });
    }
  }, [isText, isCsv, message.fileUrl]);

  const copyImage = async () => {
    if (!isImage || !message.fileUrl) return;
    try {
      // 1. Electron native copy
      if (window.electronAPI?.copyImageToClipboard) {
        const ok = await window.electronAPI.copyImageToClipboard(message.fileUrl);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          return;
        }
      }

      // 2. Browser Clipboard API
      if (navigator.clipboard && (window as any).ClipboardItem) {
        try {
          // Add cache-buster to force fresh CORS request
          const fetchUrl = message.fileUrl.includes('?') ? `${message.fileUrl}&cors=1` : `${message.fileUrl}?cors=1`;
          const res = await fetch(fetchUrl, { mode: 'cors' });
          if (!res.ok) throw new Error('Fetch failed');
          const blob = await res.blob();
          
          let finalBlob = blob;
          if (blob.type !== 'image/png') {
            finalBlob = await convertToPng(blob);
          }
          
          await navigator.clipboard.write([
            new (window as any).ClipboardItem({ [finalBlob.type]: finalBlob })
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          return;
        } catch (err) {
          console.warn('Browser blocked direct image data access (CORS). Falling back to URL copy.');
        }
      }

      // 3. Fallback: Copy URL as text
      try {
        if (window.electronAPI?.copyTextToClipboard) {
          window.electronAPI.copyTextToClipboard(message.fileUrl);
        } else {
          await navigator.clipboard.writeText(message.fileUrl);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Copy URL fallback failed:', err);
      }
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!message.fileUrl) return;
    if (window.electronAPI?.downloadFile) {
      window.electronAPI.downloadFile(message.fileUrl, message.fileName);
    } else {
      try {
        const res = await fetch(message.fileUrl, { mode: 'cors' });
        if (!res.ok) throw new Error('Fetch failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = message.fileName || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
      } catch (err) {
        const link = document.createElement('a');
        link.href = message.fileUrl;
        link.download = message.fileName || 'download';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  const renderCsv = (csv: string) => {
    const rows = csv.split('\n').filter(r => r.trim()).map(r => r.split(','));
    if (rows.length === 0) return <div style={{ color: '#fff' }}>Empty CSV</div>;
    return (
      <div style={{ overflow: 'auto', maxHeight: '100%', width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {rows[0].map((cell, i) => (
                <th key={i} style={{ border: '1px solid rgba(255,255,255,0.1)', padding: 12, backgroundColor: 'rgba(255,255,255,0.1)', textAlign: 'left', fontWeight: 600 }}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, i) => (
              <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ border: '1px solid rgba(255,255,255,0.1)', padding: 12, opacity: 0.9 }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const hasNext = currentIndex < messages.length - 1;
  const hasPrev = currentIndex > 0;

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (hasNext) {
      setCurrentIndex(c => c + 1);
      resetZoom();
      setTextContent(null);
    }
  };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (hasPrev) {
      setCurrentIndex(c => c - 1);
      resetZoom();
      setTextContent(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, messages.length, onClose]);

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 3000,
        animation: 'fadeIn 0.3s ease-out',
        userSelect: 'none'
      }}
    >
      <style>{`
        @keyframes scaleUp { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translate(-50%, -10px); }
          15% { opacity: 1; transform: translate(-50%, 0); }
          85% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -10px); }
        }
        .preview-header { padding: 16px 24px; }
        .preview-content { padding: 40px; }
        .hide-mobile { display: inline; }
        @media (max-width: 600px) {
          .preview-header { padding: 8px 12px !important; }
          .preview-content { padding: 10px !important; }
          .hide-mobile { display: none !important; }
          .filename-text { font-size: 14px !important; }
          .header-btn { padding: 6px 10px !important; }
        }
      `}</style>
      {/* Header */}
      <div className="preview-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, marginRight: 8 }}>
          <div style={{ color: '#fff', minWidth: 0, flex: 1 }}>
            <div className="filename-text" style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {(() => {
                const name = message.fileName || (isImage ? 'Image' : isVideo ? 'Video' : isVoice ? 'Voice Note' : 'File');
                const isMobile = window.innerWidth <= 600;
                return isMobile && name.length > 25 ? name.slice(0, 25) + '…' : name;
              })()}
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>{message.senderName} • {formatTime(message.timestamp)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {isImage && (
            <>
               <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 8px', gap: 8 }}>
                <button onClick={() => transformRef.current?.zoomOut(0.2)} style={{ ...iconBtnStyle, color: '#fff', padding: 4 }}><ChevronDown size={18}/></button>
                <span style={{ color: '#fff', fontSize: 13, minWidth: 36, textAlign: 'center' }}>{zoomDisplay}%</span>
                <button onClick={() => transformRef.current?.zoomIn(0.2)} style={{ ...iconBtnStyle, color: '#fff', padding: 4 }}><ChevronUp size={18}/></button>
                <button onClick={resetZoom} style={{ ...iconBtnStyle, color: '#fff', padding: 4, opacity: zoomDisplay === 100 ? 0.5 : 1 }}><RefreshCw size={14}/></button>
              </div>
              <button 
                className="header-btn"
                onClick={copyImage}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <Copy size={16} /> <span className="hide-mobile">Copy</span>
              </button>
            </>
          )}
          <button 
            className="header-btn"
            onClick={handleDownload}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              border: 'none',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Download size={16} /> <span className="hide-mobile">Download</span>
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Copied Feedback Badge */}
      {copied && (
        <div style={{
          position: 'absolute',
          top: 100,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          color: '#000',
          padding: '8px 16px',
          borderRadius: 20,
          fontSize: 13,
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 1000,
          animation: 'fadeInOut 2s ease-in-out forwards'
        }}>
          Copied to clipboard
        </div>
      )}

      {/* Content */}
      <div 
        className="preview-content"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {hasPrev && (
          <button 
            onClick={handlePrev}
            style={{ position: 'absolute', left: 24, zIndex: 30, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
          >
            <ChevronLeft size={32} />
          </button>
        )}
        {hasNext && (
          <button 
            onClick={handleNext}
            style={{ position: 'absolute', right: 24, zIndex: 30, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
          >
            <ChevronLeft size={32} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        
        {isImage ? (
          <TransformWrapper
            ref={transformRef}
            initialScale={1}
            minScale={0.5}
            maxScale={10}
            smooth
            centerOnInit
            onTransformed={(_, state) => setZoomDisplay(Math.round(state.scale * 100))}
          >
            <TransformComponent
              wrapperStyle={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
              }}
              contentStyle={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={message.fileUrl}
                alt={message.fileName}
                style={{
                  maxWidth: 'min(90vw, 90vh)',
                  maxHeight: 'min(90vw, 90vh)',
                  objectFit: 'contain',
                  borderRadius: 8,
                  boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                  animation: 'scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  userSelect: 'none',
                }}
                draggable={false}
              />
            </TransformComponent>
          </TransformWrapper>
        ) : isVoice ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 32,
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            padding: '60px 80px',
            borderRadius: 40,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            animation: 'scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            maxWidth: 'min(90vw, 500px)',
            width: '100%'
          }}>
            <div style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              backgroundColor: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 30px var(--accent-alpha)'
            }}>
              <Mic size={48} color="#fff" />
            </div>
            <audio
              src={message.fileUrl}
              controls
              autoPlay
              style={{ width: '100%', height: 40 }}
            />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Voice Message</div>
              <div style={{ fontSize: 14, opacity: 0.6, color: '#fff' }}>{message.senderName} • {formatTime(message.timestamp)}</div>
            </div>
          </div>
        ) : isVideo ? (
          <video
            src={message.fileUrl}
            controls
            autoPlay
            style={{
              maxWidth: 'min(90vw, 90vh)',
              maxHeight: 'min(90vw, 90vh)',
              borderRadius: message.type === 'video_note' ? '50%' : 8,
              aspectRatio: message.type === 'video_note' ? '1/1' : 'auto',
              objectFit: 'cover',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              animation: 'scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          />
        ) : isPdf ? (
          <iframe
            src={message.fileUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              borderRadius: 8,
              backgroundColor: '#fff',
              animation: 'scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            title="PDF Preview"
          />
        ) : (isText || isCsv) ? (
          <div style={{
            width: '100%',
            height: '100%',
            backgroundColor: isCsv ? 'transparent' : 'rgba(255, 255, 255, 0.05)',
            border: isCsv ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 12,
            padding: isCsv ? 0 : 24,
            color: '#fff',
            overflow: 'auto',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            animation: 'scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            {isLoadingContent ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5 }} />
              </div>
            ) : isCsv && textContent ? (
              renderCsv(textContent)
            ) : (
              textContent || 'Loading content...'
            )}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            color: '#fff',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            padding: '40px 60px',
            borderRadius: 24,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            animation: 'scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <Paperclip size={64} style={{ marginBottom: 20, opacity: 0.5 }} />
            <h2 style={{ color: '#fff' }}>No Preview Available</h2>
            <p style={{ opacity: 0.6, maxWidth: 300, margin: '8px auto 24px', color: '#fff' }}>
              We can't preview this file type in the browser. You can download it to view locally.
            </p>
            <button
              onClick={handleDownload}
              style={{
                display: 'inline-block',
                padding: '12px 32px',
                borderRadius: 12,
                backgroundColor: 'var(--accent)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Download File
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const FileErrorModal: React.FC<{ error: string; onClose: () => void }> = ({ error, onClose }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleUp { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        
        /* Hide scrollbar for formatting toolbar */
        .formatting-toolbar-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div style={{
        width: '100%',
        maxWidth: 340,
        backgroundColor: 'rgba(30, 30, 30, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 20,
        padding: '24px',
        textAlign: 'center',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
        animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        margin: '20px'
      }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          color: '#ef4444'
        }}>
          <AlertCircle size={32} />
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#fff' }}>Upload Failed</h3>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.5 }}>
          {error}
        </p>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 12,
            backgroundColor: '#ef4444',
            color: '#fff',
            border: 'none',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'filter 0.2s',
          }}
          onMouseOver={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
          onMouseOut={(e) => e.currentTarget.style.filter = 'none'}
        >
          Got it
        </button>
      </div>
    </div>
  );
};

// ------------------------------------

interface ChatWindowProps {
  chatId?: string;
  /** Called when the mobile back button is pressed while embedded (e.g. in-call chat panel). */
  onBack?: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ chatId: chatIdProp, onBack }) => {
  const { chatId: chatIdParam } = useParams<{ chatId: string }>();
  const chatId = chatIdProp ?? chatIdParam;
  const navigateRouter = useNavigate();
  // When embedded as a sidebar panel (chatIdProp provided), navigation is a no-op
  const navigate = chatIdProp ? () => {} : navigateRouter;
  const { messages, setMessages, activeChat, setActiveChat, typingUsers, userProfiles, onlineUsers, clearUnread, removeMessage, markMessageDeleted, updateMessage, liveTypingTexts, chats, setChats, updateChatPins, pinnedChatIds, togglePinChat, archivedChatIds, toggleArchiveChat, removeChat, nicknames, setNickname, lockedChatIds, toggleLockChat, setUserProfile } =
    useChatStore();
  const { currentUser, setCurrentUser } = useAuthStore();
  const { startCall, continueCall } = useCallContext();
  const { activeCall } = useCallStore();

  // ─── Get peer info for private chat header ────────────────────────────────
  const peerInfo = useCallback(() => {
    if (!activeChat || activeChat.type !== 'private') return null;
    const isSelfChat = activeChat.members.every((m) => m === currentUser?.uid);
    const peerId = isSelfChat
      ? currentUser?.uid
      : activeChat.members.find((m) => m !== currentUser?.uid);
    if (!peerId) return null;

    const peerProfile = peerId === currentUser?.uid
      ? currentUser
      : userProfiles[peerId];

    // If the peer's profile is marked deleted, treat as deleted user (not self-chat)
    const isDeleted = !isSelfChat && peerProfile?.isDeleted === true;

    const isPeerVisible = peerProfile?.showActiveStatus !== false;
    const online = isDeleted
      ? false
      : isSelfChat
        ? currentUser?.showActiveStatus !== false
        : onlineUsers.has(peerId) && isPeerVisible;

    return {
      uid: peerId,
      isSelf: isSelfChat && !isDeleted,
      isDeleted,
      profile: peerProfile,
      online,
    };
  }, [activeChat, currentUser, userProfiles, onlineUsers]);

  const peer = peerInfo();

  const isExternalCall = !!activeCall?.isExternal;
  const isInCall = !!activeCall && !isExternalCall;
  const isPeerInExternalCall = useMemo(() => {
    if (!activeCall || !activeCall.isExternal || !peer) return false;
    return activeCall.callerId === peer.uid || activeCall.receiverId === peer.uid;
  }, [activeCall, peer]);
  const { liveTypingEnabled } = useUIStore();
  const { isUnlocked, setPinModal } = useUIStore();
  const { addBookmark, isBookmarked, removeBookmark, savedEntries } = useBookmarkStore();

  const bookmarkedIds = useMemo(() => 
    new Set(savedEntries.filter(e => !e.deleted).map(e => e.messageId)),
    [savedEntries]
  );

  const [bookmarkToast, setBookmarkToast] = useState<'saved' | 'removed' | null>(null);
  const bookmarkToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBookmarkToast = useCallback((type: 'saved' | 'removed') => {
    if (bookmarkToastTimer.current) clearTimeout(bookmarkToastTimer.current);
    setBookmarkToast(type);
    bookmarkToastTimer.current = setTimeout(() => setBookmarkToast(null), 2500);
  }, []);

  // Track which message bubble's context menu is currently open — ensures only one is visible at a time
  const [openBubbleMenuId, setOpenBubbleMenuId] = useState<string | null>(null);

  // Track the last pointer type used (mouse, touch, pen) to adapt UI dynamically
  const [lastPointerType, setLastPointerType] = useState<'mouse' | 'touch' | 'pen' | null>(null);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      setLastPointerType(e.pointerType as any);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  // Detect if device is primarily touch-based or the last interaction was touch
  const isTouchDevice = useMemo(() => {
    // If we have a definitive last pointer type, trust it
    if (lastPointerType === 'touch') return true;
    if (lastPointerType === 'mouse' || lastPointerType === 'pen') return false;

    // Fallback to static detection
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileScreen = window.innerWidth <= 768; // Mobile/tablet breakpoint
    return hasTouch && isMobileScreen;
  }, [lastPointerType]);

  // When opened directly via URL (e.g. "open in new window"), activeChat won't be
  // set from a sidebar click.  Resolve it from the chats list as soon as it loads.
  useEffect(() => {
    if (!chatId) return;
    // Guard: already active?
    if (activeChat?.chatId === chatId) return;

    const found = chats.find((c) => c.chatId === chatId);
    if (found) {
      // Final guard to ensure we don't trigger a loop even if deps are unstable
      setActiveChat(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, chats, setActiveChat]);

  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // ─── Mobile context menu (copy/cut/paste/select all) ─────────────────────
  const [mobileCtxMenu, setMobileCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [mobileCtxMenuPos, setMobileCtxMenuPos] = useState<{ top: number; left: number } | null>(null);
  const mobileCtxMenuRef = useRef<HTMLDivElement | null>(null);

  const handleMobileContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    // Capture current selection so formatter buttons work from the context menu
    const el = inputRef.current;
    if (el && el.selectionStart !== el.selectionEnd) {
      setTextSelection({ start: el.selectionStart, end: el.selectionEnd });
    } else {
      setTextSelection(null);
    }
    setShowFormatToolbar(false); // suppress floating toolbar — it's merged into ctx menu
    setMobileCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const closeMobileCtxMenu = () => { setMobileCtxMenu(null); setMobileCtxMenuPos(null); };

  // After the menu renders, measure its actual size and clamp into viewport
  useLayoutEffect(() => {
    if (!mobileCtxMenu || !mobileCtxMenuRef.current) return;
    const { offsetWidth: w, offsetHeight: h } = mobileCtxMenuRef.current;
    const MARGIN = 8;
    const navEl = document.querySelector('.nav-sidebar') as HTMLElement | null;
    const navBarH = navEl ? navEl.offsetHeight : (window.innerWidth <= 480 ? 52 : window.innerWidth <= 768 ? 56 : 0);
    const vw = window.innerWidth;
    const vh = window.innerHeight - navBarH;

    let top = mobileCtxMenu.y;
    let left = mobileCtxMenu.x;

    // Prefer showing below click; flip above if not enough room
    if (top + h > vh - MARGIN) top = Math.max(MARGIN, mobileCtxMenu.y - h - MARGIN);
    if (top < MARGIN) top = MARGIN;

    // Clamp horizontally
    if (left + w > vw - MARGIN) left = vw - w - MARGIN;
    if (left < MARGIN) left = MARGIN;

    setMobileCtxMenuPos({ top, left });
  }, [mobileCtxMenu]);

  // Clipboard helper: tries modern API first, falls back to execCommand
  const clipboardWrite = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {
        // fallback: put text in a temp textarea and execCommand
        const tmp = document.createElement('textarea');
        tmp.value = text;
        tmp.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
      });
    } else {
      const tmp = document.createElement('textarea');
      tmp.value = text;
      tmp.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
    }
  };

  const mobileCtxCopy = () => {
    const el = inputRef.current;
    if (!el) return closeMobileCtxMenu();
    el.focus();
    const selected = el.value.substring(el.selectionStart, el.selectionEnd);
    if (selected) {
      // Keep selection active so execCommand works directly on the textarea
      document.execCommand('copy');
    }
    closeMobileCtxMenu();
  };

  const mobileCtxCut = () => {
    const el = inputRef.current;
    if (!el) return closeMobileCtxMenu();
    el.focus();
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.substring(start, end);
    if (selected) {
      document.execCommand('copy');
      const newVal = el.value.substring(0, start) + el.value.substring(end);
      setInputText(newVal);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = start;
          inputRef.current.selectionEnd = start;
        }
      }, 0);
    }
    closeMobileCtxMenu();
  };

  const mobileCtxPaste = async () => {
    const el = inputRef.current;
    if (!el) return closeMobileCtxMenu();
    el.focus();
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      try {
        const text = await navigator.clipboard.readText();
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const newVal = el.value.substring(0, start) + text + el.value.substring(end);
        setInputText(newVal);
        const newCursor = start + text.length;
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = newCursor;
            inputRef.current.selectionEnd = newCursor;
          }
        }, 0);
        closeMobileCtxMenu();
        return;
      } catch {
        // permission denied — fall through to execCommand
      }
    }
    // Fallback: execCommand paste (works in WebView / Electron contexts)
    document.execCommand('paste');
    closeMobileCtxMenu();
  };

  const mobileCtxSelectAll = () => {
    const el = inputRef.current;
    if (!el) return closeMobileCtxMenu();
    el.focus();
    el.select();
    closeMobileCtxMenu();
  };

  // ─── Text formatting toolbar ─────────────────────────────────────────────
  const [showFormatToolbar, setShowFormatToolbar] = useState(false);
  const [formatToolbarPos, setFormatToolbarPos] = useState({ top: 0, left: 0 });
  const [textSelection, setTextSelection] = useState<{ start: number; end: number } | null>(null);
  const [toolbarScrollState, setToolbarScrollState] = useState<{ canScrollLeft: boolean; canScrollRight: boolean }>({ canScrollLeft: false, canScrollRight: true });
  const toolbarScrollRef = useRef<HTMLDivElement>(null);
  
  // ─── Draft management ────────────────────────────────────────────────────
  const { getDraft, setDraft: setDraftInStore, clearDraft } = useDraftStore();
  const draftSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load draft when chat changes - fetch from backend to ensure sync across devices
  useEffect(() => {
    if (!chatId) return;
    
    // First, load from local store immediately for instant UI
    const localDraft = getDraft(chatId);
    setInputText(localDraft);
    
    // Then fetch from backend to get the latest draft from any device
    import('../services/apiService').then(async (api) => {
      try {
        const result = await api.getDraft(chatId);
        if (result.success) {
          const backendDraft = result.data?.content || '';
          // Update local store and UI with backend draft
          setDraftInStore(chatId, backendDraft);
          setInputText(backendDraft);
        }
      } catch (error) {
        console.error('Failed to fetch draft from backend:', error);
      }
    });
  }, [chatId, getDraft, setDraftInStore]);

  // Listen for draft updates from other devices
  useEffect(() => {
    if (!chatId) return;
    
    const unsubscribe = useDraftStore.subscribe((state, prevState) => {
      const currentDraft = state.drafts[chatId];
      const prevDraft = prevState.drafts[chatId];
      
      // Only update if the draft changed and it's DIFFERENT from what we currently have in the input
      // This prevents cursor jumps when the local draft-save cycle finishes.
      if (currentDraft !== prevDraft && currentDraft !== undefined && currentDraft !== inputText) {
        setInputText(currentDraft);
      }
    });

    return unsubscribe;
  }, [chatId]);

  // Save draft to backend with debounce
  const saveDraftToBackend = useCallback(async (chatId: string, content: string) => {
    try {
      console.log('[Draft] Saving to backend:', { chatId, content: content.substring(0, 50) });
      const { saveDraft } = await import('../services/apiService');
      const result = await saveDraft(chatId, content);
      console.log('[Draft] Saved successfully:', result);
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, []);

  // Update draft when input changes
  useEffect(() => {
    if (!chatId) return;
    
    // Update local store immediately
    setDraftInStore(chatId, inputText);

    // Debounce backend save
    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
    }

    draftSaveTimeoutRef.current = setTimeout(() => {
      saveDraftToBackend(chatId, inputText);
    }, 5000); // Save after 5 seconds of inactivity

    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }
    };
  }, [inputText, chatId, setDraftInStore, saveDraftToBackend]);

  // ─── Initialize toolbar scroll state when it appears ────────────────────
  useEffect(() => {
    if (showFormatToolbar && toolbarScrollRef.current) {
      const toolbar = toolbarScrollRef.current;
      const canScrollLeft = toolbar.scrollLeft > 0;
      const canScrollRight = toolbar.scrollLeft < (toolbar.scrollWidth - toolbar.clientWidth - 1);
      setToolbarScrollState({ canScrollLeft, canScrollRight });
    }
  }, [showFormatToolbar]);

  // ─── Chat header three-dot menu ──────────────────────────────────────────
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [profileClosing, setProfileClosing] = useState(false);
  const [showProfileMore, setShowProfileMore] = useState(false);

  const openProfile = () => setShowProfile(true);
  const closeProfile = () => {
    setProfileClosing(true);
    setTimeout(() => { setShowProfile(false); setProfileClosing(false); }, 260);
  };
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  
  // ─── URL Link Modal ──────────────────────────────────────────────────────
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlLinkText, setUrlLinkText] = useState('');
  const [urlLinkUrl, setUrlLinkUrl] = useState('');
  const urlModalTextRef = useRef<HTMLInputElement>(null);
  const urlModalUrlRef = useRef<HTMLInputElement>(null);
  const [chatConfirmDelete, setChatConfirmDelete] = useState<'me' | 'both' | null>(null);
  const [chatDeleting, setChatDeleting] = useState(false);
  const [msgConfirmDelete, setMsgConfirmDelete] = useState<{ ids: string[]; scope: 'me' | 'both' } | null>(null);
  const [msgDeleting, setMsgDeleting] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [activeMediaTab, setActiveMediaTab] = useState<'emoji' | 'sticker' | 'gif'>('emoji');
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [stickerSearch, setStickerSearch] = useState('');
  const [stickers, setStickers] = useState<any[]>([]);
  const [isStickerLoading, setIsStickerLoading] = useState(false);
  const [giphyKey, setGiphyKey] = useState(() => 
    import.meta.env.VITE_GIPHY_API_KEY || 
    localStorage.getItem('giphy_api_key') || 
    '3eP9s8HjP4pht89FvV4Aka0fFfIdF2D5'
  );

  // --- Real-time Theme Previews from peers ---
  const [previewThemes, setPreviewThemes] = useState<Record<string, Record<string, any>>>({}); // peerId -> { chatId: theme }
  const [giphyKeyInput, setGiphyKeyInput] = useState('');
  const [giphyError, setGiphyError] = useState(false);
  
  const handleMentionClick = useCallback(async (text: string, type: 'username' | 'email') => {
    if (!currentUser) return;

    const query = type === 'username' ? text.replace(/^@/, '') : text;

    // Helper: does this user object match the query?
    const matchesQuery = (u: { username?: string; email?: string }) =>
      type === 'username'
        ? u.username?.toLowerCase() === query.toLowerCase()
        : u.email?.toLowerCase() === query.toLowerCase();

    // Check if user clicked their own mention
    const showToast = (msg: string) => {
      setMentionToast(msg);
      setTimeout(() => setMentionToast(null), 2500);
    };

    // Already in this chat? Show toast instead of re-navigating
    const alreadyHere = (targetChatId: string) => targetChatId === chatId;

    // Self-mention
    const isSelf = matchesQuery(currentUser);
    if (isSelf) {
      const selfChat = chats.find(c =>
        c.type === 'private' && c.members?.every(m => m === currentUser.uid)
      );
      if (selfChat) {
        if (alreadyHere(selfChat.chatId)) {
          showToast("You're already in your saved messages");
        } else {
          navigate(`/chats/${selfChat.chatId}`);
        }
      } else {
        showToast("That's you!");
      }
      return;
    }

    // Fast path: profile already in store
    const existingUser = Object.values(userProfiles).find(matchesQuery);
    if (existingUser) {
      const existingChat = chats.find(c =>
        c.type === 'private' && c.members?.includes(existingUser.uid)
      );
      if (existingChat) {
        // Always refresh profile to ensure avatar is up-to-date (Google users may lack it)
        setUserProfile(existingUser);
        if (alreadyHere(existingChat.chatId)) {
          const name = existingUser.name || query;
          showToast(`You're already chatting with ${name}`);
        } else {
          navigate(`/chats/${existingChat.chatId}`);
        }
        return;
      }
    }

    // Slow path: resolve via API
    try {
      const { searchUsers, createPrivateChat, getChats } = await import('../services/apiService');
      const res = await searchUsers(type === 'username' ? `@${query}` : query);
      if (res.success && res.data && res.data.length > 0) {
        const user = res.data.find(matchesQuery);

        if (user) {
          if (user.uid === currentUser.uid) {
            const selfChat = chats.find(c =>
              c.type === 'private' && c.members?.every(m => m === currentUser.uid)
            );
            if (selfChat) {
              if (alreadyHere(selfChat.chatId)) {
                showToast("You're already in your saved messages");
              } else {
                navigate(`/chats/${selfChat.chatId}`);
              }
            } else {
              showToast("That's you!");
            }
            return;
          }

          setUserProfile(user);

          const alreadyExists = chats.find(c =>
            c.type === 'private' && c.members?.includes(user.uid)
          );
          if (alreadyExists) {
            if (alreadyHere(alreadyExists.chatId)) {
              const name = user.name || query;
              showToast(`You're already chatting with ${name}`);
            } else {
              navigate(`/chats/${alreadyExists.chatId}`);
            }
            return;
          }

          const chatRes = await createPrivateChat(user.uid);
          if (chatRes.success && chatRes.data) {
            const newChatId = chatRes.data.chatId;
            const refreshed = await getChats();
            if (refreshed.success && refreshed.data) setChats(refreshed.data);
            navigate(`/chats/${newChatId}`);
          }
        }
      }
    } catch (err) {
      console.error('Failed to resolve mention:', err);
    }
  }, [currentUser, chatId, navigate, setUserProfile, setChats, userProfiles, chats]);

  const mediaPickerRef = useRef<HTMLDivElement>(null);

  
  // No longer using hardcoded stickers


  useEffect(() => {
    if (!headerMenu) return;
    const close = (e: MouseEvent) => {
      if (!headerMenuRef.current?.contains(e.target as Node)) setHeaderMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [headerMenu]);

  const handleDeleteChat = async (scope: 'me' | 'both') => {
    if (!activeChat) return;
    setChatDeleting(true);
    setChatConfirmDelete(null);
    try {
      await deleteChatApi(activeChat.chatId, scope);
      removeChat(activeChat.chatId);
      setActiveChat(null);
      navigate('/chats');
    } catch (err) {
      console.error('Failed to delete chat:', err);
    } finally {
      setChatDeleting(false);
    }
  };

  // ─── Search ───────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // ─── Reply / Forward ──────────────────────────────────────────────────────
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [forwardingMsgs, setForwardingMsgs] = useState<Message[]>([]);
  const [forwardTargetIds, setForwardTargetIds] = useState<Set<string>>(new Set());
  const [forwardSearch, setForwardSearch] = useState('');
  // ─── Highlighted message (scroll-to-source) ───────────────────────────────
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  // ─── Pinned message carousel index ────────────────────────────────────────
  const [pinnedIdx, setPinnedIdx] = useState(0);
  // ─── Scroll navigation arrows ────────────────────────────────────────────
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  // ─── Selection mode ───────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  // Older messages loaded via scroll-up pagination (kept separate from live store)
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // ─── Emoji suggestion state ───
  const [emojiSuggestions, setEmojiSuggestions] = useState<{ id: string; native: string }[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [suggestionQuery, setSuggestionQuery] = useState('');

  // ─── Recording state ───
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'voice' | 'video'>('voice');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [fileError, setFileError] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ messages: Message[]; initialIndex: number } | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null); // always current, safe for closures

  const setStreamBoth = (s: MediaStream | null) => {
    streamRef.current = s;
    setStream(s);
  };
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // We keep a history for a rolling waveform (e.g., last 40 samples)
  const [waveformHistory, setWaveformHistory] = useState<number[]>(Array(40).fill(0));
  const [showHoldToast, setShowHoldToast] = useState(false);
  const [mentionToast, setMentionToast] = useState<string | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressActive = useRef(false);
  const [recordingDurationRef, setRecordingDurationRef] = useState(0); // For UI display
  const recordingDurationSecondsRef = useRef(0); // For internal tracking
  const isCameraFlippingRef = useRef(false);
  const pauseDrawRef = useRef(false); // freeze canvas during camera flip
  const recordedChunksRef = useRef<Blob[]>([]);
  
  // Canvas recording refs
  const drawFrameRef = useRef<number>(0);
  const recordingVideoRef = useRef<HTMLVideoElement | null>(null);
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  const [recordedMediaBlob, setRecordedMediaBlob] = useState<Blob | null>(null);
  const [recordedMediaUrl, setRecordedMediaUrl] = useState<string | null>(null);
  const [isPreviewingRecording, setIsPreviewingRecording] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewMediaRef = useRef<HTMLMediaElement | null>(null);
  const [recordedMode, setRecordedMode] = useState<'voice' | 'video'>('voice');
  const [recordedWaveform, setRecordedWaveform] = useState<number[]>([]);
  // ─── File upload preview (staging) ───
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadAsSpoiler, setUploadAsSpoiler] = useState(false);

  const syncMessageUpdate = useCallback((messageId: string, updates: Partial<Message>) => {
    // 1. Update the store (affects liveMsgs)
    updateMessage(messageId, updates);
    // 2. Update the local olderMessages state (affects olderFiltered portion of chatMessages)
    setOlderMessages(prev => prev.map(m => m.messageId === messageId ? { ...m, ...updates } : m));
  }, [updateMessage]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which chatId we've already instant-scrolled to bottom for
  const lastScrolledChatRef = useRef<string>('');
  const isFetchingRef = useRef(false);
  // Stores pre-fetch scroll metrics so useLayoutEffect can restore position after DOM commit
  const scrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

  const currentUid = currentUser?.uid ?? '';
  // Live messages from the real-time Firestore listener (latest ~30)
  const liveMsgs = (messages[chatId!] || []).filter(
    (msg) => !(msg.deletedFor ?? []).includes(currentUid),
  );
  // Merge older (paginated) + live, deduplicating by messageId
  const deletedCount = liveMsgs.filter((m) => m.deleted).length;
  // Changes whenever any edited message's content changes (handles first edit + re-edits)
  const editedSignature = liveMsgs.reduce((s, m) => m.isEdited ? s + (m.content?.length ?? 0) : s, 0);
  // Changes whenever any message's readBy or deliveredTo array grows (drives real-time tick updates)
  const readBySignature = liveMsgs.reduce((s, m) => s + (m.readBy?.length ?? 0) + (m.deliveredTo?.length ?? 0), 0);
  // Changes whenever any message's reactions object changes (keys or users array)
  const reactionSignature = [...olderMessages, ...liveMsgs].reduce((s, m) => s + Object.values(m.reactions || {}).reduce((acc, users) => acc + users.length, 0), 0);
  
  const chatMessages = useMemo(() => {
    const olderFiltered = olderMessages.filter(
      (o) => !liveMsgs.some((l) => l.messageId === o.messageId),
    );
    return [...olderFiltered, ...liveMsgs];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [olderMessages, liveMsgs.length, deletedCount, editedSignature, readBySignature, reactionSignature, chatId]);

  const typingList = typingUsers[chatId!] || [];
  const liveTexts = liveTypingTexts?.[chatId!] || [];

  // ─── AI Assistant State ────────────────────────────────────────────────────
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isGeneratingAiSuggestion, setIsGeneratingAiSuggestion] = useState(false);

  // AI Suggestion generation logic
  useEffect(() => {
    if (!currentUser?.aiSuggestionsEnabled || !currentUser?.geminiApiKey) {
      setAiSuggestions([]);
      return;
    }

    // Generate suggestions based on current context and draft
    const validMessages = chatMessages.filter(m => !m.deleted);
    
    // Avoid spamming the API on rapid typing

    // Avoid spamming the API on rapid typing
    const timer = setTimeout(async () => {
      setIsGeneratingAiSuggestion(true);
      try {
        const { generateMessageSuggestion } = await import('../services/geminiService');
        const suggestions = await generateMessageSuggestion(
          currentUser.geminiApiKey!,
          validMessages, 
          currentUser.uid,
          inputText // Pass current typing text for autocomplete
        );
        setAiSuggestions(suggestions);
      } catch (err) {
        console.error('Failed to generate AI suggestion:', err);
        setAiSuggestions([]);
      } finally {
        setIsGeneratingAiSuggestion(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [chatMessages, currentUser, inputText]);

  // ─── Search match indices ─────────────────────────────────────────────────
  const searchMatchIndices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return chatMessages.reduce<number[]>((acc, msg, idx) => {
      if (!msg.deleted && msg.content?.toLowerCase().includes(q)) acc.push(idx);
      return acc;
    }, []);
  }, [searchQuery, chatMessages]);

  // Close search / reply state when switching chats
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchMatchIdx(0);
    setReplyingTo(null);
    setForwardingMsgs([]);
    setForwardTargetIds(new Set());
    setForwardSearch('');
    setEditingNickname(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [chatId]);

  const isLocked = useMemo(() => {
    return !!chatId && lockedChatIds.includes(chatId) && !isUnlocked;
  }, [chatId, lockedChatIds, isUnlocked]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Scroll to the active search match
  useEffect(() => {
    if (searchMatchIndices.length === 0) return;
    const targetIdx = searchMatchIndices[searchMatchIdx];
    const el = scrollContainerRef.current;
    if (el) {
      const target = el.querySelector<HTMLElement>(`[data-msg-idx="${targetIdx}"]`);
      if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [searchMatchIdx, searchMatchIndices]);

  // ─── Socket Event Listeners ───────────────────────────────────────────────
  useEffect(() => {
    if (!chatId) return;
    const socket = getSocket();
    if (!socket) return;

    const onReactionUpdated = (payload: { messageId: string; chatId: string; reactions: Record<string, string[]> }) => {
      if (payload.chatId !== chatId) return;
      syncMessageUpdate(payload.messageId, { reactions: payload.reactions });
    };

    const onMessageDelivered = (payload: { chatId: string; messageId: string; userId: string }) => {
      if (payload.chatId !== chatId) return;
      const msg = chatMessages.find(m => m.messageId === payload.messageId);
      const current = msg?.deliveredTo || [];
      syncMessageUpdate(payload.messageId, {
        deliveredTo: Array.from(new Set([...current, payload.userId])),
      });
    };

    const onMessageRead = (payload: { chatId: string; messageId: string; userId: string }) => {
      if (payload.chatId !== chatId) return;
      const msg = chatMessages.find(m => m.messageId === payload.messageId);
      const current = msg?.readBy || [];
      syncMessageUpdate(payload.messageId, {
        readBy: Array.from(new Set([...current, payload.userId])),
      });
    };

    socket.on('reaction_updated', onReactionUpdated);
    socket.on('message_delivered', onMessageDelivered);
    socket.on('message_read_receipt', onMessageRead);

    return () => {
      socket.off('reaction_updated', onReactionUpdated);
      socket.off('message_delivered', onMessageDelivered);
      socket.off('message_read_receipt', onMessageRead);
    };
  }, [chatId, updateMessage, messages]);

  const handleSearchPrev = () => {
    if (searchMatchIndices.length === 0) return;
    setSearchMatchIdx((i) => (i - 1 + searchMatchIndices.length) % searchMatchIndices.length);
  };
  const handleSearchNext = () => {
    if (searchMatchIndices.length === 0) return;
    setSearchMatchIdx((i) => (i + 1) % searchMatchIndices.length);
  };
  const handleSearchClose = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchMatchIdx(0);
  };

  // ─── Emoji & GIF Handlers ──────────────────────────────────────────────
  const handleEmojiSelect = (emoji: any) => {
    setInputText((prev) => prev + emoji.native);
    // Keep picker open or close? Typically Telegram keeps it open but let's close for now or toggle
    // setShowEmojiPicker(false);
  };

  const handleGifSearch = async (query: string) => {
    setGifSearch(query);
    if (!query.trim()) {
      handleFetchTrendingGifs();
      return;
    }
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(query)}&limit=12`);
      if (res.status === 401 || res.status === 403) {
        setGiphyError(true);
        setGifs([]);
        return;
      }
      const result = await res.json();
      if (result.data && Array.isArray(result.data)) {
        const mapped = result.data.map((r: any) => ({
          id: r.id,
          url: r.images.fixed_height.url,
          preview: r.images.fixed_height_small.url
        }));
        setGifs(mapped);
        setGiphyError(false);
      }
    } catch (err) {
      console.error('GIF search error:', err);
      setGifs([]);
    }
  };

  const handleFetchTrendingGifs = async () => {
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${giphyKey}&limit=12`);
      if (res.status === 401 || res.status === 403) {
        setGiphyError(true);
        setGifs([]);
        return;
      }
      const result = await res.json();
      if (result.data && Array.isArray(result.data)) {
        const mapped = result.data.map((r: any) => ({
          id: r.id,
          url: r.images.fixed_height.url,
          preview: r.images.fixed_height_small.url
        }));
        setGifs(mapped);
      }
    } catch (err) {
      console.error('Fetch trending GIFs error:', err);
    }
  };

  const handleStickerSearch = async (query: string) => {
    setStickerSearch(query);
    if (!query.trim()) {
      handleFetchTrendingStickers();
      return;
    }
    setIsStickerLoading(true);
    try {
      const res = await fetch(`https://api.giphy.com/v1/stickers/search?api_key=${giphyKey}&q=${encodeURIComponent(query)}&limit=12`);
      if (res.status === 401 || res.status === 403) {
        setGiphyError(true);
        setStickers([]);
        return;
      }
      const result = await res.json();
      if (result.data && Array.isArray(result.data)) {
        const mapped = result.data.map((r: any) => ({
          id: r.id,
          url: r.images.fixed_height.url,
          preview: r.images.fixed_height_small.url
        }));
        setStickers(mapped);
      }
    } catch (err) {
      console.error('Sticker search error:', err);
    } finally {
      setIsStickerLoading(false);
    }
  };

  const handleFetchTrendingStickers = async () => {
    setIsStickerLoading(true);
    try {
      const res = await fetch(`https://api.giphy.com/v1/stickers/trending?api_key=${giphyKey}&limit=12`);
      if (res.status === 401 || res.status === 403) {
        setGiphyError(true);
        setStickers([]);
        return;
      }
      const result = await res.json();
      if (result.data && Array.isArray(result.data)) {
        const mapped = result.data.map((r: any) => ({
          id: r.id,
          url: r.images.fixed_height.url,
          preview: r.images.fixed_height_small.url
        }));
        setStickers(mapped);
      }
    } catch (err) {
      console.error('Fetch trending stickers error:', err);
    } finally {
      setIsStickerLoading(false);
    }
  };

  // Fetch trending content when the media picker is opened to a tab
  useEffect(() => {
    if (showMediaPicker) {
      if (activeMediaTab === 'sticker' && stickers.length === 0) {
        handleFetchTrendingStickers();
      } else if (activeMediaTab === 'gif' && gifs.length === 0) {
        handleFetchTrendingGifs();
      }
    }
  }, [showMediaPicker, activeMediaTab]);

  const handleSaveGiphyKey = () => {
    const key = giphyKeyInput.trim();
    if (key) {
      setGiphyKey(key);
      localStorage.setItem('giphy_api_key', key);
      setGiphyError(false);
      setGiphyKeyInput('');
      // Retry search if there was a query
      if (gifSearch) handleGifSearch(gifSearch);
    }
  };

  const handleSendGif = (url: string) => {
    if (!chatId || !currentUser) return;
    sendMessage({
      chatId,
      content: '',
      fileUrl: url,
      type: 'gif',
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar
    });
    setShowMediaPicker(false);
    setGifSearch('');
    setGifs([]);
  };

  const handleSendSticker = (url: string) => {
    if (!chatId || !currentUser) return;
    sendMessage({
      chatId,
      content: '',
      fileUrl: url,
      type: 'sticker',
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar
    });
    setShowMediaPicker(false);
  };


  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      
      if (showMediaPicker && mediaPickerRef.current && !mediaPickerRef.current.contains(target)) {
        setShowMediaPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMediaPicker]);


  // ─── Join/leave room & load messages ─────────────────────────────────────
  useEffect(() => {
    if (!chatId) return;
    // Wait for auth to resolve before attempting to load messages.
    // In popup windows, this effect fires before Firebase auth is ready;
    // adding currentUid as a dependency causes it to re-run once auth resolves.
    if (!currentUid) return;

    // Reset pagination state whenever we switch chats
    setOlderMessages([]);
    setHasMore(true);
    isFetchingRef.current = false;

    joinChatRoom(chatId);
    clearUnread(chatId);
    markChatRead(chatId).catch(console.error);
    // Notify sender(s) in real-time that this user has read the chat
    sendReadReceipt(chatId, '');

    // When the window is restored/focused while this chat is open, clear unread
    const handleVisible = () => {
      if (!document.hidden) {
        clearUnread(chatId);
        markChatRead(chatId).catch(console.error);
        sendReadReceipt(chatId, '');
      }
    };
    const handleFocus = () => {
      clearUnread(chatId);
      sendReadReceipt(chatId, '');
    };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleFocus);

    const unsubscribe = listenToMessages(
      chatId,
      (msgs) => {
        // Strip messages this user has deleted "for me" before storing
        const filtered = msgs.filter((m) => !(m.deletedFor ?? []).includes(currentUid));
        setMessages(chatId, filtered);
      },
      // Fallback: if Firestore streaming is blocked (e.g. ad blocker), load via HTTP
      async () => {
        const res = await getChatMessages(chatId).catch(() => null);
        if (res?.success && res.data) {
          const filtered = res.data.filter((m: import('@shared/types').Message) => !(m.deletedFor ?? []).includes(currentUid));
          setMessages(chatId, filtered);
        }
      },
    );

    return () => {
      leaveChatRoom(chatId);
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleFocus);
    };
  }, [chatId, currentUid, setMessages, clearUnread]);

  // ─── Scroll logic ─────────────────────────────────────────────────────────
  // useLayoutEffect fires synchronously after DOM mutations, before the browser
  // paints — this prevents any visible scroll animation on initial load.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !chatId || chatMessages.length === 0) return;

    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };

    if (lastScrolledChatRef.current !== chatId) {
      // New chat opened — instantly jump to bottom
      scrollToBottom();
      
      // Also schedule one in the next frame just in case
      // (important if images/videos take a microsecond to affect height)
      requestAnimationFrame(scrollToBottom);
      
      // Delay setting the ref so that if the FIRST few batches of messages arrive
      // close together, they all trigger the "new chat" forced scroll.
      holdTimerRef.current = setTimeout(() => {
        lastScrolledChatRef.current = chatId;
      }, 500) as any;
    } else {
      // Same chat, new message — only auto-scroll if user is already near the bottom
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distFromBottom < 400) {
        scrollToBottom();
      }
    }

    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, [chatMessages.length, chatId]);

  // Also scroll when typing indicator appears/disappears
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 400) el.scrollTop = el.scrollHeight;
  }, [typingList.length]);

  // ─── Scroll-up pagination ─────────────────────────────────────────────────
  const loadOlderMessages = useCallback(async () => {
    if (!chatId || isFetchingRef.current || !hasMore) return;
    // Need at least one message to use as a cursor
    const allMsgs = [
      ...olderMessages,
      ...(messages[chatId] || []).filter((m) => !(m.deletedFor ?? []).includes(currentUid)),
    ];
    if (allMsgs.length === 0) return;

    const oldestTs = allMsgs[0].timestamp;
    const el = scrollContainerRef.current;
    // Snapshot scroll metrics into a ref BEFORE the async fetch.
    // The useLayoutEffect below reads this ref after React commits the new messages to the DOM,
    // guaranteeing the position is restored synchronously (before browser paint) with no jump.
    if (el) {
      scrollAnchorRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
    }

    isFetchingRef.current = true;
    try {
      // Fetch 50 messages at a time for larger buffers and fewer fetches
      const res = await getChatMessages(chatId, 50, oldestTs);
      if (res.success && res.data && res.data.length > 0) {
        const uid = currentUser?.uid ?? '';
        const fetched = res.data.filter((m) => !(m.deletedFor ?? []).includes(uid));
        setOlderMessages((prev) => {
          // Deduplicate against existing older messages
          const existing = new Set(prev.map((m) => m.messageId));
          const newOnes = fetched.filter((m) => !existing.has(m.messageId));
          return [...newOnes, ...prev];
        });
        if (fetched.length < 50) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('[Pagination] Failed to load older messages:', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, [chatId, hasMore, olderMessages, messages, currentUid, currentUser]);

  // Synchronously restore scroll after React commits prepended messages.
  // useLayoutEffect fires AFTER the DOM is updated but BEFORE the browser paints,
  // so the user never sees the scroll jump caused by content being added above.
  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    const el = scrollContainerRef.current;
    if (!anchor || !el) return;
    const heightDiff = el.scrollHeight - anchor.scrollHeight;
    if (heightDiff > 0) {
      el.scrollTop = anchor.scrollTop + heightDiff;
    }
    // Clear the anchor so subsequent non-pagination renders don't incorrectly re-offset
    scrollAnchorRef.current = null;
  }, [olderMessages.length]);


  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Preload older messages well before the user reaches the top (1000px buffer)
    // This mimics Telegram's seamless infinite scroll — the user rarely sees a spinner
    if (!isFetchingRef.current && hasMore && el.scrollTop < 1000) loadOlderMessages();
    // Show/hide scroll nav arrows
    setShowScrollTop(el.scrollTop > 200);
    setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
  }, [loadOlderMessages, hasMore]);

  // ─── Chat Theme Logic ─────────────────────────────────────────────────────
  const displayTheme = useMemo(() => {
    if (!activeChat) return null;
    const myTheme = currentUser?.chatThemes?.[activeChat.chatId];
    
    // A concrete theme usually has a backgroundImage or specific backgroundColor.
    // If it only has basic properties (opacity, blur) or metadata (peerThemeIgnored), it's a fallback state.
    const hasMyOwnTheme = myTheme && (myTheme.backgroundImage || myTheme.backgroundColor);

    // 1. Check if I have my own theme setup first — My Theme > Peer Theme
    if (hasMyOwnTheme) {
      return myTheme;
    }

    // 2. Check for real-time preview (live customization from peer), but only if I don't have my own theme and haven't ignored theirs.
    if (peer && previewThemes[peer.uid]?.[activeChat.chatId] && !myTheme?.peerThemeIgnored) {
      const pTheme = previewThemes[peer.uid][activeChat.chatId];
      // Object.keys(pTheme).length === 0 means peer explicitly disabled "Show to Others" or cleared theme
      if (Object.keys(pTheme).length > 0) {
        return { ...pTheme, peerOverrides: myTheme?.peerOverrides };
      }
    }

    // 3. Fall back to peer's theme if they shared it AND I haven't ignored it
    if (peer && peer.profile?.chatThemes?.[activeChat.chatId]?.showToOthers && !myTheme?.peerThemeIgnored) {
      const pTheme = peer.profile.chatThemes[activeChat.chatId];
      return { ...pTheme, peerOverrides: myTheme?.peerOverrides };
    }
    
    // 4. Default back to basic theme object (or null) if nothing is active
    return myTheme || null;
  }, [activeChat, currentUser?.chatThemes, peer, previewThemes]);

  const peerTheme = useMemo(() => {
    if (!activeChat || !peer) return undefined;
    const theme = peer.profile?.chatThemes?.[activeChat.chatId];
    if (theme?.showToOthers) return theme;
    return undefined;
  }, [activeChat, peer]);

  // Socket listener for theme sync
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleThemeUpdate = ({ chatId, theme }: any) => {
      if (currentUser) {
        const updatedThemes = { ...currentUser.chatThemes, [chatId]: theme };
        setCurrentUser({ ...currentUser, chatThemes: updatedThemes });
      }
    };

    const handleThemeRemove = ({ chatId }: any) => {
      if (currentUser) {
        const updatedThemes = { ...currentUser.chatThemes };
        delete updatedThemes[chatId];
        setCurrentUser({ ...currentUser, chatThemes: updatedThemes });
      }
    };

    const handlePeerThemeUpdate = ({ chatId, peerId, theme }: any) => {
      // Update peer's profile in userProfiles cache
      const peerProfile = userProfiles[peerId];
      if (peerProfile) {
        const updatedThemes = { ...peerProfile.chatThemes, [chatId]: theme };
        setUserProfile({ ...peerProfile, chatThemes: updatedThemes });
      }
      // Clear preview theme since it's now saved
      setPreviewThemes((prev) => {
        const updated = { ...prev };
        if (updated[peerId]) {
          const chatUpdates = { ...updated[peerId] };
          delete chatUpdates[chatId];
          updated[peerId] = chatUpdates;
        }
        return updated;
      });
    };

    const handlePeerThemeRemove = ({ chatId, peerId }: any) => {
      // Remove theme from peer's profile
      const peerProfile = userProfiles[peerId];
      if (peerProfile) {
        const updatedThemes = { ...peerProfile.chatThemes };
        delete updatedThemes[chatId];
        setUserProfile({ ...peerProfile, chatThemes: updatedThemes });
      }
      // Clear preview
      setPreviewThemes((prev) => {
        const updated = { ...prev };
        if (updated[peerId]) {
          const chatUpdates = { ...updated[peerId] };
          delete chatUpdates[chatId];
          updated[peerId] = chatUpdates;
        }
        return updated;
      });
    };

    const handlePeerThemePreview = ({ chatId, peerId, theme }: any) => {
      setPreviewThemes((prev) => ({
        ...prev,
        [peerId]: {
          ...(prev[peerId] || {}),
          [chatId]: theme
        }
      }));
    };

    socket.on('CHAT_THEME_UPDATED', handleThemeUpdate);
    socket.on('CHAT_THEME_REMOVED', handleThemeRemove);
    socket.on('PEER_CHAT_THEME_UPDATED', handlePeerThemeUpdate);
    socket.on('PEER_CHAT_THEME_REMOVED', handlePeerThemeRemove);
    socket.on('PEER_THEME_PREVIEW', handlePeerThemePreview);

    return () => {
      socket.off('CHAT_THEME_UPDATED', handleThemeUpdate);
      socket.off('CHAT_THEME_REMOVED', handleThemeRemove);
      socket.off('PEER_CHAT_THEME_UPDATED', handlePeerThemeUpdate);
      socket.off('PEER_CHAT_THEME_REMOVED', handlePeerThemeRemove);
      socket.off('PEER_THEME_PREVIEW', handlePeerThemePreview);
    };
  }, [currentUser, setCurrentUser, userProfiles, setUserProfile]);

  // ─── Typing indicator ─────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputText(value);

    // Auto-resize textarea
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
    }

    // Emoji suggestion logic
    const cursor = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursor);
    const match = textBeforeCursor.match(/:([a-zA-Z0-9_]{1,})$/);
    if (match) {
      const query = match[1].toLowerCase();
      setSuggestionQuery(query);
      const filtered = Object.values((data as any).emojis)
        .filter((emoji: any) => 
          emoji.id.toLowerCase().includes(query) || 
          emoji.keywords?.some((k: string) => k.toLowerCase().includes(query))
        )
        .slice(0, 8)
        .map((emoji: any) => ({
          id: emoji.id,
          native: emoji.skins[0].native
        }));
      setEmojiSuggestions(filtered);
      setSuggestionIndex(0);
    } else {
      setEmojiSuggestions([]);
    }

    if (!chatId || !currentUser) return;

    sendTyping(chatId, true, currentUser.name);
    // Always send live typing - let the receiver decide based on sender's showLiveTyping setting
    sendLiveTyping(chatId, value, currentUser.name);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(chatId, false, currentUser.name);
      sendLiveTyping(chatId, '', currentUser.name);
    }, APP_CONFIG.TYPING_TIMEOUT_MS);
  };

  // ─── Text formatting functions ────────────────────────────────────────────
  const handleTextSelection = () => {
    if (!inputRef.current) return;
    
    const start = inputRef.current.selectionStart;
    const end = inputRef.current.selectionEnd;
    
    if (start !== end) {
      // Text is selected
      setTextSelection({ start, end });
      
      // Calculate toolbar position
      const rect = inputRef.current.getBoundingClientRect();
      setFormatToolbarPos({
        top: rect.top - 50,
        left: rect.left + (rect.width / 2)
      });
      setShowFormatToolbar(!isTouchDevice);
    } else {
      setShowFormatToolbar(false);
      setTextSelection(null);
    }
  };

  const applyFormatting = (formatType: 'bold' | 'italic' | 'strikethrough' | 'underline' | 'code' | 'spoiler' | 'quote' | 'numberedList' | 'bulletList' | 'url') => {
    if (!inputRef.current || !textSelection) return;
    
    // Special handling for URL - open modal
    if (formatType === 'url') {
      const { start, end } = textSelection;
      const selectedText = inputText.substring(start, end);
      setUrlLinkText(selectedText);
      setUrlLinkUrl('');
      setShowUrlModal(true);
      setShowFormatToolbar(false);
      return;
    }
    
    const { start, end } = textSelection;
    const selectedText = inputText.substring(start, end);
    const before = inputText.substring(0, start);
    const after = inputText.substring(end);
    
    let formattedText = '';
    let newCursorPos = end;
    
    // Helper function to check if text is already formatted and toggle it
    const toggleFormat = (text: string, prefix: string, suffix?: string) => {
      const suffixToUse = suffix || prefix;
      if (text.startsWith(prefix) && text.endsWith(suffixToUse)) {
        // Remove formatting
        return {
          text: text.slice(prefix.length, -suffixToUse.length),
          wasToggled: true
        };
      }
      // Add formatting
      return {
        text: `${prefix}${text}${suffixToUse}`,
        wasToggled: false
      };
    };
    
    switch (formatType) {
      case 'bold': {
        const result = toggleFormat(selectedText, '*');
        formattedText = result.text;
        newCursorPos = start + formattedText.length;
        break;
      }
      case 'italic': {
        const result = toggleFormat(selectedText, '_');
        formattedText = result.text;
        newCursorPos = start + formattedText.length;
        break;
      }
      case 'strikethrough': {
        const result = toggleFormat(selectedText, '~');
        formattedText = result.text;
        newCursorPos = start + formattedText.length;
        break;
      }
      case 'underline': {
        const result = toggleFormat(selectedText, '__');
        formattedText = result.text;
        newCursorPos = start + formattedText.length;
        break;
      }
      case 'spoiler': {
        const result = toggleFormat(selectedText, '||');
        formattedText = result.text;
        newCursorPos = start + formattedText.length;
        break;
      }
      case 'code': {
        // Check if it's multi-line
        const hasNewlines = selectedText.includes('\n');
        
        if (hasNewlines) {
          // Multi-line code block with triple backticks
          const result = toggleFormat(selectedText, '```\n', '\n```');
          formattedText = result.text;
        } else {
          // Single-line inline code
          const result = toggleFormat(selectedText, '`');
          formattedText = result.text;
        }
        newCursorPos = start + formattedText.length;
        break;
      }
      case 'quote': {
        // Check if already quoted
        if (selectedText.startsWith('> ')) {
          // Remove quote from all lines
          formattedText = selectedText.split('\n').map(line => 
            line.startsWith('> ') ? line.slice(2) : line
          ).join('\n');
        } else {
          // Add quote to all lines
          formattedText = selectedText.split('\n').map(line => `> ${line}`).join('\n');
        }
        newCursorPos = start + formattedText.length;
        break;
      }
      case 'numberedList': {
        const lines = selectedText.split('\n');
        // Check if already a numbered list
        const isNumberedList = lines.every(line => /^\d+\.\s/.test(line));
        
        if (isNumberedList) {
          // Remove numbering
          formattedText = lines.map(line => line.replace(/^\d+\.\s/, '')).join('\n');
        } else {
          // Add numbering
          formattedText = lines.map((line, i) => `${i + 1}. ${line}`).join('\n');
        }
        newCursorPos = start + formattedText.length;
        break;
      }
      case 'bulletList': {
        const lines = selectedText.split('\n');
        // Check if already a bullet list
        const isBulletList = lines.every(line => line.startsWith('• '));
        
        if (isBulletList) {
          // Remove bullets
          formattedText = lines.map(line => line.slice(2)).join('\n');
        } else {
          // Add bullets
          formattedText = lines.map(line => `• ${line}`).join('\n');
        }
        newCursorPos = start + formattedText.length;
        break;
      }
    }
    
    const newText = before + formattedText + after;
    setInputText(newText);
    
    // Calculate new selection range (select the formatted text)
    const newStart = start;
    const newEnd = start + formattedText.length;
    
    // Update text selection state to reflect the new formatted text
    setTextSelection({ start: newStart, end: newEnd });
    
    // Restore focus and maintain selection
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        // Select the formatted text so user can apply more formats
        inputRef.current.setSelectionRange(newStart, newEnd);
        // Auto-resize textarea
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
      }
    }, 0);
  };

  // Insert URL link from modal
  const insertUrlLink = () => {
    if (!inputRef.current || !textSelection || !urlLinkText.trim() || !urlLinkUrl.trim()) return;
    
    const { start, end } = textSelection;
    const before = inputText.substring(0, start);
    const after = inputText.substring(end);
    
    // Format: [text](url)
    const linkText = `[${urlLinkText}](${urlLinkUrl})`;
    const newText = before + linkText + after;
    setInputText(newText);
    
    // Close modal and reset
    setShowUrlModal(false);
    setUrlLinkText('');
    setUrlLinkUrl('');
    setTextSelection(null);
    
    // Restore focus
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newCursorPos = start + linkText.length;
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        // Auto-resize textarea
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
      }
    }, 0);
  };

  // Handle keyboard shortcuts for formatting
  const handleFormattingShortcut = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!inputRef.current) return;
    
    const start = inputRef.current.selectionStart;
    const end = inputRef.current.selectionEnd;
    
    // Only apply shortcuts if text is selected
    if (start === end) return;
    
    setTextSelection({ start, end });
    
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') {
        e.preventDefault();
        applyFormatting('bold');
      } else if (e.key === 'i') {
        e.preventDefault();
        applyFormatting('italic');
      } else if (e.key === 'u') {
        e.preventDefault();
        applyFormatting('underline');
      } else if (e.shiftKey && e.key === 'X') {
        e.preventDefault();
        applyFormatting('strikethrough');
      } else if (e.shiftKey && e.key === 'P') {
        e.preventDefault();
        applyFormatting('spoiler');
      } else if (e.shiftKey && e.key === 'I') {
        e.preventDefault();
        applyFormatting('code');
      } else if (e.shiftKey && e.key === '&') { // Ctrl+Shift+7
        e.preventDefault();
        applyFormatting('numberedList');
      } else if (e.shiftKey && e.key === '*') { // Ctrl+Shift+8
        e.preventDefault();
        applyFormatting('bulletList');
      } else if (e.shiftKey && e.key === '>') { // Ctrl+Shift+.
        e.preventDefault();
        applyFormatting('quote');
      } else if (e.key === 'k') { // Ctrl+K
        e.preventDefault();
        applyFormatting('url');
      }
    }
  };

  // ─── Send text message ────────────────────────────────────────────────────
  const handleSend = (textOverride?: string) => {
    const textToSend = textOverride !== undefined ? textOverride : inputText;
    if (!textToSend || !chatId || !currentUser) return;
    if (textToSend.trim().length === 0) return;

    // ── Edit mode: save the edit instead of sending a new message ────────
    if (editingMsg) {
      if (textToSend !== editingMsg.content) {
        handleEditMessage(editingMsg.messageId, textToSend);
      }
      setEditingMsg(null);
      setInputText('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      return;
    }

    const messageId = genId();
    const optimisticMsg: Message = {
      messageId,
      chatId,
      senderId: currentUser.uid,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      content: textToSend,
      type: 'text',
      timestamp: new Date().toISOString(),
      readBy: [currentUser.uid],
      ...(replyingTo && {
        replyTo: {
          messageId: replyingTo.messageId,
          senderId: replyingTo.senderId,
          senderName: replyingTo.senderName,
          content: replyingTo.content,
          type: replyingTo.type,
          fileUrl: replyingTo.fileUrl,
          fileName: replyingTo.fileName,
        },
      }),
    };
    // Show message immediately (optimistic UI)
    const { addMessage, updateChatLastMessage } = useChatStore.getState();
    addMessage(optimisticMsg);
    updateChatLastMessage(optimisticMsg);

    sendMessage({
      messageId,
      chatId,
      content: textToSend,
      type: 'text',
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      ...(replyingTo && {
        replyTo: {
          messageId: replyingTo.messageId,
          senderId: replyingTo.senderId,
          senderName: replyingTo.senderName,
          content: replyingTo.content,
          type: replyingTo.type,
          fileUrl: replyingTo.fileUrl,
          fileName: replyingTo.fileName,
        },
      }),
    });
    setInputText('');
    setReplyingTo(null);
    
    // Reset textarea height after sending
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // Clear draft after sending
    if (chatId) {
      clearDraft(chatId);
      saveDraftToBackend(chatId, '');
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping(chatId, false, currentUser.name);
    sendLiveTyping(chatId, '', currentUser.name);
  };

  // ─── Reply / Forward handlers ─────────────────────────────────────────────
  const handleReply = useCallback((message: Message) => {
    setEditingMsg(null);
    setReplyingTo(message);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleForward = useCallback((message: Message) => {
    setForwardingMsgs([message]);
    setForwardTargetIds(new Set());
  }, []);

  // Helper to get the display name of the active chat (for bookmark source)
  const getActiveChatName = useCallback(() => {
    if (!activeChat) return undefined;
    if (activeChat.type === 'group') return activeChat.chatId;
    const otherUid = activeChat.members.find((m) => m !== currentUser?.uid);
    if (!otherUid) return undefined;
    return otherUid === currentUser?.uid ? currentUser?.name : userProfiles[otherUid]?.name;
  }, [activeChat, currentUser, userProfiles]);

  const handleBookmarkMessage = useCallback((message: Message) => {
    if (isBookmarked(message.messageId)) {
      removeBookmark(message.messageId);
      showBookmarkToast('removed');
    } else {
      addBookmark(message, getActiveChatName());
      showBookmarkToast('saved');
    }
  }, [isBookmarked, addBookmark, removeBookmark, getActiveChatName, showBookmarkToast]);

  const handlePin = useCallback(async (message: Message, action: 'pin' | 'unpin') => {
    if (!chatId) return;
    const pinnedIds = activeChat?.pinnedMessageIds ?? [];
    if (action === 'pin' && pinnedIds.length >= 50) {
      alert('You can pin at most 50 messages per chat.');
      return;
    }
    try {
      const fn = action === 'pin' ? pinMessageApi : unpinMessageApi;
      const res = await fn(chatId, message.messageId);
      if (res.success && res.data) {
        updateChatPins(chatId, res.data.pinnedMessageIds);
      } else {
        alert(res.error || 'Failed to update pin.');
      }
    } catch (err) {
      console.error('[pin]', err);
    }
  }, [chatId, activeChat, updateChatPins]);

  const handleScrollToMessage = useCallback((messageId: string) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-msg-id="${messageId}"]`);
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setHighlightedMsgId(messageId);
      setTimeout(() => setHighlightedMsgId(null), 1500);
    }
  }, []);

  const handleForwardTo = useCallback((targetChatIds: string[]) => {
    if (!forwardingMsgs.length || !currentUser) return;
    const BOOKMARK_ID = '__bookmarks__';
    for (const targetChatId of targetChatIds) {
      if (targetChatId === BOOKMARK_ID) {
        // Save to bookmarks instead of sending to a chat
        for (const msg of forwardingMsgs) {
          addBookmark({ ...msg, forwarded: true }, getActiveChatName());
        }
        continue;
      }
      for (const msg of forwardingMsgs) {
        sendMessage({
          chatId: targetChatId,
          content: msg.content,
          type: msg.type,
          senderName: currentUser.name,
          senderAvatar: currentUser.avatar,
          forwarded: true,
          ...(msg.fileUrl && { fileUrl: msg.fileUrl }),
          ...(msg.fileName && { fileName: msg.fileName }),
          ...(msg.fileSize && { fileSize: msg.fileSize }),
        });
      }
    }
    setForwardingMsgs([]);
    setForwardTargetIds(new Set());
    setForwardSearch('');
  }, [forwardingMsgs, currentUser, addBookmark, getActiveChatName]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (emojiSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev + 1) % emojiSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev - 1 + emojiSuggestions.length) % emojiSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selectedEmoji = emojiSuggestions[suggestionIndex];
        const cursor = e.currentTarget.selectionStart;
        const textBefore = inputText.slice(0, cursor);
        const textAfter = inputText.slice(cursor);
        const newTextBefore = textBefore.replace(/:[a-zA-Z0-9_]{1,}$/, selectedEmoji.native);
        setInputText(newTextBefore + textAfter);
        setEmojiSuggestions([]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setEmojiSuggestions([]);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      // On touch devices, Enter creates a new line (like Shift+Enter on desktop)
      // On desktop, Enter sends the message
      if (isTouchDevice) {
        // Allow default behavior (new line)
        return;
      }
      e.preventDefault();
      handleSend();
    }

    // ArrowUp with empty input → edit last own message
    if (e.key === 'ArrowUp' && !inputText && !editingMsg) {
      const lastOwn = [...chatMessages]
        .reverse()
        .find((m) => m.senderId === currentUser?.uid && m.type === 'text' && !m.deleted);
      if (lastOwn) {
        e.preventDefault();
        setEditingMsg(lastOwn);
        setReplyingTo(null);
        setInputText(lastOwn.content ?? '');
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
            const len = inputRef.current.value.length;
            inputRef.current.setSelectionRange(len, len);
          }
        }, 0);
      }
    }
  };

  // ─── Recording Handlers ───────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const constraints = {
        audio: true,
        video: recordingMode === 'video' ? {
          width: { ideal: 400 },
          height: { ideal: 400 },
          facingMode: facingMode
        } : false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setStreamBoth(stream);

      let streamToRecord = stream;

      // Use Canvas approach for continuous video recording
      if (recordingMode === 'video') {
        const videoEl = document.createElement('video');
        videoEl.autoplay = true;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.srcObject = stream;
        await videoEl.play().catch(console.error);
        recordingVideoRef.current = videoEl;

        const canvas = document.createElement('canvas');
        canvas.width = 400; // Force 400x400 square for video notes
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        recordingCanvasRef.current = canvas;

        const drawFrame = () => {
          if (!recordingVideoRef.current || !ctx || !recordingCanvasRef.current) return;
          const video = recordingVideoRef.current;
          // When flipping, skip drawing to freeze the last frame on canvas
          if (!pauseDrawRef.current && video.readyState >= 2) {
            const videoAspect = video.videoWidth / video.videoHeight;
            const canvasAspect = 1; // square
            let sx = 0, sy = 0, sWidth = video.videoWidth, sHeight = video.videoHeight;
            if (videoAspect > canvasAspect) {
              sWidth = sHeight * canvasAspect;
              sx = (video.videoWidth - sWidth) / 2;
            } else if (videoAspect < canvasAspect) {
              sHeight = sWidth / canvasAspect;
              sy = (video.videoHeight - sHeight) / 2;
            }
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Flip horizontal if it's the front camera
            ctx.save();
            if (facingMode === 'user' || video.style.transform.includes('scaleX(-1)')) {
               ctx.translate(canvas.width, 0);
               ctx.scale(-1, 1);
            }
            ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          }
          drawFrameRef.current = requestAnimationFrame(drawFrame);
        };
        drawFrameRef.current = requestAnimationFrame(drawFrame);

        const canvasStream = canvas.captureStream(30); // 30 FPS
        coreAudioTrackRef.current = stream.getAudioTracks()[0];
        const combinedStream = new MediaStream([canvasStream.getVideoTracks()[0]]);
        if (coreAudioTrackRef.current) {
          combinedStream.addTrack(coreAudioTrackRef.current);
        }
        streamToRecord = combinedStream;
      }

      const mediaRecorder = new MediaRecorder(streamToRecord, {
        mimeType: recordingMode === 'video' ? 'video/webm;codecs=vp8' : 'audio/webm'
      });
      
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        // If we are flipping the camera, we might intentionally stop this recorder 
        // but keep isRecording = true. We handle concatenation there.
        // However, for simplicity, let's just handle normal stop here.
        if (isCameraFlippingRef.current) return;

        const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
        const finalDuration = recordingDurationSecondsRef.current;
        
        // Always stop all tracks to release camera/mic
        streamRef.current?.getTracks().forEach(track => track.stop());

        if (finalDuration >= 1) { // Min 1s recording
          setRecordedMediaBlob(blob);
          setRecordedMediaUrl(URL.createObjectURL(blob));
          setIsPreviewingRecording(true);
          setRecordedMode(recordingMode);
          if (recordingMode === 'voice') {
            setRecordedWaveform([...waveformHistory]);
          }
        }
        setStreamBoth(null);
        setIsRecording(false);
        clearInterval(recordingTimerRef.current!);
      };

      // Audio analysis for rolling waveform visualizer
      if (recordingMode === 'voice') {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5; // less smoothing for snappier waveform
        source.connect(analyser);
        audioCtxRef.current = audioContext;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateWaveform = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            
            // Calculate average volume (RMS) to represent a single 'bar' for the current moment
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
               sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            const normalized = Math.min(1, avg / 128); // Approx 0 to 1

            setWaveformHistory(prev => {
               const next = [...prev, normalized];
               if (next.length > 40) next.shift(); // keep last 40 samples
               return next;
            });
            
            // Schedule next sample ~100ms apart to create the timeline
            setTimeout(() => requestAnimationFrame(updateWaveform), 50);
          }
        };
        // Start after a tiny delay
        setTimeout(updateWaveform, 100);
      }

      mediaRecorder.start();
      setRecorder(mediaRecorder);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingDurationSecondsRef.current = 0;
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const next = prev + 1;
          recordingDurationSecondsRef.current = next;
          return next;
        });
      }, 1000);

    } catch (err) {
      console.error('[Recording] Failed:', err);
      const isDOMException = err instanceof DOMException;
      setRecordingError(
        isDOMException && err.name === 'NotReadableError'
          ? 'Camera is in use by another application. Please close it and try again.'
          : isDOMException && err.name === 'NotAllowedError'
          ? 'Permission denied. Please allow camera and microphone access.'
          : 'Could not access microphone/camera. Please check your device settings.'
      );
    }
  };

  const cleanupCanvasRecording = () => {
    if (drawFrameRef.current) {
      cancelAnimationFrame(drawFrameRef.current);
      drawFrameRef.current = 0;
    }
    pauseDrawRef.current = false;
    if (recordingVideoRef.current) {
      recordingVideoRef.current.srcObject = null;
      recordingVideoRef.current = null;
    }
    recordingCanvasRef.current = null;
    coreAudioTrackRef.current = null;
  };

  const stopRecording = () => {
    isCameraFlippingRef.current = false;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop(); // onstop handler will stop tracks via streamRef
    } else if (recordedChunksRef.current.length > 0) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      setStreamBoth(null);
      finalizeMultiChunkRecording();
    }
    clearInterval(recordingTimerRef.current!);
    setIsRecording(false);
    cleanupCanvasRecording();
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
  };

  const cancelRecording = () => {
    isCameraFlippingRef.current = false;
    recordedChunksRef.current = [];
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null; // Don't trigger send
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    clearInterval(recordingTimerRef.current!);
    setIsRecording(false);
    setStreamBoth(null);
    setRecorder(null);
    cleanupCanvasRecording();
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
  };

  // ─── Close preview on Esc ───────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewFile) {
        setPreviewFile(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewFile]);

  const finalizeMultiChunkRecording = () => {
      const blob = new Blob(recordedChunksRef.current, { type: recordingMode === 'video' ? 'video/webm;codecs=vp8' : 'audio/webm' });
      const finalDuration = recordingDurationSecondsRef.current;
      
      // Always stop all tracks to release camera/mic
      streamRef.current?.getTracks().forEach(track => track.stop());
      setStreamBoth(null);

      if (finalDuration >= 1) {
        setRecordedMediaBlob(blob);
        setRecordedMediaUrl(URL.createObjectURL(blob));
        setIsPreviewingRecording(true);
        setRecordedMode(recordingMode);
        if (recordingMode === 'voice') {
          setRecordedWaveform([...waveformHistory]);
        }
      }
      setIsRecording(false);
      recordedChunksRef.current = [];
  };

  const flipCamera = async () => {
    if (!isRecording || recordingMode !== 'video' || !stream || !recorder) return;
    try {
      const newFacingMode = facingMode === 'user' ? 'environment' : 'user';

      // Freeze canvas on last frame so no black flicker during transition
      pauseDrawRef.current = true;

      // Stop old video track and wait for OS to release it
      stream.getVideoTracks().forEach(t => t.stop());
      await new Promise(resolve => setTimeout(resolve, 300));

      const newCameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 400 },
          height: { ideal: 400 },
          facingMode: newFacingMode,
        }
      });

      // Construct a replacement stream keeping the original audio track
      const tracks = [...newCameraStream.getVideoTracks()];
      if (coreAudioTrackRef.current) {
        tracks.push(coreAudioTrackRef.current);
      }
      const replacementStream = new MediaStream(tracks);

      if (recordingVideoRef.current) {
        recordingVideoRef.current.srcObject = replacementStream;
        recordingVideoRef.current.style.transform = newFacingMode === 'user' ? 'scaleX(-1)' : 'none';
        await recordingVideoRef.current.play().catch(console.error);
        // Wait for first frame to be ready before resuming draw
        await new Promise<void>(resolve => {
          const v = recordingVideoRef.current!;
          if (v.readyState >= 2) { resolve(); return; }
          v.addEventListener('canplay', () => resolve(), { once: true });
        });
      }

      // Resume drawing now that new camera is live
      pauseDrawRef.current = false;
      setStreamBoth(replacementStream);
      setFacingMode(newFacingMode);
    } catch (err) {
      pauseDrawRef.current = false;
      console.error('Failed to flip camera:', err);
      setRecordingError('Could not switch camera. Your device may only have one camera.');
    }
  };

  const handleDiscardRecording = () => {
    if (recordedMediaUrl) URL.revokeObjectURL(recordedMediaUrl);
    // Ensure tracks are released (belt-and-suspenders)
    streamRef.current?.getTracks().forEach(track => track.stop());
    setRecordedMediaBlob(null);
    setRecordedMediaUrl(null);
    setIsPreviewingRecording(false);
    setIsPreviewPlaying(false);
    setStreamBoth(null);
    setRecorder(null);
  };

  const togglePreviewPlayback = () => {
    const media = previewMediaRef.current;
    if (!media) return;
    
    if (media.paused) {
      media.play();
      setIsPreviewPlaying(true);
    } else {
      media.pause();
      setIsPreviewPlaying(false);
    }
  };
   
  const handleConfirmSend = () => {
    if (recordedMediaBlob) {
      handleSendRecordedMedia(recordedMediaBlob, recordingDurationSecondsRef.current);
    }
    handleDiscardRecording();
  };

  const handleSendRecordedMedia = async (blob: Blob, duration: number) => {
    if (!chatId || !currentUser) return;
    const file = new File([blob], `recording_${Date.now()}.${recordedMode === 'video' ? 'webm' : 'ogg'}`, { type: blob.type });
    
    const validation = validateFile(file);
    if (!validation.valid) {
      setFileError(validation.error || 'Recording exceeds 100MB limit');
      return;
    }

    try {
      setIsUploading(true);
      const result = await uploadChatFile(file, chatId, (progress) => {
        setUploadProgress(Math.round(progress));
      });

      const msgType = recordedMode === 'video' ? 'video_note' : 'voice_note';
      const messageId = genId();
      const optimisticMsg: Message = {
        messageId,
        chatId,
        senderId: currentUser.uid,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar,
        content: `Sent a ${recordedMode === 'video' ? 'video note' : 'voice note'}`,
        type: msgType,
        fileUrl: result.url,
        fileName: result.fileName,
        fileSize: result.fileSize,
        duration,
        timestamp: new Date().toISOString(),
        readBy: [currentUser.uid],
      };
      
      const { addMessage, updateChatLastMessage } = useChatStore.getState();
      addMessage(optimisticMsg);
      updateChatLastMessage(optimisticMsg);

      sendMessage({
        messageId,
        chatId,
        content: `Sent a ${recordedMode === 'video' ? 'video note' : 'voice note'}`,
        type: msgType,
        fileUrl: result.url,
        fileName: result.fileName,
        fileSize: result.fileSize,
        duration,
        mirrored: recordedMode === 'video' && facingMode === 'user',
        senderName: currentUser?.name || 'Unknown',
        senderAvatar: currentUser?.avatar || ''
      });
    } catch (err) {
      console.error('[Upload] Recording failed:', err);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // ─── File upload ──────────────────────────────────────────────────────────
  const uploadFiles = async (files: File[], caption?: string, isSpoiler?: boolean) => {
    if (files.length === 0 || !chatId || !currentUser) return;

    // Generate a shared groupId for batch uploads (multi-file grid rendering)
    const batchGroupId = files.length > 1
      ? `grp_${Date.now()}_${Math.random().toString(36).slice(2)}`
      : undefined;

    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      const isLastFile = fi === files.length - 1;
      const validation = validateFile(file);
      if (!validation.valid) {
        setFileError(validation.error || `File "${file.name}" exceeds 100MB limit`);
        continue;
      }

      try {
        setIsUploading(true);
        const result = await uploadChatFile(file, chatId, (progress) => {
          setUploadProgress(Math.round(progress));
        });

        const msgType = getMessageTypeFromMime(file.type);
        const isMediaType = msgType === 'image' || msgType === 'video';
        
        sendMessage({
          chatId,
          // Attach caption to last file message so it renders in the same bubble
          content: isLastFile && caption ? caption : '',
          type: msgType,
          fileUrl: result.url,
          fileName: result.fileName,
          fileSize: result.fileSize,
          senderName: currentUser.name || 'Unknown',
          senderAvatar: currentUser.avatar || '',
          ...(batchGroupId ? { groupId: batchGroupId } : {}),
          ...(isMediaType && isSpoiler ? { isSpoiler: true } : {})
        });
      } catch (err) {
        console.error('[Upload] Failed:', err);
        setFileError(`Failed to upload "${file.name}". Please try again.`);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPendingUploadFiles(prev =>
        prev.length > 0 ? [...prev, ...files] : files
      );
      // Only reset caption when starting fresh (not adding more)
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setPendingUploadFiles(Array.from(e.dataTransfer.files));
      setUploadCaption('');
      setUploadAsSpoiler(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      setPendingUploadFiles(files);
      setUploadCaption('');
      setUploadAsSpoiler(false);
    }
  };

  const handleConfirmUpload = async () => {
    const files = pendingUploadFiles;
    const caption = uploadCaption.trim();
    const isSpoiler = uploadAsSpoiler;
    setPendingUploadFiles([]);
    setUploadCaption('');
    setUploadAsSpoiler(false);
    // Pass caption and spoiler flag into uploadFiles
    await uploadFiles(files, caption, isSpoiler);
  };

  const handleRemovePendingFile = (index: number) => {
    setPendingUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Delete message ─────────────────────────────────────────────────────

  const handleDeleteMessage = useCallback(
    (messageId: string, scope: 'me' | 'both') => {
      setMsgConfirmDelete({ ids: [messageId], scope });
    },
    [],
  );

  // ─── Selection mode helpers ───────────────────────────────────────────────
  const enterSelectionMode = useCallback((firstMsgId: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([firstMsgId]));
  }, []);

  const enterSelectionModeEmpty = useCallback(() => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const executeDeleteMessages = useCallback(
    async (ids: string[], scope: 'me' | 'both') => {
      if (!chatId || ids.length === 0) return;
      setMsgDeleting(true);
      try {
        // Parallelize API calls for better performance in bulk delete
        await Promise.all(ids.map(id => deleteMessageApi(chatId!, id, scope)));
        
        ids.forEach(id => {
          if (scope === 'me') {
            removeMessage(chatId!, id);
          } else {
            markMessageDeleted(chatId!, id);
          }
        });
        setMsgConfirmDelete(null);
        if (selectionMode) exitSelectionMode();
      } catch (err) {
        console.error('[deleteMessages] Failed:', err);
      } finally {
        setMsgDeleting(false);
      }
    },
    [chatId, removeMessage, markMessageDeleted, selectionMode, exitSelectionMode],
  );

  // Escape key cancels selection mode and edit mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitSelectionMode();
        setEditingMsg(null);
        setInputText('');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [exitSelectionMode]);

  // Drag-to-select: track anchor message index
  const dragAnchorIdx = useRef<number | null>(null);

  const getMsgIdxFromTarget = (target: EventTarget | null): number | null => {
    const el = (target as Element)?.closest('[data-msg-idx]') as HTMLElement | null;
    return el ? parseInt(el.dataset.msgIdx ?? '', 10) : null;
  };

  const getMsgIdxFromPoint = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-msg-idx]') as HTMLElement | null;
    return el ? parseInt(el.dataset.msgIdx ?? '', 10) : null;
  };

  const handleMsgMouseDown = useCallback((e: React.MouseEvent) => {
    const idx = getMsgIdxFromTarget(e.target);
    if (idx === null) return;
    dragAnchorIdx.current = idx;
  }, []);

  const handleMsgMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragAnchorIdx.current === null || !(e.buttons & 1)) return;
    const idx = getMsgIdxFromTarget(e.target);
    if (idx === null) return;
    // Only enter selection mode once the drag moves to a different message
    if (idx !== dragAnchorIdx.current) {
      setSelectionMode(true);
    }
    if (!selectionMode && idx === dragAnchorIdx.current) return;
    const lo = Math.min(dragAnchorIdx.current, idx);
    const hi = Math.max(dragAnchorIdx.current, idx);
    const ids = chatMessages.slice(lo, hi + 1).map((m) => m.messageId);
    setSelectedIds(new Set(ids));
  }, [selectionMode, chatMessages]);

  const handleMsgMouseUp = useCallback(() => {
    dragAnchorIdx.current = null;
  }, []);

  // ─── Touch long-press drag-to-select ─────────────────────────────────────
  const touchSelectAnchorIdx = useRef<number | null>(null);
  const touchSelectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchSelectActive = useRef(false);
  const touchSelectStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchAutoScrollRAF = useRef<number | null>(null);
  const touchLastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const LONG_PRESS_MS = 500;
  const AUTO_SCROLL_ZONE = 80;
  const AUTO_SCROLL_SPEED = 12;

  const stopTouchAutoScroll = () => {
    if (touchAutoScrollRAF.current !== null) {
      cancelAnimationFrame(touchAutoScrollRAF.current);
      touchAutoScrollRAF.current = null;
    }
  };

  const startTouchAutoScroll = () => {
    if (touchAutoScrollRAF.current !== null) return;
    const tick = () => {
      const container = scrollContainerRef.current;
      if (!container || !touchSelectActive.current) { stopTouchAutoScroll(); return; }

      const rect = container.getBoundingClientRect();
      const y = touchLastPos.current.y;
      const distFromTop = y - rect.top;
      const distFromBottom = rect.bottom - y;

      if (distFromTop < AUTO_SCROLL_ZONE) {
        container.scrollTop -= AUTO_SCROLL_SPEED * (1 - distFromTop / AUTO_SCROLL_ZONE);
      } else if (distFromBottom < AUTO_SCROLL_ZONE) {
        container.scrollTop += AUTO_SCROLL_SPEED * (1 - distFromBottom / AUTO_SCROLL_ZONE);
      }

      // Re-evaluate selection after scroll shifts content
      if (touchSelectAnchorIdx.current !== null) {
        const idx = getMsgIdxFromPoint(touchLastPos.current.x, touchLastPos.current.y);
        if (idx !== null) {
          const lo = Math.min(touchSelectAnchorIdx.current, idx);
          const hi = Math.max(touchSelectAnchorIdx.current, idx);
          const ids = chatMessages.slice(lo, hi + 1).map((m) => m.messageId);
          setSelectedIds(new Set(ids));
        }
      }

      touchAutoScrollRAF.current = requestAnimationFrame(tick);
    };
    touchAutoScrollRAF.current = requestAnimationFrame(tick);
  };

  const handleMsgTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchSelectStartPos.current = { x: touch.clientX, y: touch.clientY };
    touchLastPos.current = { x: touch.clientX, y: touch.clientY };
    touchSelectActive.current = false;
    const idx = getMsgIdxFromPoint(touch.clientX, touch.clientY);
    if (idx === null) return;

    if (selectionMode) {
      touchSelectTimer.current = setTimeout(() => {
        touchSelectActive.current = true;
        touchSelectAnchorIdx.current = idx;
      }, LONG_PRESS_MS);
      return;
    }

    touchSelectTimer.current = setTimeout(() => {
      touchSelectActive.current = true;
      touchSelectAnchorIdx.current = idx;
      setSelectionMode(true);
      setSelectedIds(new Set([chatMessages[idx]?.messageId].filter(Boolean) as string[]));
    }, LONG_PRESS_MS);
  }, [selectionMode, chatMessages]);

  const handleMsgTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchLastPos.current = { x: touch.clientX, y: touch.clientY };

    // Cancel long-press if finger moved too much before timer fires
    if (!touchSelectActive.current && touchSelectStartPos.current) {
      const dx = touch.clientX - touchSelectStartPos.current.x;
      const dy = touch.clientY - touchSelectStartPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        if (touchSelectTimer.current) clearTimeout(touchSelectTimer.current);
        touchSelectTimer.current = null;
      }
    }
    if (!touchSelectActive.current || touchSelectAnchorIdx.current === null) return;
    e.preventDefault(); // prevent scroll while drag-selecting

    // Update selection based on current finger position
    const idx = getMsgIdxFromPoint(touch.clientX, touch.clientY);
    if (idx !== null) {
      const lo = Math.min(touchSelectAnchorIdx.current, idx);
      const hi = Math.max(touchSelectAnchorIdx.current, idx);
      const ids = chatMessages.slice(lo, hi + 1).map((m) => m.messageId);
      setSelectedIds(new Set(ids));
    }

    const el = scrollContainerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const distFromTop = touch.clientY - rect.top;
      const distFromBottom = rect.bottom - touch.clientY;
      if (distFromTop < AUTO_SCROLL_ZONE || distFromBottom < AUTO_SCROLL_ZONE) {
        startTouchAutoScroll();
      } else {
        stopTouchAutoScroll();
      }
    }
  }, [chatMessages]);

  const handleMsgTouchEnd = useCallback(() => {
    if (touchSelectTimer.current) clearTimeout(touchSelectTimer.current);
    touchSelectTimer.current = null;
    touchSelectActive.current = false;
    touchSelectAnchorIdx.current = null;
    touchSelectStartPos.current = null;
    stopTouchAutoScroll();
  }, []);

  const toggleSelectMessage = useCallback((messageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId); else next.add(messageId);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback((scope: 'me' | 'both') => {
    if (!chatId || selectedIds.size === 0) return;
    setMsgConfirmDelete({ ids: Array.from(selectedIds), scope });
  }, [chatId, selectedIds]);

  const handleBulkForward = useCallback(() => {
    const msgs = chatMessages.filter((m) => selectedIds.has(m.messageId) && !m.deleted);
    if (!msgs.length) return;
    setForwardingMsgs(msgs);
    setForwardTargetIds(new Set());
    exitSelectionMode();
  }, [selectedIds, chatMessages, exitSelectionMode]);

  const handleBulkPin = useCallback(async () => {
    for (const id of selectedIds) {
      const msg = chatMessages.find((m) => m.messageId === id);
      if (msg) await handlePin(msg, (activeChat?.pinnedMessageIds ?? []).includes(id) ? 'unpin' : 'pin');
    }
    exitSelectionMode();
  }, [selectedIds, chatMessages, handlePin, activeChat, exitSelectionMode]);

  const handleBulkCopy = useCallback(() => {
    const texts = chatMessages
      .filter((m) => selectedIds.has(m.messageId) && !m.deleted && m.content)
      .map((m) => m.content!)
      .join('\n');
    if (texts) navigator.clipboard.writeText(texts).catch(() => {});
    exitSelectionMode();
  }, [selectedIds, chatMessages, exitSelectionMode]);

  const handleSelectionEdit = useCallback(() => {
    if (selectedIds.size !== 1) return;
    const [msgId] = [...selectedIds];
    const msg = chatMessages.find((m) => m.messageId === msgId);
    if (msg) {
      setEditingMsg(msg);
      setReplyingTo(null);
      setInputText(msg.content ?? '');
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.style.height = 'auto';
          inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        }
      }, 0);
    }
    exitSelectionMode();
  }, [selectedIds, chatMessages, exitSelectionMode]);

  const handleSelectionReply = useCallback(() => {
    if (selectedIds.size !== 1) return;
    const [msgId] = [...selectedIds];
    const msg = chatMessages.find((m) => m.messageId === msgId);
    if (msg) handleReply(msg);
    exitSelectionMode();
  }, [selectedIds, chatMessages, handleReply, exitSelectionMode]);

  // Exit selection mode when switching chat
  useEffect(() => { exitSelectionMode(); }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps
  // ─── Edit message ──────────────────────────────────────────────────────────────
  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!chatId) return;
      // Optimistic update
      syncMessageUpdate(messageId, { content: newContent, isEdited: true });
      try {
        await editMessageApi(chatId, messageId, newContent);
      } catch (err) {
        console.error('[editMessage] Failed:', err);
      }
    },
    [chatId, syncMessageUpdate],
  );
  // ─── Start call ──────────────────────────────────────────────────────────
  const handleReact = (messageId: string, emoji: string) => {
    if (!activeChat || !currentUser) return;
    const msg = chatMessages.find(m => m.messageId === messageId);
    if (!msg) return;

    const reactions = msg.reactions || {};
    const usersWithEmoji = reactions[emoji] || [];
    const hasReacted = usersWithEmoji.includes(currentUser.uid);

    // Optimistic UI update using unified sync function
    const nextReactions = { ...reactions };
    if (hasReacted) {
      nextReactions[emoji] = usersWithEmoji.filter(id => id !== currentUser.uid);
      if (nextReactions[emoji].length === 0) delete nextReactions[emoji];
      removeReaction(messageId, activeChat.chatId, emoji);
    } else {
      nextReactions[emoji] = [...usersWithEmoji, currentUser.uid];
      sendReaction(messageId, activeChat.chatId, emoji);
    }
    syncMessageUpdate(messageId, { reactions: nextReactions });
  };

  const handleStartCall = async (callType: 'video' | 'voice') => {
    if (!peer) return;
    // In Electron mode the call window captures its own stream; no pre-capture needed.
    // In non-Electron fallback the stream is captured inside startCall() itself.
    startCall(peer.uid, peer.profile?.name || 'User', callType, peer.profile?.avatar);
  };

  const handleActionMouseDown = () => {
    isLongPressActive.current = false;
    if (inputText.trim() || isRecording) return;
    
    holdTimerRef.current = setTimeout(() => {
      isLongPressActive.current = true;
      startRecording();
      setShowHoldToast(false);
    }, 1000);
  };

  const handleActionMouseUp = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handleActionClick = () => {
    if (isLongPressActive.current) {
      isLongPressActive.current = false;
      return;
    }

    if (inputText.trim()) {
      handleSend();
    } else if (isRecording) {
      stopRecording();
    } else {
      setRecordingMode(prev => prev === 'voice' ? 'video' : 'voice');
      setShowHoldToast(true);
      setTimeout(() => setShowHoldToast(false), 3000);
    }
  };

  if (!activeChat) {
    // ... (no-chat placeholder logic) ...
    if (chatId) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-secondary)' }}>
          <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--accent, #6366f1)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      );
    }
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-secondary)' }}>
        <MessageCircle size={64} style={{ color: 'var(--text-secondary)' }} />
        <p style={{ fontSize: 18 }}>Select a chat to start messaging</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {isLocked ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', zIndex: 10
        }}>
          <Lock size={64} style={{ marginBottom: 16, opacity: 0.5 }} />
          <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Chat Locked</h2>
          <p style={{ marginBottom: 24 }}>Enter your PIN to access this conversation</p>
          <button
            onClick={() => setPinModal({ mode: 'verify' })}
            style={{
              padding: '10px 24px', borderRadius: 20, backgroundColor: 'var(--accent)',
              color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer'
            }}
          >
            Unlock Chat
          </button>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            position: 'relative',
            backgroundColor: 'var(--bg-primary)',
          }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {/* Fixed background layer for theme image */}
          {displayTheme?.backgroundImage && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundImage: `url(${displayTheme.backgroundImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                zIndex: 0,
                pointerEvents: 'none',
              }}
            />
          )}
          {/* Fixed overlay for opacity and blur */}
          {displayTheme && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: `rgba(15, 23, 42, ${1 - (displayTheme.peerOverrides?.opacity !== undefined ? displayTheme.peerOverrides.opacity : (displayTheme.opacity ?? 1))})`,
                backdropFilter: (displayTheme.peerOverrides?.blur !== undefined ? displayTheme.peerOverrides.blur : (displayTheme.blur ?? 0)) > 0 
                  ? `blur(${displayTheme.peerOverrides?.blur !== undefined ? displayTheme.peerOverrides.blur : displayTheme.blur}px)` 
                  : undefined,
                WebkitBackdropFilter: (displayTheme.peerOverrides?.blur !== undefined ? displayTheme.peerOverrides.blur : (displayTheme.blur ?? 0)) > 0 
                  ? `blur(${displayTheme.peerOverrides?.blur !== undefined ? displayTheme.peerOverrides.blur : displayTheme.blur}px)` 
                  : undefined,
                zIndex: 1,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Localized portal container for emoji pickers and reactions */}
          <div 
            id="chat-emoji-picker-container" 
            style={{ 
              position: 'absolute', 
              inset: 0, 
              pointerEvents: 'none', 
              zIndex: 9999, // Ensure it's above most elements but inside the chat window
            }} 
          />
      {dragActive && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          pointerEvents: 'none',
          animation: 'fadeIn 0.2s ease-out',
          border: '2px dashed var(--accent)',
          borderRadius: 12,
          margin: 10
        }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            backgroundColor: 'rgba(var(--accent-rgb), 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            color: 'var(--accent)'
          }}>
            <Paperclip size={40} />
          </div>
          <h2 style={{ color: '#fff', margin: '0 0 8px' }}>Drop files to send</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>Maximum file size: 100MB</p>
        </div>
      )}
      {/* Header */}
      <div
        className="chat-window-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          zIndex: 1,
        }}
      >
        {/* Mobile back button — always visible when embedded (onBack set) */}
        <button
          className={`mobile-back-btn${onBack ? ' show' : ''}`}
          onClick={() => onBack ? onBack() : navigate('/chats')}
          title="Back"
          style={{ ...headerBtnStyle, marginLeft: -6 }}
        >
          <ChevronLeft size={22} />
        </button>
        {peer ? (
          <>
            <button
              onClick={() => showProfile ? closeProfile() : openProfile()}
              title="View profile"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', borderRadius: '50%', flexShrink: 0 }}
            >
              <UserAvatar
                name={peer.profile?.name || 'User'}
                avatar={peer.profile?.avatar}
                size={40}
                online={peer.online}
              />
            </button>
            <button
              onClick={() => showProfile ? closeProfile() : openProfile()}
              title="View profile"
              className="chat-header-info"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', minWidth: 0, flex: 1, overflow: 'hidden' }}
            >
              <div className="chat-header-name" style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {peer.isDeleted
                    ? (nicknames[peer.uid] || peer.profile?.name || 'Deleted User')
                    : peer.isSelf
                      ? (peer.profile?.name || currentUser?.name || 'You')
                      : (nicknames[peer.uid] || peer.profile?.name || 'User')}
                </span>
                {peer.isSelf && !peer.isDeleted && (
                  <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>(You)</span>
                )}
                {peer.isDeleted && (
                  <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>(Deleted User)</span>
                )}
              </div>
              <div className="chat-header-status" style={{ fontSize: 12, color: peer.isSelf ? 'var(--text-secondary)' : (peer.online ? '#22c55e' : 'var(--text-secondary)'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {peer.isDeleted
                  ? 'Account deleted'
                  : peer.isSelf
                    ? 'Message yourself'
                    : peer.online
                      ? 'Online'
                      : peer.profile?.lastSeen
                        ? formatLastSeen(peer.profile.lastSeen)
                        : 'Offline'}
              </div>
            </button>
          </>
        ) : (
          <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>
            Group Chat
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexShrink: 0 }}>
          {activeChat.type === 'private' && (
            <>
              {isPeerInExternalCall ? (
                <button
                  onClick={() => continueCall()}
                  title="Continue call on this device"
                  style={{
                    ...headerBtnStyle,
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    color: '#22c55e',
                    padding: '6px 16px',
                    borderRadius: 20,
                    width: 'auto',
                    gap: 8,
                    fontWeight: 600,
                    fontSize: 13,
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <RefreshCw size={14} style={{ animation: 'spin 4s linear infinite' }} />
                  Continue
                </button>
              ) : (
                <>
                  <button
                    onClick={() => !isInCall && handleStartCall('voice')}
                    title={isInCall ? 'Already in a call' : 'Voice call'}
                    disabled={isInCall}
                    style={{ ...headerBtnStyle, opacity: isInCall ? 0.35 : 1, cursor: isInCall ? 'not-allowed' : 'pointer' }}
                  >
                    <Phone size={18} />
                  </button>
                  <button
                    onClick={() => !isInCall && handleStartCall('video')}
                    title={isInCall ? 'Already in a call' : 'Video call'}
                    disabled={isInCall}
                    style={{ ...headerBtnStyle, opacity: isInCall ? 0.35 : 1, cursor: isInCall ? 'not-allowed' : 'pointer' }}
                  >
                    <Video size={18} />
                  </button>
                </>
              )}
            </>
          )}
          <button
            onClick={() => setSearchOpen((o) => !o)}
            title="Search messages"
            style={{ ...headerBtnStyle, color: searchOpen ? 'var(--accent)' : 'var(--text-secondary)' }}
          >
            <Search size={18} />
          </button>
          <button
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
              setHeaderMenu((m) => m ? null : { x: rect.right, y: rect.bottom + 4 });
            }}
            title="More options"
            style={headerBtnStyle}
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* ─── Header three-dot dropdown ──────────────────────────────────── */}
      {headerMenu && (
        <div
          ref={headerMenuRef}
          style={{
            position: 'fixed',
            top: headerMenu.y,
            left: headerMenu.x - 190,
            zIndex: 1000,
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            minWidth: 190,
          }}
        >
          {selectionMode ? (() => {
            const count = selectedIds.size;
            const onlyOne = count === 1;
            const singleMsg = onlyOne ? chatMessages.find((m) => m.messageId === [...selectedIds][0]) : undefined;
            const canEdit = onlyOne && !!singleMsg && !singleMsg.deleted && singleMsg.type === 'text' && singleMsg.senderId === currentUser?.uid;
            const canReply = onlyOne && !!singleMsg && !singleMsg.deleted;
            return (
              <>
                <div style={{ padding: '6px 14px 4px', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: 0.3 }}>
                  {count === 0 ? 'Select messages' : `${count} selected`}
                </div>
                <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
                <button
                  onClick={() => { setHeaderMenu(null); handleSelectionEdit(); }}
                  disabled={!canEdit}
                  style={{ ...headerCtxItemStyle, opacity: canEdit ? 1 : 0.35, cursor: canEdit ? 'pointer' : 'default' }}
                >
                  <Pencil size={14} style={{ marginRight: 8 }} />Edit message
                </button>
                <button
                  onClick={() => { setHeaderMenu(null); handleSelectionReply(); }}
                  disabled={!canReply}
                  style={{ ...headerCtxItemStyle, opacity: canReply ? 1 : 0.35, cursor: canReply ? 'pointer' : 'default' }}
                >
                  <CornerUpLeft size={14} style={{ marginRight: 8 }} />Reply message
                </button>
                <button
                  onClick={() => { setHeaderMenu(null); handleBulkForward(); }}
                  disabled={count === 0}
                  style={{ ...headerCtxItemStyle, opacity: count > 0 ? 1 : 0.35, cursor: count > 0 ? 'pointer' : 'default' }}
                >
                  <Forward size={14} style={{ marginRight: 8 }} />Forward message
                </button>
                <button
                  onClick={() => { setHeaderMenu(null); handleBulkCopy(); }}
                  disabled={count === 0}
                  style={{ ...headerCtxItemStyle, opacity: count > 0 ? 1 : 0.35, cursor: count > 0 ? 'pointer' : 'default' }}
                >
                  <Copy size={14} style={{ marginRight: 8 }} />Copy message
                </button>
                <button
                  onClick={() => { setHeaderMenu(null); handleBulkPin(); }}
                  disabled={count === 0}
                  style={{ ...headerCtxItemStyle, opacity: count > 0 ? 1 : 0.35, cursor: count > 0 ? 'pointer' : 'default' }}
                >
                  <Pin size={14} style={{ marginRight: 8 }} />Pin messages
                </button>
                <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
                <button
                  onClick={() => { setHeaderMenu(null); handleBulkDelete('me'); }}
                  disabled={count === 0}
                  style={{ ...headerCtxItemStyle, opacity: count > 0 ? 1 : 0.35, cursor: count > 0 ? 'pointer' : 'default' }}
                >
                  <Trash2 size={14} style={{ marginRight: 8 }} />Delete selected for me
                </button>
                <button
                  onClick={() => { setHeaderMenu(null); handleBulkDelete('both'); }}
                  disabled={count === 0}
                  style={{ ...headerCtxItemStyle, color: 'var(--error, #e74c3c)', opacity: count > 0 ? 1 : 0.35, cursor: count > 0 ? 'pointer' : 'default' }}
                >
                  <Trash2 size={14} style={{ marginRight: 8 }} />Delete selected for everyone
                </button>
              </>
            );
          })() : (
            <>
              {peer && (
                <button
                  onClick={() => { setHeaderMenu(null); openProfile(); }}
                  style={headerCtxItemStyle}
                >
                  <UserRound size={14} style={{ marginRight: 8 }} />View profile
                </button>
              )}
              <button
                onClick={() => { setHeaderMenu(null); enterSelectionModeEmpty(); }}
                style={headerCtxItemStyle}
                >
                <CheckSquare size={14} style={{ marginRight: 8 }} />Select messages
              </button>
              <button
                onClick={() => { setHeaderMenu(null); setShowThemeModal(true); }}
                style={headerCtxItemStyle}
              >
                <Palette size={14} style={{ marginRight: 8 }} />Customize Theme
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
              <button
                onClick={() => {
                  if (window.electronAPI) {
                    window.electronAPI.openChatWindow(activeChat.chatId);
                  } else {
                    window.open(`/popup/${activeChat.chatId}`, '_blank', 'width=900,height=680,noopener');
                  }
                  setHeaderMenu(null);
                }}
                style={headerCtxItemStyle}
              >
                <ExternalLink size={14} style={{ marginRight: 8 }} />Open in new window
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
              <button
                onClick={() => { togglePinChat(activeChat.chatId); setHeaderMenu(null); }}
                style={headerCtxItemStyle}
              >
                {pinnedChatIds.includes(activeChat.chatId)
                  ? <><PinOff size={14} style={{ marginRight: 8 }} />Unpin chat</>
                  : <><Pin size={14} style={{ marginRight: 8 }} />Pin chat</>}
              </button>
              <button
                onClick={() => {
                  const isLocked = lockedChatIds.includes(activeChat.chatId);
                  if (isLocked) {
                    // Unlock chat
                    toggleLockChat(activeChat.chatId, false);
                    setHeaderMenu(null);
                  } else {
                    // Lock chat - check if PIN is set
                    if (!currentUser?.chatLockPin) {
                      // No PIN set, prompt to set up
                      setPinModal({ mode: 'setup', chatId: activeChat.chatId });
                    } else {
                      // PIN already set, just lock it
                      toggleLockChat(activeChat.chatId, true);
                    }
                    setHeaderMenu(null);
                  }
                }}
                style={headerCtxItemStyle}
              >
                {lockedChatIds.includes(activeChat.chatId)
                  ? <><Unlock size={14} style={{ marginRight: 8 }} />Unlock chat</>
                  : <><Lock size={14} style={{ marginRight: 8 }} />Lock chat</>}
              </button>
              <button
                onClick={() => { toggleArchiveChat(activeChat.chatId); setHeaderMenu(null); navigate('/chats'); }}
                style={headerCtxItemStyle}
              >
                {archivedChatIds.includes(activeChat.chatId)
                  ? <><ArchiveRestore size={14} style={{ marginRight: 8 }} />Unarchive chat</>
                  : <><Archive size={14} style={{ marginRight: 8 }} />Archive chat</>}
              </button>
              <button
                onClick={() => { setActiveChat(null); setHeaderMenu(null); navigate('/chats'); }}
                style={headerCtxItemStyle}
              >
                <X size={14} style={{ marginRight: 8 }} />Close chat
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
              <button
                onClick={() => { setChatConfirmDelete('me'); setHeaderMenu(null); }}
                style={headerCtxItemStyle}
              >
                <Trash2 size={14} style={{ marginRight: 8 }} />Delete for me
              </button>
              <button
                onClick={() => { setChatConfirmDelete('both'); setHeaderMenu(null); }}
                style={{ ...headerCtxItemStyle, color: 'var(--error, #e74c3c)' }}
              >
                <Trash2 size={14} style={{ marginRight: 8 }} />Delete for everyone
              </button>
            </>
          )}
        </div>
      )}

      {/* Pinned messages bar */}
      {(activeChat.pinnedMessageIds ?? []).length > 0 && (() => {
        const pinnedIds = activeChat.pinnedMessageIds!;
        const pinnedMsgs = pinnedIds
          .map((id) => chatMessages.find((m) => m.messageId === id))
          .filter((m): m is Message => !!m && !m.deleted);
        if (pinnedMsgs.length === 0) return null;
        const safeIdx = pinnedIdx % pinnedMsgs.length;
        const current = pinnedMsgs[safeIdx];
        const handlePinnedClick = () => {
          handleScrollToMessage(current.messageId);
          setPinnedIdx((prev) => (prev + 1) % pinnedMsgs.length);
        };
        return (
          <div
            onClick={handlePinnedClick}
            style={{
              borderBottom: '1px solid var(--border)',
              backgroundColor: 'var(--bg-secondary)',
              userSelect: 'none',
              padding: '6px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
          >
            <Pin size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            {/* Vertical segment indicators between pin icon and message */}
            {pinnedMsgs.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0, height: 32, justifyContent: 'center' }}>
                {pinnedMsgs.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 3,
                      flex: 1,
                      borderRadius: 2,
                      backgroundColor: i === safeIdx ? 'var(--accent)' : 'var(--border)',
                      transition: 'background-color 0.2s',
                    }}
                  />
                ))}
              </div>
            )}
            <div style={{ flex: 1, overflow: 'hidden', borderLeft: pinnedMsgs.length <= 1 ? '3px solid var(--accent)' : 'none', paddingLeft: pinnedMsgs.length <= 1 ? 8 : 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
                {current.senderId === currentUser?.uid ? currentUser?.name : (userProfiles[current.senderId]?.name || current.senderName || 'Unknown')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {current.type !== 'text' && !current.content ? `[${current.type}]` : (current.content || `[${current.type}]`)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Search bar */}
      {searchOpen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--bg-secondary)',
            zIndex: 1,  
          }}
        >
          <Search size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.shiftKey ? handleSearchPrev() : handleSearchNext();
              if (e.key === 'Escape') handleSearchClose();
            }}
            placeholder="Search messages..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: 14,
              color: 'var(--text-primary)',
            }}
          />
          {searchQuery && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {searchMatchIndices.length === 0
                ? 'No results'
                : `${searchMatchIdx + 1} / ${searchMatchIndices.length}`}
            </span>
          )}
          <button onClick={handleSearchPrev} disabled={searchMatchIndices.length === 0} style={searchNavBtnStyle} title="Previous (Shift+Enter)">
            <ChevronUp size={16} />
          </button>
          <button onClick={handleSearchNext} disabled={searchMatchIndices.length === 0} style={searchNavBtnStyle} title="Next (Enter)">
            <ChevronDown size={16} />
          </button>
          <button onClick={handleSearchClose} style={searchNavBtnStyle} title="Close search">
            <X size={16} />
          </button>
        </div>
      )}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseDown={handleMsgMouseDown}
        onMouseMove={handleMsgMouseMove}
        onMouseUp={handleMsgMouseUp}
        onTouchStart={handleMsgTouchStart}
        onTouchMove={handleMsgTouchMove}
        onTouchEnd={handleMsgTouchEnd}
        onTouchCancel={handleMsgTouchEnd}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          userSelect: selectionMode ? 'none' : undefined,
          // position: 'relative',
          ...(displayTheme?.backgroundImage && {
            backgroundImage: `url(${displayTheme.backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed',
          }),
        }}
      >
        {/* Theme overlay wrapper - contains both overlay and content */}
        <div style={{ 
          position: 'relative', 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '12px 0',
        }}>
          {/* Backdrop overlay for opacity and blur */}
          {displayTheme && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: `rgba(15, 23, 42, ${1 - displayTheme.opacity})`,
                backdropFilter: displayTheme.blur > 0 ? `blur(${displayTheme.blur}px)` : undefined,
                WebkitBackdropFilter: displayTheme.blur > 0 ? `blur(${displayTheme.blur}px)` : undefined,
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
          )}
          {/* Messages content */}
          <div style={{ position: 'relative', zIndex: 1, flex: 1 }}>
        {/* Top loader shown while fetching older messages */}
        {isLoadingMore && (
          <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Loading older messages...
          </div>
        )}
        {/* "No more messages" indicator */}
        {!hasMore && chatMessages.length > 0 && (
          <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text-secondary)', fontSize: 12, opacity: 0.5 }}>
            — Beginning of conversation —
          </div>
        )}
        {chatMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>
            No messages yet. Say hello!
          </div>
        )}
        {(() => {
          // ── Build render items: collapse consecutive same-groupId messages into one group node ──
          type RenderItem =
            | { kind: 'single'; msg: Message; idx: number }
            | { kind: 'group'; msgs: Message[]; firstIdx: number; lastIdx: number };

          const getMsgCategory = (m: Message) => {
            if (m.type === 'image' || m.type === 'gif' || m.type === 'sticker') return 'image';
            if (m.type === 'video') return 'video';
            if (m.type === 'file' || m.type === 'pdf') return 'file'; // include pdf explicitly if tracked
            return m.type; // fallback
          };

          const renderItems: RenderItem[] = [];
          let i = 0;
          while (i < chatMessages.length) {
            const msg = chatMessages[i];
            
            if (msg.groupId && !msg.deleted) {
              const category = getMsgCategory(msg);
              const groupMsgs: Message[] = [msg];
              let j = i + 1;
              while (j < chatMessages.length && 
                     chatMessages[j].groupId === msg.groupId && 
                     !chatMessages[j].deleted &&
                     getMsgCategory(chatMessages[j]) === category) {
                groupMsgs.push(chatMessages[j]);
                j++;
              }
              
              if (groupMsgs.length > 1) {
                renderItems.push({ kind: 'group', msgs: groupMsgs, firstIdx: i, lastIdx: j - 1 });
                i = j;
                continue;
              }
            }
            
            renderItems.push({ kind: 'single', msg, idx: i });
            i++;
          }

          return renderItems.map((item) => {
            if (item.kind === 'group') {
              const { msgs, firstIdx } = item;
              const firstMsg = msgs[0];
              const lastMsg = msgs[msgs.length - 1];
              const isOwn = firstMsg.senderId === currentUser?.uid;
              const prevMsg = chatMessages[firstIdx - 1];
              const showDatePill =
                !prevMsg ||
                getDateKey(firstMsg.timestamp) !== getDateKey(prevMsg.timestamp);

              return (
                <MediaGroupBubble
                  key={`group_${firstMsg.messageId}`}
                  msgs={msgs}
                  firstMsg={firstMsg}
                  lastMsg={lastMsg}
                  isOwn={isOwn}
                  showDatePill={showDatePill}
                  onPreview={(msgs, idx) => setPreviewFile({ messages: msgs, initialIndex: idx })}
                  onDelete={selectionMode ? undefined : handleDeleteMessage}
                  onReply={selectionMode ? undefined : handleReply}
                  onForward={selectionMode ? undefined : handleForward}
                  onBookmark={selectionMode ? undefined : handleBookmarkMessage}
                  onPin={selectionMode ? undefined : handlePin}
                  onDownload={downloadMessageFile}
                  isPinned={(msgId) => (activeChat?.pinnedMessageIds ?? []).includes(msgId)}
                  bookmarkedIds={bookmarkedIds}
                  currentUser={currentUser}
                  onEnterSelect={selectionMode ? undefined : enterSelectionMode}
                  onMessageReaction={selectionMode ? undefined : handleReact}
                  selectionMode={selectionMode}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelectMessage}
                  highlightedMsgId={highlightedMsgId}
                  onMentionClick={handleMentionClick}
                />
              );
            }

            // ── Single message ──
            const { msg, idx } = item;
            const prevMsg = chatMessages[idx - 1];
            const showDatePill =
              !prevMsg ||
              getDateKey(msg.timestamp) !== getDateKey(prevMsg.timestamp);
            const isSearchMatch = searchMatchIndices.includes(idx);
            const isActiveMatch = searchMatchIndices[searchMatchIdx] === idx;
            return (
              <React.Fragment key={msg.messageId}>
                {showDatePill && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
                    <span style={{
                      backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                      fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
                      border: '1px solid var(--border)', letterSpacing: '0.03em', userSelect: 'none',
                    }}>
                      {formatDateLabel(msg.timestamp)}
                    </span>
                  </div>
                )}
                <div data-msg-idx={idx} data-msg-id={msg.messageId}
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  {/* Checkbox in selection mode */}
                  {selectionMode && (
                    <div
                      onClick={() => toggleSelectMessage(msg.messageId)}
                      style={{
                        flexShrink: 0, width: 36, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer', paddingLeft: 8,
                      }}
                    >
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: `2px solid ${selectedIds.has(msg.messageId) ? 'var(--accent)' : 'var(--border)'}`,
                        backgroundColor: selectedIds.has(msg.messageId) ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s', flexShrink: 0,
                      }}>
                        {selectedIds.has(msg.messageId) && (
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </div>
                  )}
                  <div
                    style={{ flex: 1, minWidth: 0 }}
                    onClick={selectionMode ? () => toggleSelectMessage(msg.messageId) : undefined}
                  >
                  <MessageBubble
                    message={msg}
                    isOwn={msg.senderId === currentUser?.uid}
                    isTouchDevice={isTouchDevice}
                    senderName={msg.senderId === currentUser?.uid ? currentUser?.name : userProfiles[msg.senderId]?.name}
                    senderAvatar={msg.senderId === currentUser?.uid ? currentUser?.avatar : userProfiles[msg.senderId]?.avatar}
                    showSender={activeChat?.type === 'group'}
                    onDelete={selectionMode ? undefined : handleDeleteMessage}
                    onPreview={(msg) => setPreviewFile({ messages: [msg], initialIndex: 0 })}
                    onDownload={downloadMessageFile}
                    onStartEdit={selectionMode ? undefined : (msg) => {
                      setEditingMsg(msg);
                      setReplyingTo(null);
                      setInputText(msg.content ?? '');
                      setTimeout(() => {
                        if (inputRef.current) {
                          inputRef.current.focus();
                          inputRef.current.style.height = 'auto';
                          inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
                          const len = inputRef.current.value.length;
                          inputRef.current.setSelectionRange(len, len);
                        }
                      }, 0);
                    }}
                    onCall={msg.type === 'call' ? handleStartCall : undefined}
                    onReply={selectionMode ? undefined : handleReply}
                    onForward={selectionMode ? undefined : handleForward}
                    onBookmark={selectionMode ? undefined : handleBookmarkMessage}
                    onPin={selectionMode ? undefined : handlePin}
                    isPinned={(activeChat?.pinnedMessageIds ?? []).includes(msg.messageId)}
                    onScrollToMessage={handleScrollToMessage}
                    onCloseChat={selectionMode ? undefined : (() => { setActiveChat(null); navigate('/chats'); })}
                    onEnterSelect={selectionMode ? undefined : enterSelectionMode}
                    searchQuery={isSearchMatch ? searchQuery : undefined}
                    isActiveSearchMatch={isActiveMatch}
                    isHighlighted={highlightedMsgId === msg.messageId}
                    currentUserShowMessageStatus={currentUser?.showMessageStatus !== false}
                    otherUserShowMessageStatus={(() => {
                      const otherUserId = msg.senderId === currentUser?.uid
                        ? activeChat?.members?.find(m => m !== currentUser?.uid)
                        : msg.senderId;
                      return otherUserId ? userProfiles[otherUserId]?.showMessageStatus !== false : true;
                    })()}
                    onMessageReaction={selectionMode ? undefined : handleReact}
                    currentUserId={currentUser?.uid}
                    getUserName={(uid: string) => uid === currentUser?.uid ? 'You' : (userProfiles[uid]?.name || 'Unknown')}
                    onMentionClick={handleMentionClick}
                    onContextMenuOpen={() => setOpenBubbleMenuId(msg.messageId)}
                    openBubbleMenuId={openBubbleMenuId}
                    onContextMenuClose={() => setOpenBubbleMenuId(null)}
                  />
                  </div>
                </div>
              </React.Fragment>
            );
          });
        })()}
        <TypingIndicator
          users={typingList.filter((u) => u.userId !== currentUser?.uid)}
          liveTexts={liveTexts}
        />
        <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* ─── Scroll navigation arrows ──────────────────────────────────── */}
      {/* ─── Scroll navigation arrows (only when user has scrolled up) ──── */}
      {showScrollBottom && (
        <div
          style={{
            position: 'absolute',
            right: 16,
            bottom: 120,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            zIndex: 10,
          }}
        >
          {showScrollTop && (
            <button
              onClick={() => { scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
              title="Scroll to top"
              style={scrollNavBtnStyle}
            >
              <ChevronUp size={18} />
            </button>
          )}
          <button
            onClick={() => { const el = scrollContainerRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }}
            title="Scroll to bottom"
            style={scrollNavBtnStyle}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      )}

      {/* ─── File Upload Preview Modal ────────────────────────────────────── */}
      {pendingUploadFiles.length > 0 && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            width: Math.min(520, window.innerWidth - 32),
            maxHeight: 'min(680px, 90vh)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Send {pendingUploadFiles.length > 1 ? `${pendingUploadFiles.length} Files` : 'File'}
              </span>
              <button
                onClick={() => { setPendingUploadFiles([]); setUploadCaption(''); setUploadAsSpoiler(false); }}
                style={{ ...iconBtnStyle, width: 32, height: 32 }}
                title="Cancel"
              >
                <X size={18} />
              </button>
            </div>

            {/* File Previews */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {pendingUploadFiles.every(f => f.type.startsWith('image/')) ? (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: pendingUploadFiles.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: 8,
                  marginBottom: 16,
                }}>
                  {pendingUploadFiles.map((file, idx) => {
                    const url = URL.createObjectURL(file);
                    const isMediaFile = file.type.startsWith('image/') || file.type.startsWith('video/');
                    const showSpoilerPreview = uploadAsSpoiler && isMediaFile;
                    
                    return (
                      <div key={idx} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: '1/1', backgroundColor: '#000' }}>
                        {showSpoilerPreview ? (
                          <ImageSpoiler
                            src={url}
                            alt={file.name}
                            style={{ width: '100%', height: '100%' }}
                            disableReveal={true}
                          />
                        ) : (
                          <img
                            src={url}
                            onLoad={e => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            alt={file.name}
                          />
                        )}
                        {pendingUploadFiles.length > 1 && (
                          <button
                            onClick={() => handleRemovePendingFile(idx)}
                            style={{
                              position: 'absolute', top: 6, right: 6,
                              width: 24, height: 24,
                              backgroundColor: 'rgba(0,0,0,0.6)', border: 'none',
                              borderRadius: '50%', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#fff',
                              zIndex: 10,
                            }}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {pendingUploadFiles.map((file, idx) => {
                    const isVideo = file.type.startsWith('video/');
                    const isAudio = file.type.startsWith('audio/');
                    const isImage = file.type.startsWith('image/');
                    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
                    const url = (isImage || isVideo) ? URL.createObjectURL(file) : null;
                    const isMediaFile = isImage || isVideo;
                    const showSpoilerPreview = uploadAsSpoiler && isMediaFile;
                    
                    return (
                      <div key={idx} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: 12, backgroundColor: 'var(--bg-tertiary)',
                        borderRadius: 12, border: '1px solid var(--border)'
                      }}>
                        <div style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: 'var(--bg-primary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                          {showSpoilerPreview && url ? (
                            <ImageSpoiler
                              src={url}
                              alt={file.name}
                              style={{ width: '100%', height: '100%' }}
                              disableReveal={true}
                            />
                          ) : isImage && url ? (
                            <img src={url} onLoad={() => URL.revokeObjectURL(url!)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={file.name} />
                          ) : isVideo && url ? (
                            showSpoilerPreview ? (
                              <ImageSpoiler
                                src={url}
                                alt={file.name}
                                style={{ width: '100%', height: '100%' }}
                                disableReveal={true}
                              />
                            ) : (
                              <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                            )
                          ) : isAudio ? (
                            <Mic size={24} color="#a78bfa" />
                          ) : (
                            <Paperclip size={24} color="var(--text-secondary)" />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {file.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                            {sizeMB} MB
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemovePendingFile(idx)}
                          style={{ ...iconBtnStyle, color: '#f87171', flexShrink: 0 }}
                          title="Remove"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', border: '2px dashed var(--border)',
                  borderRadius: 12, backgroundColor: 'transparent',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  width: '100%', justifyContent: 'center',
                  fontSize: 13, marginBottom: 4,
                  transition: 'border-color 0.2s, color 0.2s'
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
              >
                <Paperclip size={16} />
                Add more files
              </button>
            </div>

            {/* Caption + Send */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              {/* Spoiler toggle for images/videos */}
              {pendingUploadFiles.some(f => f.type.startsWith('image/') || f.type.startsWith('video/')) && (
                <div style={{ marginBottom: 16 }}>
                  <PremiumToggle
                    label="Mark as spoiler"
                    description="Hidden with blur effect"
                    checked={uploadAsSpoiler}
                    onChange={(val) => setUploadAsSpoiler(val)}
                    iconOn={<Eye size={12} color="var(--accent)" />}
                    iconOff={<EyeOff size={12} color="var(--text-secondary)" />}
                  />
                </div>
              )}
              
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  autoFocus
                  type="text"
                  value={uploadCaption}
                  onChange={e => setUploadCaption(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleConfirmUpload(); }}
                  placeholder="Add a caption..."
                  style={{
                    flex: 1, padding: '10px 16px',
                    borderRadius: 20, border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                    fontSize: 14, outline: 'none',
                  }}
                />
                <button
                  onClick={handleConfirmUpload}
                  disabled={pendingUploadFiles.length === 0}
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    backgroundColor: 'var(--accent)', border: 'none',
                    color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'transform 0.15s, opacity 0.15s',
                    opacity: pendingUploadFiles.length === 0 ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.08)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  title="Send"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Selection mode bar (count + cancel) ────────────────────────── */}
      {selectionMode && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 14px',
          borderTop: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          zIndex: 1,
        }}>
          <button onClick={exitSelectionMode} style={{ ...selActionBtnStyle, gap: 6, paddingLeft: 0 }}>
            <X size={16} />
            <span style={{ fontSize: 13 }}>Cancel</span>
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {selectedIds.size === 0 ? 'Select messages' : `${selectedIds.size} selected`}
          </span>
        </div>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div
          style={{
            padding: '8px 20px',
            backgroundColor: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 1,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 4,
              backgroundColor: 'var(--border)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${uploadProgress}%`,
                backgroundColor: 'var(--accent)',
                transition: 'width 0.2s',
              }}
            />
          </div>
          <span>{uploadProgress}%</span>
        </div>
      )}

      {/* Edit message bar */}
      {editingMsg && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--bg-tertiary)',
            zIndex: 1,
          }}
        >
          <Pencil size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>Edit message</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {editingMsg.content}
            </div>
          </div>
          <button
            onClick={() => { setEditingMsg(null); setInputText(''); }}
            style={{ ...iconBtnStyle, width: 24, height: 24, flexShrink: 0 }}
            title="Cancel edit (Esc)"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Reply preview bar */}
      {replyingTo && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--bg-tertiary)',
            zIndex: 1,
          }}
        >
          <CornerUpLeft size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
              Replying to {replyingTo.senderName || 'message'}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {replyingTo.type !== 'text' && !replyingTo.content
                ? `[${replyingTo.type}]`
                : replyingTo.content || `[${replyingTo.type}]`}
            </div>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            style={{ ...iconBtnStyle, width: 24, height: 24, flexShrink: 0 }}
            title="Cancel reply"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* AI Suggestions Pills */}
      {aiSuggestions.length > 0 && !isGeneratingAiSuggestion && !isRecording && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '12px 16px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'rgba(var(--accent-rgb), 0.03)',
            zIndex: 1,
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              AI Suggested Replies
            </span>
            <div style={{ flex: 1 }} />
            <button 
              onClick={() => setAiSuggestions([])}
              style={{ ...iconBtnStyle, width: 28, height: 28, opacity: 0.8 }}
              title="Dismiss AI suggestions"
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: 8,
            maxHeight: 120,
            overflowY: 'auto'
          }}>
            {aiSuggestions.map((suggestion, idx) => (
              <div
                key={idx}
                className="ai-suggestion-pill"
                title={suggestion}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 18,
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  maxWidth: 'fit-content',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s',
                }}
              >
                <span style={{ 
                  fontSize: 13, 
                  color: 'var(--text-primary)',
                  maxWidth: 250,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {suggestion}
                </span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      setInputText(suggestion);
                      setAiSuggestions([]);
                      setTimeout(() => {
                        if (inputRef.current) {
                          inputRef.current.focus();
                          inputRef.current.style.height = 'auto';
                          inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
                        }
                      }, 0);
                    }}
                    style={{ ...iconBtnStyle, width: 26, height: 26, backgroundColor: 'var(--bg-tertiary)' }}
                    title="Edit suggestion"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => {
                      handleSend(suggestion);
                    }}
                    style={{ 
                      ...iconBtnStyle, 
                      width: 26, height: 26, 
                      backgroundColor: 'var(--accent)', 
                      color: '#fff' 
                    }}
                    title="Send instantly"
                  >
                    <Send size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          padding: (isRecording || isPreviewingRecording) ? '12px 16px' : '12px 16px',
          borderTop: (replyingTo || editingMsg) ? 'none' : '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.txt"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          style={{ ...iconBtnStyle, flexShrink: 0 }}
          title="Attach file"
        >
          <Paperclip size={20} />
        </button>
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'flex-end', minWidth: 0 }}>
          {/* Recording UI / Preview UI / Text Input */}
          {isRecording ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 20,
              height: 40,
              color: '#f87171',
              minWidth: 0
            }}>
              <StopCircle size={18} className="recording-blink" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 13, fontWeight: 600, minWidth: 40, flexShrink: 0 }}>
                {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
              </div>

              {recordingMode === 'voice' && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: 24, overflow: 'hidden' }}>
                  {waveformHistory.map((val, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        // Add a base height of 2px for silence, scale up to 24px for loud
                        height: `${Math.max(2, val * 24)}px`,
                        backgroundColor: 'var(--accent)',
                        borderRadius: 2,
                        transition: 'height 0.05s ease'
                      }}
                    />
                  ))}
                </div>
              )}

              {recordingMode === 'video' && (
                 <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Recording video note...
                 </div>
              )}

              {recordingMode === 'video' && (
                <button
                  onClick={flipCamera}
                  style={{ ...iconBtnStyle, color: 'var(--text-secondary)', flexShrink: 0 }}
                  title="Flip Camera"
                >
                  <RefreshCw size={18} />
                </button>
              )}

              <button
                onClick={cancelRecording}
                style={{ ...iconBtnStyle, color: 'var(--text-secondary)', flexShrink: 0 }}
                title="Cancel"
              >
                <X size={18} />
              </button>
            </div>
          ) : isPreviewingRecording && recordedMediaUrl ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 20,
              height: 40,
              animation: 'fadeIn 0.2s ease-out',
              minWidth: 0
            }}>
              <button
                onClick={togglePreviewPlayback}
                style={{ ...iconBtnStyle, color: 'var(--accent)', padding: 0, flexShrink: 0 }}
                title={isPreviewPlaying ? "Pause" : "Play"}
              >
                {isPreviewPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              
              {recordedMode === 'voice' && (
                <audio
                  ref={el => {
                    previewMediaRef.current = el;
                  }}
                  src={recordedMediaUrl}
                  onEnded={() => setIsPreviewPlaying(false)}
                  onPause={() => setIsPreviewPlaying(false)}
                  onPlay={() => setIsPreviewPlaying(true)}
                  style={{ display: 'none' }}
                />
              )}

              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1, minWidth: 40 }}>
                {recordedMode === 'video' ? 'Video Note' : 'Voice Note'} • {Math.floor(recordingDurationSecondsRef.current / 60)}:{String(recordingDurationSecondsRef.current % 60).padStart(2, '0')}
              </div>
              
              {recordedMode === 'voice' && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: 16, overflow: 'hidden', padding: '0 8px' }}>
                  {recordedWaveform.map((val, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: `${Math.max(2, val * 16)}px`,
                        backgroundColor: 'var(--accent)',
                        borderRadius: 1,
                        opacity: 0.6
                      }}
                    />
                  ))}
                </div>
              )}
              
              <div style={recordedMode === 'video' ? { flex: 1 } : {}} />

              <button
                onClick={handleDiscardRecording}
                style={{ ...iconBtnStyle, color: '#f87171', flexShrink: 0 }}
                title="Discard"
              >
                <Trash2 size={18} />
              </button>
              <button
                onClick={handleConfirmSend}
                style={{ ...iconBtnStyle, color: '#22c55e', flexShrink: 0 }}
                title="Send"
              >
                <Send size={18} />
              </button>
            </div>
          ) : (
            <>
              {emojiSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 10px)',
                  left: 0,
                  width: 220,
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  zIndex: 100,
                  overflow: 'hidden',
                  padding: '4px'
                }}>
                  {emojiSuggestions.map((emoji, idx) => (
                    <div
                      key={emoji.id}
                      onClick={() => {
                        const cursor = inputRef.current?.selectionStart || 0;
                        const textBefore = inputText.slice(0, cursor);
                        const textAfter = inputText.slice(cursor);
                        const newTextBefore = textBefore.replace(/:[a-zA-Z0-9_]{1,}$/, emoji.native);
                        setInputText(newTextBefore + textAfter);
                        setEmojiSuggestions([]);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      onMouseEnter={() => setSuggestionIndex(idx)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        borderRadius: 8,
                        backgroundColor: idx === suggestionIndex ? 'var(--accent)' : 'transparent',
                        color: idx === suggestionIndex ? '#fff' : 'var(--text-primary)',
                        transition: 'all 0.1s'
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{emoji.native}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, opacity: idx === suggestionIndex ? 1 : 0.7 }}>:{emoji.id}:</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Text Formatting Toolbar — hidden on touch devices (use context menu instead) */}
              {showFormatToolbar && !isTouchDevice && (
                <div
                  style={{
                    position: 'fixed',
                    top: formatToolbarPos.top,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1000,
                    maxWidth: 'calc(100vw - 32px)',
                    animation: 'fadeIn 0.15s ease-out',
                  }}
                  onMouseDown={(e) => e.preventDefault()} // Prevent blur on click
                >
                  <div style={{ position: 'relative' }}>
                    {/* Left gradient fade indicator */}
                    {toolbarScrollState.canScrollLeft && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: 40,
                          background: 'linear-gradient(to right, var(--bg-secondary) 0%, transparent 100%)',
                          zIndex: 2,
                          pointerEvents: 'none',
                          borderRadius: '8px 0 0 8px',
                        }}
                      />
                    )}
                    
                    {/* Right gradient fade indicator */}
                    {toolbarScrollState.canScrollRight && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: 40,
                          background: 'linear-gradient(to left, var(--bg-secondary) 0%, transparent 100%)',
                          zIndex: 2,
                          pointerEvents: 'none',
                          borderRadius: '0 8px 8px 0',
                        }}
                      />
                    )}
                    
                    <div
                      ref={toolbarScrollRef}
                      className="formatting-toolbar-scroll"
                      onScroll={(e) => {
                        const target = e.currentTarget;
                        const canScrollLeft = target.scrollLeft > 0;
                        const canScrollRight = target.scrollLeft < (target.scrollWidth - target.clientWidth - 1);
                        setToolbarScrollState({ canScrollLeft, canScrollRight });
                      }}
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        display: 'flex',
                        gap: 4,
                        padding: 4,
                        overflowX: 'auto',
                        overflowY: 'hidden',
                        // Hide scrollbar but keep functionality
                        scrollbarWidth: 'none', // Firefox
                        msOverflowStyle: 'none', // IE/Edge
                      }}
                    >
                      <button
                        onClick={() => applyFormatting('bold')}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'background-color 0.1s',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        title="Bold (Ctrl+B)"
                      >
                        <span style={{ fontWeight: 'bold' }}>B</span>
                      </button>
                      
                      <button
                        onClick={() => applyFormatting('italic')}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontStyle: 'italic',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'background-color 0.1s',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        title="Italic (Ctrl+I)"
                      >
                        <span style={{ fontStyle: 'italic' }}>I</span>
                      </button>
                      
                      <button
                        onClick={() => applyFormatting('strikethrough')}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'background-color 0.1s',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        title="Strikethrough (Ctrl+Shift+X)"
                      >
                        <span style={{ textDecoration: 'line-through' }}>S</span>
                      </button>
                      
                      <button
                        onClick={() => applyFormatting('underline')}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'background-color 0.1s',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        title="Underline (Ctrl+U)"
                      >
                        <span style={{ textDecoration: 'underline' }}>U</span>
                      </button>
                      
                      <button
                        onClick={() => applyFormatting('spoiler')}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'background-color 0.1s',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        title="Spoiler (Ctrl+Shift+P)"
                      >
                        <span style={{ filter: 'blur(4px)' }}>SP</span>
                      </button>
                      
                      <button
                        onClick={() => applyFormatting('code')}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 13,
                          fontFamily: 'monospace',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'background-color 0.1s',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        title="Inline Code (Ctrl+Shift+I)"
                      >
                        <span style={{ fontFamily: 'monospace' }}>&lt;/&gt;</span>
                      </button>
                      
                      <div style={{ width: 1, backgroundColor: 'var(--border)', margin: '4px 0', flexShrink: 0 }} />
                      
                      <button
                        onClick={() => applyFormatting('numberedList')}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'background-color 0.1s',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        title="Numbered List (Ctrl+Shift+7)"
                      >
                        <span>1.</span>
                      </button>
                      
                      <button
                        onClick={() => applyFormatting('bulletList')}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'background-color 0.1s',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        title="Bullet List (Ctrl+Shift+8)"
                      >
                        <span>•</span>
                      </button>
                      
                      <button
                        onClick={() => applyFormatting('quote')}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'background-color 0.1s',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        title="Quote (Ctrl+Shift+.)"
                      >
                        <span>"</span>
                      </button>
                      
                      <div style={{ width: 1, backgroundColor: 'var(--border)', margin: '4px 0', flexShrink: 0 }} />
                      
                      <button
                        onClick={() => applyFormatting('url')}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'background-color 0.1s',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        title="Insert Link (Ctrl+K)"
                      >
                        <span>🔗</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  handleFormattingShortcut(e);
                  handleKeyDown(e);
                }}
                onSelect={handleTextSelection}
                onBlur={() => {
                  // Delay hiding toolbar to allow clicking on buttons
                  setTimeout(() => setShowFormatToolbar(false), 200);
                }}
                onPaste={handlePaste}
                onContextMenu={handleMobileContextMenu}

                placeholder="Write a message..."
                rows={1}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 20,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  outline: 'none',
                  resize: 'none',
                  minHeight: 42,
                  maxHeight: 230,
                  overflowY: 'auto',
                  lineHeight: 1.5,
                  fontFamily: 'inherit',
                  display: 'block',
                  boxSizing: 'border-box',
                }}
              />
              {/* Context menu: copy / cut / paste / select all + formatters */}
              {mobileCtxMenu && (() => {
                const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                const mod = isMac ? '⌘' : 'Ctrl+';
                const sh = isMac ? '⇧' : 'Shift+';
                const hasSelection = !!(textSelection && textSelection.start !== textSelection.end);

                const clipboardItems = [
                  { label: 'Copy',       icon: <Copy size={14} />,          action: mobileCtxCopy,      shortcut: `${mod}C` },
                  { label: 'Cut',        icon: <Scissors size={14} />,      action: mobileCtxCut,       shortcut: `${mod}X` },
                  { label: 'Paste',      icon: <ClipboardPaste size={14} />,action: mobileCtxPaste,     shortcut: `${mod}V` },
                  { label: 'Select All', icon: <CheckSquare size={14} />,   action: mobileCtxSelectAll, shortcut: `${mod}A` },
                ];

                const fmtItems: { icon: React.ReactNode; label: string; syntax: string; shortcut: string; type: Parameters<typeof applyFormatting>[0] }[] = [
                  { icon: <Bold size={14} />,         label: 'Bold',          syntax: '*asterisks*',               shortcut: `${mod}B`,      type: 'bold' },
                  { icon: <Italic size={14} />,       label: 'Italic',        syntax: '_underscores_',             shortcut: `${mod}I`,      type: 'italic' },
                  { icon: <Underline size={14} />,    label: 'Underline',     syntax: '__double underscores__',    shortcut: `${mod}U`,      type: 'underline' },
                  { icon: <Strikethrough size={14} />,label: 'Strikethrough', syntax: '~tildes~',                  shortcut: `${mod}${sh}X`, type: 'strikethrough' },
                  { icon: <Code size={14} />,         label: 'Inline Code',   syntax: '`backtick` or ```block```', shortcut: `${mod}${sh}I`, type: 'code' },
                  { icon: <EyeOff size={14} />,       label: 'Spoiler',       syntax: '||spoiler text||',          shortcut: `${mod}${sh}P`, type: 'spoiler' },
                  { icon: <ListOrdered size={14} />,  label: 'Numbered List', syntax: '1. text, 2. text…',         shortcut: `${mod}${sh}7`, type: 'numberedList' },
                  { icon: <List size={14} />,         label: 'Bullet List',   syntax: '• text',                    shortcut: `${mod}${sh}8`, type: 'bulletList' },
                  { icon: <Quote size={14} />,        label: 'Quote',         syntax: '> prefix line',             shortcut: `${mod}${sh}.`, type: 'quote' },
                  { icon: <Link size={14} />,         label: 'Link',          syntax: '[text](url)',               shortcut: `${mod}K`,      type: 'url' },
                ];

                const MARGIN = 8;
                const menuW = 268;
                const navEl = document.querySelector('.nav-sidebar') as HTMLElement | null;
                const navBarH = navEl ? navEl.offsetHeight : (window.innerWidth <= 480 ? 52 : window.innerWidth <= 768 ? 56 : 0);
                const maxMenuH = Math.min(360, window.innerHeight - navBarH - MARGIN * 2);

                return (
                  <>
                    <div onClick={closeMobileCtxMenu} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
                    <div
                      ref={mobileCtxMenuRef}
                      style={{
                        position: 'fixed',
                        top: mobileCtxMenuPos ? mobileCtxMenuPos.top : mobileCtxMenu.y,
                        left: mobileCtxMenuPos ? mobileCtxMenuPos.left : mobileCtxMenu.x,
                        visibility: mobileCtxMenuPos ? 'visible' : 'hidden',
                        zIndex: 9999,
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
                        width: menuW,
                        maxHeight: maxMenuH,
                        display: 'flex',
                        flexDirection: 'column',
                        animation: mobileCtxMenuPos ? 'slideUp 0.18s cubic-bezier(0.4,0,0.2,1) both' : 'none',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Clipboard section — fixed, never scrolls away */}
                      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', userSelect: 'none' } as React.CSSProperties}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {clipboardItems.map(({ label, icon, action, shortcut }, i) => (
                          <button key={label} onPointerDown={(e) => { e.preventDefault(); action(); }}
                            style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '9px 14px', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', gap: 10, textAlign: 'left', borderBottom: i < clipboardItems.length - 1 ? '1px solid var(--border)' : 'none' }}
                          >
                            <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexShrink: 0 }}>{icon}</span>
                            <span style={{ flex: 1 }}>{label}</span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: 11, flexShrink: 0 }}>{shortcut}</span>
                          </button>
                        ))}
                      </div>

                      {/* Formatting section — scrollable */}
                      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflow: 'hidden' }}>
                        {/* Sticky section header */}
                        <div style={{ flexShrink: 0, padding: '5px 14px 3px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                          Formatting {!hasSelection && <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.7 }}>(select text first)</span>}
                        </div>
                        {/* Scrollable formatter rows */}
                        <div
                          style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch', userSelect: 'none', touchAction: 'pan-y' } as React.CSSProperties}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          {fmtItems.map(({ icon, label, syntax, shortcut, type }, i) => {
                            let startY = 0;
                            return (
                              <button key={type}
                                onPointerDown={(e) => { e.preventDefault(); startY = e.clientY; }}
                                onPointerUp={(e) => {
                                  if (Math.abs(e.clientY - startY) > 6) return; // was a scroll, not a tap
                                  if (!hasSelection) return;
                                  applyFormatting(type);
                                  closeMobileCtxMenu();
                                }}
                                style={{
                                  display: 'flex', alignItems: 'flex-start', width: '100%',
                                  padding: '8px 14px', background: 'none', border: 'none',
                                  borderBottom: i < fmtItems.length - 1 ? '1px solid var(--border)' : 'none',
                                  color: 'var(--text-primary)', fontSize: 13, cursor: hasSelection ? 'pointer' : 'default',
                                  gap: 10, textAlign: 'left', opacity: hasSelection ? 1 : 0.4,
                                }}
                              >
                                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0, paddingTop: 1 }}>{icon}</span>
                                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                                  <span>{label}</span>
                                  <span style={{ color: 'var(--text-secondary)', fontSize: 10, fontFamily: 'monospace', opacity: 0.8 }}>{syntax}</span>
                                </span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: 10, flexShrink: 0, marginLeft: 4, paddingTop: 2, whiteSpace: 'nowrap' }}>{shortcut}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {/* Recording Preview Overlay (Video Circle) */}
          {isPreviewingRecording && recordedMode === 'video' && recordedMediaUrl && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 40px)',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 180,
              height: 180,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '4px solid var(--accent)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 1001,
              backgroundColor: '#000',
              animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}>
              <video
                ref={el => {
                  if (recordedMode === 'video') previewMediaRef.current = el;
                }}
                src={recordedMediaUrl}
                autoPlay
                loop
                muted={false}
                onEnded={() => setIsPreviewPlaying(false)}
                onPause={() => setIsPreviewPlaying(false)}
                onPlay={() => setIsPreviewPlaying(true)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            </div>
          )}

          {/* Video Note Circle Preview Overlay */}
          {isRecording && recordingMode === 'video' && stream && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 60px)',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 200,
              height: 200,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '4px solid var(--accent)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 1001,
              backgroundColor: '#000'
            }}>
              <video
                autoPlay
                muted
                ref={(el) => { if (el) el.srcObject = stream }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
                }}
              />
            </div>
          )}
        </div>

        {/* Unified Action Button */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {showHoldToast && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              marginBottom: '10px',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              border: '1px solid var(--border)',
              zIndex: 100,
              animation: 'fadeIn 0.2s ease'
            }}>
              Hold for a second to start recording
            </div>
          )}

          {/* Mention toast */}
          {mentionToast && (
            <div style={{
              position: 'fixed',
              bottom: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              padding: '8px 18px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              border: '1px solid var(--border)',
              zIndex: 9999,
              whiteSpace: 'nowrap',
              animation: 'fadeIn 0.2s ease',
            }}>
              {mentionToast}
            </div>
          )}

          {!isPreviewingRecording && (
             <button
               onClick={handleActionClick}
               onMouseDown={handleActionMouseDown}
               onMouseUp={handleActionMouseUp}
               onMouseLeave={handleActionMouseUp}
               onTouchStart={handleActionMouseDown}
               onTouchEnd={handleActionMouseUp}
               style={{
                 backgroundColor: (inputText.trim() || isRecording) ? 'var(--accent)' : 'transparent',
                 color: (inputText.trim() || isRecording) ? '#fff' : 'var(--text-secondary)',
                 border: 'none',
                 borderRadius: '50%',
                 width: 40,
                 height: 40,
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 cursor: 'pointer',
                 transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                 transform: isRecording ? 'scale(1.1)' : 'scale(1)'
               }}
               title={inputText.trim() ? "Send" : (isRecording ? "Stop Recording" : (recordingMode === 'voice' ? 'Hold to Record Voice / Click to Toggle' : 'Hold to Record Video / Click to Toggle'))}
             >
               {inputText.trim() ? <Send size={18} /> : (isRecording ? <StopCircle size={22} /> : (recordingMode === 'voice' ? <Mic size={22} /> : <Video size={22} />))}
             </button>
          )}

          {/* Media Picker Button (Emojis, Stickers, GIFs) */}
          {!isRecording && !isPreviewingRecording && (
            <button
              onClick={() => setShowMediaPicker(!showMediaPicker)}
              style={{ ...iconBtnStyle, color: showMediaPicker ? 'var(--accent)' : 'var(--text-secondary)' }}
              title="Emojis, Stickers & GIFs"
            >
              <Smile size={22} />
            </button>
          )}

          {showMediaPicker && (
            <div
              ref={mediaPickerRef}
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 12px)',
                right: -10,
                width: 350,
                height: 450,
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                zIndex: 1000,
              }}
            >
              {/* Tab Content */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {activeMediaTab === 'emoji' && (
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <Picker
                      data={data}
                      onEmojiSelect={handleEmojiSelect}
                      theme="dark"
                      set="native"
                      previewPosition="none"
                      width="100%"
                      height="100%"
                      skinTonePosition="none"
                    />
                  </div>
                )}

                {activeMediaTab === 'sticker' && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search Stickers..."
                          value={stickerSearch}
                          onChange={(e) => handleStickerSearch(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 12px 8px 32px',
                            borderRadius: 20,
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--bg-tertiary)',
                            color: 'var(--text-primary)',
                            fontSize: 13,
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {isStickerLoading ? (
                        <div style={{ gridColumn: 'span 3', textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>Loading stickers...</div>
                      ) : (
                        <>
                          {stickers.map((sticker) => (
                            <img
                              key={sticker.id}
                              src={sticker.preview}
                              onClick={() => handleSendSticker(sticker.url)}
                              style={{ width: '100%', borderRadius: 8, cursor: 'pointer', transition: 'transform 0.1s' }}
                              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                            />
                          ))}
                          {!stickers.length && !isStickerLoading && (
                            <div style={{ gridColumn: 'span 3', textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>No stickers found</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {activeMediaTab === 'gif' && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {giphyError ? (
                      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                        <ImageIcon size={40} style={{ color: 'var(--text-secondary)', marginBottom: 8 }} />
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--error, #e74c3c)' }}>Invalid API Key</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          The current Giphy API key is unauthorized. Please provide a new one.
                        </div>
                        <div style={{ width: '100%', marginTop: 8 }}>
                          <input
                            type="text"
                            placeholder="Paste your Giphy API Key"
                            value={giphyKeyInput}
                            onChange={(e) => setGiphyKeyInput(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: '1px solid var(--border)',
                              backgroundColor: 'var(--bg-tertiary)',
                              color: 'var(--text-primary)',
                              fontSize: 13,
                              outline: 'none',
                              marginBottom: 10
                            }}
                          />
                          <button
                            onClick={handleSaveGiphyKey}
                            style={{
                              width: '100%',
                              padding: '10px',
                              borderRadius: 8,
                              backgroundColor: 'var(--accent)',
                              color: '#fff',
                              border: 'none',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Save & Try Again
                          </button>
                        </div>
                        <a
                          href="https://developers.giphy.com/dashboard/"
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
                        >
                          Get a free API key here
                        </a>
                      </div>
                    ) : (
                      <>
                        <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search GIFs..."
                              value={gifSearch}
                              onChange={(e) => handleGifSearch(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px 12px 8px 32px',
                                borderRadius: 20,
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                fontSize: 13,
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                            <button
                              onClick={() => setGiphyError(true)}
                              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                              title="GIF API Settings"
                            >
                              <MoreVertical size={14} />
                            </button>
                          </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                          {gifs.map((gif) => (
                            <img
                              key={gif.id}
                              src={gif.preview}
                              onClick={() => handleSendGif(gif.url)}
                              style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', transition: 'transform 0.1s' }}
                              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
                              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                            />
                          ))}
                          {!gifs.length && gifSearch && (
                            <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>No GIFs found</div>
                          )}
                          {!gifSearch && (
                            <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>Search for GIFs</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

              </div>

              {/* Tabs Footer */}
              <div style={{
                display: 'flex',
                height: 44,
                borderTop: '1px solid var(--border)',
                backgroundColor: 'var(--bg-tertiary)',
                padding: '0 4px'
              }}>
                <button
                  onClick={() => setActiveMediaTab('emoji')}
                  style={{
                    flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                    color: activeMediaTab === 'emoji' ? 'var(--accent)' : 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderBottom: activeMediaTab === 'emoji' ? '2px solid var(--accent)' : 'none'
                  }}
                >
                  <Smile size={20} />
                </button>
                <button
                  onClick={() => setActiveMediaTab('sticker')}
                  style={{
                    flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                    color: activeMediaTab === 'sticker' ? 'var(--accent)' : 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderBottom: activeMediaTab === 'sticker' ? '2px solid var(--accent)' : 'none'
                  }}
                >
                  <Sticker size={20} />
                </button>
                <button
                  onClick={() => setActiveMediaTab('gif')}
                  style={{
                    flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                    color: activeMediaTab === 'gif' ? 'var(--accent)' : 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderBottom: activeMediaTab === 'gif' ? '2px solid var(--accent)' : 'none'
                  }}
                >
                  <ImageIcon size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>


      {/* ── Profile panel (Telegram-style right drawer) ─────────────── */}
      {showProfile && peer && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 320,
            backgroundColor: 'var(--bg-secondary)',
            borderLeft: '1px solid var(--border)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
            animation: profileClosing
              ? 'profilePanelOut 0.26s cubic-bezier(0.4,0,0.2,1) forwards'
              : 'profilePanelIn 0.28s cubic-bezier(0.4,0,0.2,1) both',
          }}
        >
          {/* Close button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>Profile</span>
            <button
              onClick={() => closeProfile()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6 }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Avatar + name */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 24px 24px', gap: 12 }}>
            <UserAvatar
              name={peer.profile?.name || 'User'}
              avatar={peer.profile?.avatar}
              size={90}
              online={peer.online}
            />
            <div style={{ textAlign: 'center' }}>
              {/* Nickname inline edit (only for non-self private chats) */}
              {!peer.isSelf && editingNickname ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 4 }}>
                  <input
                    autoFocus
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setNickname(peer.uid, nicknameInput);
                        setEditingNickname(false);
                      } else if (e.key === 'Escape') {
                        setEditingNickname(false);
                      }
                    }}
                    placeholder={peer.profile?.name || 'Nickname'}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--accent)',
                      borderRadius: 6,
                      color: 'var(--text-primary)',
                      fontSize: 16,
                      fontWeight: 700,
                      padding: '3px 8px',
                      outline: 'none',
                      width: 160,
                      textAlign: 'center',
                    }}
                  />
                  <button
                    onClick={() => { setNickname(peer.uid, nicknameInput); setEditingNickname(false); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 2, display: 'flex', alignItems: 'center' }}
                    title="Save"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button
                    onClick={() => setEditingNickname(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 2, display: 'flex', alignItems: 'center' }}
                    title="Cancel"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ) : (
                <div
                  style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <span>
                    {peer.isDeleted
                      ? (nicknames[peer.uid] || peer.profile?.name || 'Deleted User')
                      : peer.isSelf
                        ? (peer.profile?.name || currentUser?.name || 'You')
                        : (nicknames[peer.uid] || peer.profile?.name || 'User')}
                  </span>
                  {peer.isSelf && !peer.isDeleted && <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--accent)', marginLeft: 6 }}>(You)</span>}
                  {peer.isDeleted && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>(Deleted User)</span>}
                  {!peer.isSelf && !peer.isDeleted && (
                    <button
                      onClick={() => { setNicknameInput(nicknames[peer.uid] || ''); setEditingNickname(true); }}
                      title="Edit nickname"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 2, display: 'flex', alignItems: 'center', opacity: 0.6 }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  )}
                  {!peer.isSelf && !peer.isDeleted && nicknames[peer.uid] && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>({peer.profile?.name})</span>
                  )}
                </div>
              )}
              <div style={{ fontSize: 13, color: peer.online ? '#22c55e' : 'var(--text-secondary)', fontWeight: 500 }}>
                {peer.isDeleted
                  ? 'Account deleted'
                  : peer.isSelf
                    ? 'Your saved messages'
                    : peer.online
                      ? '● Online'
                      : peer.profile?.lastSeen ? formatLastSeen(peer.profile.lastSeen) : 'Offline'}
              </div>
            </div>
          </div>



          {/* Actions */}
          {!peer.isSelf && (
            <div style={{ margin: '0 16px 16px', position: 'relative' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {/* Message */}
                <button
                  onClick={() => closeProfile()}
                  title="Message"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--accent)', fontSize: 11, fontWeight: 500 }}
                >
                  <MessageCircle size={20} />
                  <span>Message</span>
                </button>
                {/* Voice call / Continue */}
                {isPeerInExternalCall ? (
                  <button
                    onClick={() => { closeProfile(); continueCall(); }}
                    title="Continue call on this device"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 10, cursor: 'pointer', color: '#22c55e', fontSize: 11, fontWeight: 500, gridColumn: 'span 2' }}
                  >
                    <RefreshCw size={20} style={{ animation: 'spin 4s linear infinite' }} />
                    <span>Continue Call</span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { if (!isInCall) { closeProfile(); handleStartCall('voice'); } }}
                      title={isInCall ? 'Already in a call' : 'Voice call'}
                      disabled={isInCall}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, cursor: isInCall ? 'not-allowed' : 'pointer', color: isInCall ? 'var(--text-secondary)' : 'var(--accent)', fontSize: 11, fontWeight: 500, opacity: isInCall ? 0.45 : 1 }}
                    >
                      <Phone size={20} />
                      <span>Call</span>
                    </button>
                    <button
                      onClick={() => { if (!isInCall) { closeProfile(); handleStartCall('video'); } }}
                      title={isInCall ? 'Already in a call' : 'Video call'}
                      disabled={isInCall}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, cursor: isInCall ? 'not-allowed' : 'pointer', color: isInCall ? 'var(--text-secondary)' : 'var(--accent)', fontSize: 11, fontWeight: 500, opacity: isInCall ? 0.45 : 1 }}
                    >
                      <Video size={20} />
                      <span>Video</span>
                    </button>
                  </>
                )}
                {/* More */}
                <button
                  onClick={() => setShowProfileMore((v) => !v)}
                  title="More options"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: showProfileMore ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 11, fontWeight: 500 }}
                >
                  <MoreVertical size={20} />
                  <span>More</span>
                </button>
              </div>

              {/* More dropdown */}
              {showProfileMore && (
                <div
                  style={{ position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, zIndex: 100, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', overflow: 'hidden', minWidth: 190 }}
                >
                  {activeChat && (
                    <>
                      <button
                        onClick={() => { togglePinChat(activeChat.chatId); setShowProfileMore(false); }}
                        style={headerCtxItemStyle}
                      >
                        {pinnedChatIds.includes(activeChat.chatId)
                          ? <><PinOff size={14} style={{ marginRight: 8 }} />Unpin chat</>
                          : <><Pin size={14} style={{ marginRight: 8 }} />Pin chat</>}
                      </button>
                      <button
                        onClick={() => {
                          const isLocked = lockedChatIds.includes(activeChat.chatId);
                          if (isLocked) {
                            // Unlock chat
                            toggleLockChat(activeChat.chatId, false);
                            setShowProfileMore(false);
                          } else {
                            // Lock chat - check if PIN is set
                            if (!currentUser?.chatLockPin) {
                              // No PIN set, prompt to set up
                              setPinModal({ mode: 'setup', chatId: activeChat.chatId });
                            } else {
                              // PIN already set, just lock it
                              toggleLockChat(activeChat.chatId, true);
                            }
                            setShowProfileMore(false);
                          }
                        }}
                        style={headerCtxItemStyle}
                      >
                        {lockedChatIds.includes(activeChat.chatId)
                          ? <><Unlock size={14} style={{ marginRight: 8 }} />Unlock chat</>
                          : <><Lock size={14} style={{ marginRight: 8 }} />Lock chat</>}
                      </button>
                      <button
                        onClick={() => { toggleArchiveChat(activeChat.chatId); setShowProfileMore(false); navigate('/chats'); }}
                        style={headerCtxItemStyle}
                      >
                        {archivedChatIds.includes(activeChat.chatId)
                          ? <><ArchiveRestore size={14} style={{ marginRight: 8 }} />Unarchive chat</>
                          : <><Archive size={14} style={{ marginRight: 8 }} />Archive chat</>}
                      </button>
                      <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
                      <button
                        onClick={() => { setChatConfirmDelete('me'); setShowProfileMore(false); }}
                        style={headerCtxItemStyle}
                      >
                        <Trash2 size={14} style={{ marginRight: 8 }} />Delete for me
                      </button>
                      <button
                        onClick={() => { setChatConfirmDelete('both'); setShowProfileMore(false); }}
                        style={{ ...headerCtxItemStyle, color: 'var(--error, #e74c3c)' }}
                      >
                        <Trash2 size={14} style={{ marginRight: 8 }} />Delete for everyone
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Info rows */}
          <div style={{ margin: '0 16px 16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {/* Name */}
            <div style={{ padding: '12px 16px', borderBottom: peer.profile?.username ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>Name</div>
              <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                {peer.profile?.name || 'Unknown'}
              </div>
            </div>

            {/* Username (only show if user has one) */}
            {peer.profile?.username && peer.profile.username.trim() !== '' && (
              <div style={{ padding: '12px 16px', borderBottom: peer.profile?.createdAt ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>Username</div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                  @{peer.profile.username}
                </div>
              </div>
            )}

            {/* email */}
            {peer.profile?.email && (
              <div style={{ padding: '12px 16px', borderBottom: peer.profile?.createdAt ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>Email</div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                  {peer.profile.email}
                </div>
              </div>
            )}

            {/* Member since */}
            {peer.profile?.createdAt && (
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>Member since</div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                  {new Date(peer.profile.createdAt).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Forward modal */}
      {forwardingMsgs.length > 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setForwardingMsgs([]); setForwardTargetIds(new Set()); setForwardSearch(''); } }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
              width: 360,
              maxHeight: '70vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>
                Forward {forwardingMsgs.length > 1 ? `${forwardingMsgs.length} messages` : 'message'}
              </span>
              <button onClick={() => { setForwardingMsgs([]); setForwardTargetIds(new Set()); setForwardSearch(''); }} style={iconBtnStyle} title="Close">
                <X size={16} />
              </button>
            </div>
            {/* Preview */}
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '6px 10px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {forwardingMsgs.length === 1
                ? (forwardingMsgs[0].type !== 'text' && !forwardingMsgs[0].content ? `[${forwardingMsgs[0].type}]` : forwardingMsgs[0].content || `[${forwardingMsgs[0].type}]`)
                : forwardingMsgs.map((m) => m.content || `[${m.type}]`).join(' · ')}
            </div>
            {/* Search */}
            <input
              type="text"
              placeholder="Search chats..."
              value={forwardSearch}
              onChange={(e) => setForwardSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {/* Target chat list with checkboxes */}
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* ─── Saved Messages (Bookmarks) entry ─── */}
              {(() => {
                const BOOKMARK_ID = '__bookmarks__';
                const checked = forwardTargetIds.has(BOOKMARK_ID);
                return (
                  <button
                    key={BOOKMARK_ID}
                    onClick={() => {
                      setForwardTargetIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(BOOKMARK_ID)) next.delete(BOOKMARK_ID); else next.add(BOOKMARK_ID);
                        return next;
                      });
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: checked ? 'var(--bg-active)' : 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--text-primary)',
                      fontSize: 14,
                      borderBottom: '1px solid var(--border)',
                      marginBottom: 4,
                    }}
                    onMouseEnter={(e) => { if (!checked) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-tertiary)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = checked ? 'var(--bg-active)' : 'transparent'; }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                      backgroundColor: checked ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked && (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', backgroundColor: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Bookmark size={18} color="#fff" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Saved Messages</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Bookmark for yourself</div>
                    </div>
                  </button>
                );
              })()}
              {chats
                .filter((c) => {
                  if (c.chatId === chatId) return false;
                  if (!forwardSearch.trim()) return true;
                  const q = forwardSearch.toLowerCase();
                  const isSelf = c.type === 'private' && c.members.every((m) => m === currentUid);
                  const uid = c.type === 'private' ? (isSelf ? currentUid : c.members.find((m) => m !== currentUid)) : null;
                  const p = uid === currentUid ? currentUser : (uid ? userProfiles[uid] : null);
                  const isDeletedInFilter = !isSelf && p?.isDeleted;
                  const n = isDeletedInFilter
                    ? (nicknames[uid!] || p?.name || 'Deleted User')
                    : isSelf
                      ? `${p?.name || 'you'} (you)`
                      : (nicknames[uid!] || p?.name || c.chatId);
                  return n.toLowerCase().includes(q);
                })
                .map((c) => {
                  const isSelfChat = c.type === 'private' && c.members.every((m) => m === currentUid);
                  const otherUid = c.type === 'private' ? (isSelfChat ? currentUid : c.members.find((m) => m !== currentUid)) : null;
                  const profile = otherUid === currentUid ? currentUser : (otherUid ? userProfiles[otherUid] : null);
                  const isDeletedPeer = !isSelfChat && profile?.isDeleted;
                  const name = isDeletedPeer
                    ? (nicknames[otherUid!] || profile?.name || 'Deleted User')
                    : isSelfChat
                      ? `${profile?.name || 'You'} (You)`
                      : (nicknames[otherUid!] || profile?.name || c.chatId);
                  const checked = forwardTargetIds.has(c.chatId);
                  return (
                    <button
                      key={c.chatId}
                      onClick={() => {
                        setForwardTargetIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.chatId)) next.delete(c.chatId); else next.add(c.chatId);
                          return next;
                        });
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: checked ? 'var(--bg-active)' : 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: 'var(--text-primary)',
                        fontSize: 14,
                      }}
                      onMouseEnter={(e) => { if (!checked) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-tertiary)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = checked ? 'var(--bg-active)' : 'transparent'; }}
                    >
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                        backgroundColor: checked ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {checked && (
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <UserAvatar name={name} avatar={profile?.avatar} size={36} />
                      <span>{name}</span>
                    </button>
                  );
                })}
            </div>
            {/* Send button */}
            <button
              onClick={() => handleForwardTo([...forwardTargetIds])}
              disabled={forwardTargetIds.size === 0}
              style={{
                padding: '10px 0',
                borderRadius: 8,
                border: 'none',
                backgroundColor: forwardTargetIds.size > 0 ? 'var(--accent)' : 'var(--border)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: forwardTargetIds.size > 0 ? 'pointer' : 'not-allowed',
                transition: 'background-color 0.15s',
              }}
            >
              Forward{forwardTargetIds.size > 0 ? ` to ${forwardTargetIds.size} chat${forwardTargetIds.size > 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      )}

      {/* ─── Confirm delete chat for everyone ────────────────────────────── */}
      {chatConfirmDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '24px 28px',
              maxWidth: 340,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 17 }}>
              {chatConfirmDelete === 'both' ? 'Delete for everyone?' : 'Delete chat?'}
            </h3>
            <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14 }}>
              {chatConfirmDelete === 'both'
                ? 'This will permanently delete the chat and all messages for all participants. This action cannot be undone.'
                : 'This will delete the chat from your device. Other participants will still have access to it.'}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setChatConfirmDelete(null)}
                disabled={chatDeleting}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteChat(chatConfirmDelete)}
                disabled={chatDeleting}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, backgroundColor: '#f87171', color: '#fff' }}
              >
                {chatDeleting ? 'Deleting…' : chatConfirmDelete === 'both' ? 'Delete for everyone' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirm delete message(s) ─────────────────────────────────── */}
      {msgConfirmDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setMsgConfirmDelete(null); }}
        >
          <div
            style={{
              backgroundColor: 'rgba(30, 30, 30, 0.85)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 20,
              padding: '24px',
              maxWidth: 340,
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
              animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#ef4444'
            }}>
              <Trash2 size={32} />
            </div>
            <h3 style={{ margin: '0 0 8px', color: '#fff', fontSize: 18 }}>
              Delete {msgConfirmDelete.ids.length > 1 ? `${msgConfirmDelete.ids.length} messages` : 'this message'}?
            </h3>
            <p style={{ margin: '0 0 24px', color: 'rgba(255, 255, 255, 0.6)', fontSize: 14, lineHeight: 1.5 }}>
              {msgConfirmDelete.scope === 'both' 
                ? 'This will delete the messages for everyone in this chat. This action cannot be undone.'
                : 'This will delete the messages only for you. This action cannot be undone.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => executeDeleteMessages(msgConfirmDelete.ids, msgConfirmDelete.scope)}
                disabled={msgDeleting}
                style={{ 
                  width: '100%',
                  padding: '12px', 
                  borderRadius: 12, 
                  border: 'none', 
                  cursor: 'pointer', 
                  fontSize: 15, 
                  fontWeight: 600, 
                  backgroundColor: '#ef4444', 
                  color: '#fff',
                  transition: 'filter 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                onMouseOut={(e) => e.currentTarget.style.filter = 'none'}
              >
                {msgDeleting ? 'Deleting…' : `Delete for ${msgConfirmDelete.scope === 'both' ? 'Everyone' : 'Me'}`}
              </button>
              <button
                onClick={() => setMsgConfirmDelete(null)}
                disabled={msgDeleting}
                style={{ 
                  width: '100%',
                  padding: '12px', 
                  borderRadius: 12, 
                  border: 'none', 
                  cursor: 'pointer', 
                  fontSize: 15, 
                  fontWeight: 600, 
                  backgroundColor: 'transparent', 
                  color: 'rgba(255, 255, 255, 0.6)',
                  transition: 'background-color 0.2s, color 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {fileError && <FileErrorModal error={fileError} onClose={() => setFileError(null)} />}
      {recordingError && (
        <ErrorModal
          isOpen={!!recordingError}
          onClose={() => setRecordingError(null)}
          title="Camera / Microphone Error"
          message={recordingError}
          buttonText="OK"
        />
      )}
      {previewFile && <FilePreviewer messages={previewFile.messages} initialIndex={previewFile.initialIndex} onClose={() => setPreviewFile(null)} />}
      
      {showThemeModal && activeChat && (
        <ChatThemeModal
          chatId={activeChat.chatId}
          currentTheme={currentUser?.chatThemes?.[activeChat.chatId]}
          peerTheme={peerTheme}
          onClose={() => setShowThemeModal(false)}
          onSave={() => {
            // Theme is already updated via socket/API
          }}
        />
      )}
      
      {/* URL Link Modal */}
      {showUrlModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={() => {
            setShowUrlModal(false);
            setUrlLinkText('');
            setUrlLinkUrl('');
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 16,
              padding: '24px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
              animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              margin: '20px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 20px 0', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              Insert Link
            </h3>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                Link Text
              </label>
              <input
                ref={urlModalTextRef}
                type="text"
                value={urlLinkText}
                onChange={(e) => setUrlLinkText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && urlLinkText.trim() && urlLinkUrl.trim()) {
                    insertUrlLink();
                  } else if (e.key === 'Escape') {
                    setShowUrlModal(false);
                    setUrlLinkText('');
                    setUrlLinkUrl('');
                  }
                }}
                placeholder="Enter text to display"
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                URL
              </label>
              <input
                ref={urlModalUrlRef}
                type="url"
                value={urlLinkUrl}
                onChange={(e) => setUrlLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && urlLinkText.trim() && urlLinkUrl.trim()) {
                    insertUrlLink();
                  } else if (e.key === 'Escape') {
                    setShowUrlModal(false);
                    setUrlLinkText('');
                    setUrlLinkUrl('');
                  }
                }}
                placeholder="https://example.com"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowUrlModal(false);
                  setUrlLinkText('');
                  setUrlLinkUrl('');
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Cancel
              </button>
              <button
                onClick={insertUrlLink}
                disabled={!urlLinkText.trim() || !urlLinkUrl.trim()}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: (!urlLinkText.trim() || !urlLinkUrl.trim()) ? 'var(--bg-tertiary)' : 'var(--accent)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: (!urlLinkText.trim() || !urlLinkUrl.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (!urlLinkText.trim() || !urlLinkUrl.trim()) ? 0.5 : 1,
                  transition: 'opacity 0.15s'
                }}
              >
                Insert Link
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      )}

      {/* Bookmark toast */}
      {bookmarkToast && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          padding: '10px 18px',
          borderRadius: 20,
          fontSize: 13,
          fontWeight: 500,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          {bookmarkToast === 'saved' ? (
            <><BookmarkCheck size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} /> Saved to bookmarks</>
          ) : (
            <><Bookmark size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} /> Removed from bookmarks</>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatWindow;
