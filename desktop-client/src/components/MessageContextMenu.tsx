import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CornerUpLeft, Forward, Bookmark, BookmarkCheck, Pin, PinOff, Trash2, Pencil, Copy, Download, X, CheckSquare, SmilePlus, ExternalLink } from 'lucide-react';
import { Message } from '@shared/types';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

export const PRESET_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '👎'];

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

interface MessageContextMenuProps {
  message: Message;
  x: number;
  y: number;
  onClose: () => void;
  isOwn: boolean;
  bookmarked: boolean;
  isPinned: boolean;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onBookmark?: (message: Message) => void;
  onPin?: (message: Message, action: 'pin' | 'unpin') => void;
  onDelete?: (messageId: string, scope: 'me' | 'both') => void;
  onStartEdit?: (message: Message) => void;
  onCopy?: (message: Message) => void;
  onDownload?: (message: Message) => void;
  onEnterSelect?: (messageId: string) => void;
  onMessageReaction?: (messageId: string, emoji: string) => void;
  onCloseChat?: () => void;
}

const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  message,
  x,
  y,
  onClose,
  isOwn,
  bookmarked,
  isPinned,
  onReply,
  onForward,
  onBookmark,
  onPin,
  onDelete,
  onStartEdit,
  onCopy,
  onDownload,
  onEnterSelect,
  onMessageReaction,
  onCloseChat,
}) => {
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number } | null>(null);
  const [showExtended, setShowExtended] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);

  // Recalculate position when picker opens/closes
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    
    // Small delay to ensure picker is rendered
    const timer = setTimeout(() => {
      if (!menuRef.current) return;
      
      const { offsetWidth: w, offsetHeight: h } = menuRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const MARGIN = 8;
      
      // Measure the actual nav bar height from the DOM, fall back to CSS values
      const navEl = document.querySelector('.nav-sidebar') as HTMLElement | null;
      const navBarHeight = navEl ? navEl.offsetHeight : (window.innerWidth <= 480 ? 52 : window.innerWidth <= 768 ? 56 : 0);
      const bottomBoundary = vh - navBarHeight - MARGIN;

      let px = x;
      let py = y;
      
      // Overflow right → shift left
      if (px + w > vw - MARGIN) {
        px = vw - w - MARGIN;
      }
      // Overflow left
      if (px < MARGIN) px = MARGIN;

      // Overflow bottom (into nav bar) → flip above click point
      if (py + h > bottomBoundary) {
        const above = y - h - MARGIN;
        py = above >= MARGIN ? above : Math.max(MARGIN, bottomBoundary - h);
      }
      // Overflow top
      if (py < MARGIN) py = MARGIN;
      
      setAdjustedPos({ x: px, y: py });
    }, showExtended ? 10 : 0); // Small delay when picker opens to get accurate height
    
    return () => clearTimeout(timer);
  }, [x, y, showExtended]);

  const handleEmojiClick = (emoji: string) => {
    onClose();
    onMessageReaction?.(message.messageId, emoji);
  };

  const handleEmojiMartSelect = (emojiData: any) => {
    if (emojiData?.native) {
      handleEmojiClick(emojiData.native);
    }
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: adjustedPos ? adjustedPos.y : y,
        left: adjustedPos ? adjustedPos.x : x,
        visibility: adjustedPos ? 'visible' : 'hidden',
        zIndex: 1000,
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        minWidth: 170,
        maxHeight: 'calc(100vh - 16px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Reactions */}
      {!message.deleted && onMessageReaction && (
        <>
          <div style={{ padding: '8px 12px 6px', display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {PRESET_EMOJIS.map(em => (
                <button
                  key={em}
                  onClick={() => handleEmojiClick(em)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px', borderRadius: '50%', transition: 'transform 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.3)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {em}
                </button>
              ))}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowExtended(!showExtended); }}
              title="More reactions"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center',
                color: showExtended ? 'var(--accent)' : 'var(--text-secondary)', borderRadius: '50%',
              }}
            >
              <SmilePlus size={20} />
            </button>
          </div>
          {showExtended && (
            <div ref={pickerRef} style={{ padding: '0 8px 8px', maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
              <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                <Picker data={data} onEmojiSelect={handleEmojiMartSelect} theme="auto" previewPosition="none" skinTonePosition="none" navPosition="bottom" width={350} />
              </div>
            </div>
          )}
          <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
        </>
      )}

      {onCloseChat && (
        <>
          <button onClick={() => { onClose(); onCloseChat(); }} style={menuItemStyle}>
            <X size={14} style={{ marginRight: 6 }} />Close chat
          </button>
          <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
        </>
      )}
      {onEnterSelect && (
        <>
          <button onClick={() => { onClose(); onEnterSelect(message.messageId); }} style={menuItemStyle}>
            <CheckSquare size={14} style={{ marginRight: 6 }} />Select
          </button>
          <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
        </>
      )}

      {isOwn && !message.deleted && message.type === 'text' && onStartEdit && (
        <button onClick={() => { onClose(); onStartEdit(message); }} style={menuItemStyle}>
          <Pencil size={14} style={{ marginRight: 6 }} />Edit message
        </button>
      )}
      {!message.deleted && onReply && (
        <button onClick={() => { onClose(); onReply(message); }} style={menuItemStyle}>
          <CornerUpLeft size={14} style={{ marginRight: 6 }} />Reply message
        </button>
      )}
      {!message.deleted && (message.content || message.fileUrl) && onCopy && (() => {
        const type = message.type;
        if (type === 'audio' || type === 'voice_note' || type === 'video' || type === 'video_note' || type === 'file' || type === 'pdf') {
          return null; // Don't show copy button for these, only download
        }
        
        let label = 'Copy message';
        if (type === 'image') label = 'Copy image';
        else if (type === 'gif') label = 'Copy GIF';
        else if (type === 'sticker') label = 'Copy sticker';
        
        return (
          <button onClick={() => { onClose(); onCopy(message); }} style={menuItemStyle}>
            <Copy size={14} style={{ marginRight: 6 }} />
            {label}
          </button>
        );
      })()}
      {!message.deleted && message.fileUrl && onDownload && (
        <button onClick={() => { onClose(); onDownload(message); }} style={menuItemStyle}>
          <Download size={14} style={{ marginRight: 6 }} />Download
        </button>
      )}
      {!message.deleted && onForward && (
        <button onClick={() => { onClose(); onForward(message); }} style={menuItemStyle}>
          <Forward size={14} style={{ marginRight: 6 }} />Forward message
        </button>
      )}
      {!message.deleted && onBookmark && (
        <button onClick={() => { onClose(); onBookmark(message); }} style={bookmarked ? { ...menuItemStyle, color: 'var(--accent)' } : menuItemStyle}>
          {bookmarked ? <BookmarkCheck size={14} style={{ marginRight: 6 }} /> : <Bookmark size={14} style={{ marginRight: 6 }} />}
          {bookmarked ? 'Remove bookmark' : 'Save to bookmarks'}
        </button>
      )}
      {!message.deleted && onPin && (
        <button onClick={() => { onClose(); onPin(message, isPinned ? 'unpin' : 'pin'); }} style={menuItemStyle}>
          {isPinned ? <PinOff size={14} style={{ marginRight: 6 }} /> : <Pin size={14} style={{ marginRight: 6 }} />}
          {isPinned ? 'Unpin message' : 'Pin message'}
        </button>
      )}
      {onDelete && (
        <button onClick={() => { onClose(); onDelete(message.messageId, 'me'); }} style={menuItemStyle}>
          <Trash2 size={14} style={{ marginRight: 6 }} />Delete for me
        </button>
      )}
      {onDelete && isOwn && !message.deleted && (
        <button onClick={() => { onClose(); onDelete(message.messageId, 'both'); }} style={{ ...menuItemStyle, color: 'var(--error, #e74c3c)' }}>
          <Trash2 size={14} style={{ marginRight: 6 }} />Delete for everyone
        </button>
      )}
    </div>
  );
};

export default MessageContextMenu;
