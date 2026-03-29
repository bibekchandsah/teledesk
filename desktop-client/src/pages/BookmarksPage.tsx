import React, {
  useCallback, useEffect, useLayoutEffect, useMemo,
  useRef, useState,
} from 'react';
import {
  Bookmark, Paperclip, Send, Search, X, ChevronUp, ChevronDown,
  CornerUpLeft, Forward, Copy, CheckSquare, Trash2, Pin, PinOff,
  Pencil, MoreVertical, Check,
} from 'lucide-react';
import { formatTime, formatFileSize, getDateKey, formatDateLabel } from '../utils/formatters';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import MessageBubble from '../components/MessageBubble';
import UserAvatar from '../components/UserAvatar';
import { uploadChatFile, getMessageTypeFromMime, validateFile } from '../services/fileService';
import { sendMessage } from '../services/socketService';
import { Message, SavedMessage } from '@shared/types';

// Date helpers removed (now using imports)

// ─── Styles ───────────────────────────────────────────────────────────────────
const headerBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 6,
  borderRadius: 8, color: 'var(--text-secondary)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.15s',
};
const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 6,
  borderRadius: 8, color: 'var(--text-secondary)', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
};
const headerCtxItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', width: '100%',
  padding: '10px 16px', background: 'none', border: 'none',
  textAlign: 'left', cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)',
};
const scrollNavBtnStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
};
const selActionBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
  alignItems: 'center', color: 'var(--text-secondary)', padding: '4px 6px', borderRadius: 6,
};
const searchNavBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
  borderRadius: 6, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
};
const inputAreaBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 8, borderRadius: 8,
  color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

// ─── Component ────────────────────────────────────────────────────────────────
const BookmarksPage: React.FC = () => {
  const {
    savedEntries, addNote, addFileNote, deleteEntry, editEntry, togglePin,
  } = useBookmarkStore();
  const { currentUser } = useAuthStore();
  const { chats, userProfiles } = useChatStore();

  // ── UI state ─────────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  const [replyingTo, setReplyingTo] = useState<SavedMessage | null>(null);
  const [forwardingMsgs, setForwardingMsgs] = useState<SavedMessage[]>([]);
  const [forwardTargetIds, setForwardTargetIds] = useState<Set<string>>(new Set());
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingMsg, setEditingMsg] = useState<SavedMessage | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const dragAnchorIdx = useRef<number | null>(null);
  const lastCountRef = useRef(savedEntries.length);

  // Active (non-deleted) entries for display
  const messages = useMemo(() => savedEntries.filter((e) => !e.deleted), [savedEntries]);
  const pinnedMessages = useMemo(() => messages.filter((e) => e.pinnedInSaved), [messages]);
  const currentUid = currentUser?.uid ?? '';

  // ── Search matches ───────────────────────────────────────────────────────
  const searchMatchIndices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages.reduce<number[]>((acc, msg, idx) => {
      if (msg.content?.toLowerCase().includes(q)) acc.push(idx);
      return acc;
    }, []);
  }, [searchQuery, messages]);

  // Focus search input when opened
  useEffect(() => { if (searchOpen) searchInputRef.current?.focus(); }, [searchOpen]);

  // Scroll to active search match
  useEffect(() => {
    if (searchMatchIndices.length === 0) return;
    const target = scrollContainerRef.current?.querySelector<HTMLElement>(
      `[data-msg-idx="${searchMatchIndices[searchMatchIdx]}"]`
    );
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [searchMatchIdx, searchMatchIndices]);

  // Auto-scroll to bottom when a new entry is added
  useLayoutEffect(() => {
    if (savedEntries.length > lastCountRef.current) {
      const el = scrollContainerRef.current;
      if (el) {
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distFromBottom < 300) el.scrollTop = el.scrollHeight;
      }
    }
    lastCountRef.current = savedEntries.length;
  }, [savedEntries.length]);

  // Initial scroll to bottom
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close search when Escape pressed (outside selection mode)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { exitSelectionMode(); setHeaderMenu(null); setEditingMsg(null); setInputText(''); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close header menu on outside click
  useEffect(() => {
    if (!headerMenu) return;
    const close = (e: MouseEvent) => {
      if (!headerMenuRef.current?.contains(e.target as Node)) setHeaderMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [headerMenu]);

  // ── Scroll handler ────────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setShowScrollTop(el.scrollTop > 200);
    setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  }, []);

  // ── Search navigation ─────────────────────────────────────────────────────
  const handleSearchPrev = () => {
    if (!searchMatchIndices.length) return;
    setSearchMatchIdx((i) => (i - 1 + searchMatchIndices.length) % searchMatchIndices.length);
  };
  const handleSearchNext = () => {
    if (!searchMatchIndices.length) return;
    setSearchMatchIdx((i) => (i + 1) % searchMatchIndices.length);
  };

  // ── Scroll to a specific message ──────────────────────────────────────────
  const handleScrollToMessage = useCallback((messageId: string) => {
    const target = scrollContainerRef.current?.querySelector<HTMLElement>(`[data-msg-id="${messageId}"]`);
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setHighlightedMsgId(messageId);
      setTimeout(() => setHighlightedMsgId(null), 1500);
    }
  }, []);

  // ── Send note ─────────────────────────────────────────────────────────────
  const handleSend = () => {
    if (!inputText.trim() || !currentUser) return;
    if (editingMsg) {
      handleEdit(editingMsg.messageId, inputText.trim());
      setEditingMsg(null);
      setInputText('');
      return;
    }
    addNote({
      senderId: currentUser.uid,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      content: inputText.trim(),
      replyTo: replyingTo
        ? {
            messageId: replyingTo.messageId,
            senderId: replyingTo.senderId,
            senderName: replyingTo.senderName,
            content: replyingTo.content,
            type: replyingTo.type,
            fileUrl: replyingTo.fileUrl,
            fileName: replyingTo.fileName,
          }
        : undefined,
    });
    setInputText('');
    setReplyingTo(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') {
      if (editingMsg) { setEditingMsg(null); setInputText(''); }
      else setReplyingTo(null);
    }
  };

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    const validation = validateFile(file);
    if (!validation.valid) { alert(validation.error); return; }
    try {
      setIsUploading(true);
      const result = await uploadChatFile(file, 'saved-notes', (p) => setUploadProgress(Math.round(p)));
      const msgType = getMessageTypeFromMime(file.type);
      addFileNote({
        senderId: currentUser.uid,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar,
        content: `Saved a ${msgType}`,
        type: msgType,
        fileUrl: result.url,
        fileName: result.fileName,
        fileSize: result.fileSize,
      });
    } catch { alert('Failed to upload file. Please try again.'); }
    finally {
      setIsUploading(false); setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Reply ─────────────────────────────────────────────────────────────────
  const handleReply = useCallback((message: Message) => {
    setEditingMsg(null);
    setReplyingTo(message as SavedMessage);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // ── Forward (from saved messages → real chats) ────────────────────────────
  const handleForward = useCallback((message: Message) => {
    setForwardingMsgs([message as SavedMessage]);
    setForwardTargetIds(new Set());
  }, []);

  const handleForwardTo = useCallback((targetChatIds: string[]) => {
    if (!forwardingMsgs.length || !currentUser) return;
    for (const targetChatId of targetChatIds) {
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
  }, [forwardingMsgs, currentUser]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback((messageId: string, _scope: 'me' | 'both') => {
    deleteEntry(messageId);
  }, [deleteEntry]);

  // ── Edit ──────────────────────────────────────────────────────────────────
  const handleEdit = useCallback((messageId: string, newContent: string) => {
    editEntry(messageId, newContent);
  }, [editEntry]);

  // ── Pin ───────────────────────────────────────────────────────────────────
  const handlePin = useCallback((_message: Message, action: 'pin' | 'unpin') => {
    togglePin(_message.messageId);
    if (action === 'pin') setPinnedIdx(0);
  }, [togglePin]);

  // ── Selection mode ────────────────────────────────────────────────────────
  const enterSelectionMode = useCallback((firstMsgId: string) => {
    setSelectionMode(true); setSelectedIds(new Set([firstMsgId]));
  }, []);
  const enterSelectionModeEmpty = useCallback(() => {
    setSelectionMode(true); setSelectedIds(new Set());
  }, []);
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false); setSelectedIds(new Set());
  }, []);

  const toggleSelectMessage = useCallback((messageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId); else next.add(messageId);
      return next;
    });
  }, []);

  // Drag-to-select helpers
  const getMsgIdxFromTarget = (target: EventTarget | null): number | null => {
    const el = (target as Element)?.closest('[data-msg-idx]') as HTMLElement | null;
    return el ? parseInt(el.dataset.msgIdx ?? '', 10) : null;
  };
  const handleMsgMouseDown = useCallback((e: React.MouseEvent) => {
    const idx = getMsgIdxFromTarget(e.target);
    if (idx !== null) dragAnchorIdx.current = idx;
  }, []);
  const handleMsgMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragAnchorIdx.current === null || !(e.buttons & 1)) return;
    const idx = getMsgIdxFromTarget(e.target);
    if (idx === null) return;
    if (idx !== dragAnchorIdx.current) setSelectionMode(true);
    if (!selectionMode && idx === dragAnchorIdx.current) return;
    const lo = Math.min(dragAnchorIdx.current, idx);
    const hi = Math.max(dragAnchorIdx.current, idx);
    setSelectedIds(new Set(messages.slice(lo, hi + 1).map((m) => m.messageId)));
  }, [selectionMode, messages]);
  const handleMsgMouseUp = useCallback(() => { dragAnchorIdx.current = null; }, []);

  // ── Bulk operations ───────────────────────────────────────────────────────
  const handleBulkDelete = useCallback(() => {
    for (const id of selectedIds) deleteEntry(id);
    exitSelectionMode();
  }, [selectedIds, deleteEntry, exitSelectionMode]);

  const handleBulkCopy = useCallback(() => {
    const texts = messages
      .filter((m) => selectedIds.has(m.messageId) && m.content)
      .map((m) => m.content).join('\n');
    if (texts) navigator.clipboard.writeText(texts).catch(() => {});
    exitSelectionMode();
  }, [selectedIds, messages, exitSelectionMode]);

  const handleBulkForward = useCallback(() => {
    const msgs = messages.filter((m) => selectedIds.has(m.messageId));
    if (!msgs.length) return;
    setForwardingMsgs(msgs);
    setForwardTargetIds(new Set());
    exitSelectionMode();
  }, [selectedIds, messages, exitSelectionMode]);

  const handleBulkPin = useCallback(() => {
    for (const id of selectedIds) togglePin(id);
    exitSelectionMode();
  }, [selectedIds, togglePin, exitSelectionMode]);

  const handleSelectionEdit = useCallback(() => {
    if (selectedIds.size !== 1) return;
    const [msgId] = [...selectedIds];
    const found = messages.find((m) => m.messageId === msgId);
    exitSelectionMode();
    if (found) {
      setEditingMsg(found);
      setReplyingTo(null);
      setInputText(found.content ?? '');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [selectedIds, messages, exitSelectionMode]);

  const handleSelectionReply = useCallback(() => {
    if (selectedIds.size !== 1) return;
    const [msgId] = [...selectedIds];
    const msg = messages.find((m) => m.messageId === msgId);
    if (msg) {
      setReplyingTo(msg);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    exitSelectionMode();
  }, [selectedIds, messages, exitSelectionMode]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100dvh',
        width: '100%', position: 'relative', overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(env(safe-area-inset-top) + 12px) 20px 12px',
          borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 42, height: 42, borderRadius: '50%', backgroundColor: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Bookmark size={20} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>Saved Messages</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            onClick={() => { setSearchOpen((o) => !o); setSearchQuery(''); setSearchMatchIdx(0); }}
            title="Search saved messages"
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

      {/* ─── Header dropdown menu ─────────────────────────────────────────── */}
      {headerMenu && (
        <div
          ref={headerMenuRef}
          style={{
            position: 'fixed', top: headerMenu.y, left: headerMenu.x - 200,
            zIndex: 1000, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', overflow: 'hidden', minWidth: 200,
          }}
        >
          {selectionMode ? (() => {
            const count = selectedIds.size;
            const onlyOne = count === 1;
            const singleMsg = onlyOne ? messages.find((m) => m.messageId === [...selectedIds][0]) : undefined;
            const canEdit = onlyOne && !!singleMsg && singleMsg.isNote && singleMsg.type === 'text';
            const canReply = onlyOne && !!singleMsg;
            return (
              <>
                <div style={{ padding: '6px 14px 4px', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {count === 0 ? 'Select messages' : `${count} selected`}
                </div>
                <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
                <button onClick={() => { setHeaderMenu(null); handleSelectionEdit(); }} disabled={!canEdit}
                  style={{ ...headerCtxItemStyle, opacity: canEdit ? 1 : 0.35, cursor: canEdit ? 'pointer' : 'default' }}>
                  <Pencil size={14} style={{ marginRight: 8 }} />Edit note
                </button>
                <button onClick={() => { setHeaderMenu(null); handleSelectionReply(); }} disabled={!canReply}
                  style={{ ...headerCtxItemStyle, opacity: canReply ? 1 : 0.35, cursor: canReply ? 'pointer' : 'default' }}>
                  <CornerUpLeft size={14} style={{ marginRight: 8 }} />Reply
                </button>
                <button onClick={() => { setHeaderMenu(null); handleBulkForward(); }} disabled={count === 0}
                  style={{ ...headerCtxItemStyle, opacity: count > 0 ? 1 : 0.35, cursor: count > 0 ? 'pointer' : 'default' }}>
                  <Forward size={14} style={{ marginRight: 8 }} />Forward to chat
                </button>
                <button onClick={() => { setHeaderMenu(null); handleBulkCopy(); }} disabled={count === 0}
                  style={{ ...headerCtxItemStyle, opacity: count > 0 ? 1 : 0.35, cursor: count > 0 ? 'pointer' : 'default' }}>
                  <Copy size={14} style={{ marginRight: 8 }} />Copy
                </button>
                <button onClick={() => { setHeaderMenu(null); handleBulkPin(); }} disabled={count === 0}
                  style={{ ...headerCtxItemStyle, opacity: count > 0 ? 1 : 0.35, cursor: count > 0 ? 'pointer' : 'default' }}>
                  <Pin size={14} style={{ marginRight: 8 }} />Pin / unpin
                </button>
                <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
                <button onClick={() => { setHeaderMenu(null); handleBulkDelete(); }} disabled={count === 0}
                  style={{ ...headerCtxItemStyle, color: 'var(--error, #e74c3c)', opacity: count > 0 ? 1 : 0.35, cursor: count > 0 ? 'pointer' : 'default' }}>
                  <Trash2 size={14} style={{ marginRight: 8 }} />Delete selected
                </button>
              </>
            );
          })() : (
            <button onClick={() => { setHeaderMenu(null); enterSelectionModeEmpty(); }} style={headerCtxItemStyle}>
              <CheckSquare size={14} style={{ marginRight: 8 }} />Select messages
            </button>
          )}
        </div>
      )}

      {/* ─── Pinned messages banner ───────────────────────────────────────── */}
      {pinnedMessages.length > 0 && (
        <div
          onClick={() => {
            const msg = pinnedMessages[pinnedIdx % pinnedMessages.length];
            handleScrollToMessage(msg.messageId);
            setPinnedIdx((i) => (i + 1) % pinnedMessages.length);
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
            backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Pin size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
              Pinned message {pinnedMessages.length > 1 ? `${(pinnedIdx % pinnedMessages.length) + 1}/${pinnedMessages.length}` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {pinnedMessages[pinnedIdx % pinnedMessages.length]?.content || '[file]'}
            </div>
          </div>
        </div>
      )}

      {/* ─── Search bar ────────────────────────────────────────────────────── */}
      {searchOpen && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
            borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', flexShrink: 0,
          }}
        >
          <Search size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.shiftKey ? handleSearchPrev() : handleSearchNext();
              if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
            }}
            placeholder="Search saved messages..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text-primary)' }}
          />
          {searchQuery && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {searchMatchIndices.length === 0 ? 'No results' : `${searchMatchIdx + 1} / ${searchMatchIndices.length}`}
            </span>
          )}
          <button onClick={handleSearchPrev} disabled={!searchMatchIndices.length} style={searchNavBtnStyle} title="Previous">
            <ChevronUp size={16} />
          </button>
          <button onClick={handleSearchNext} disabled={!searchMatchIndices.length} style={searchNavBtnStyle} title="Next">
            <ChevronDown size={16} />
          </button>
          <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} style={searchNavBtnStyle} title="Close">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ─── Messages area ───────────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseDown={handleMsgMouseDown}
        onMouseMove={handleMsgMouseMove}
        onMouseUp={handleMsgMouseUp}
        style={{
          flex: 1, overflowY: 'auto', padding: '12px 0',
          display: 'flex', flexDirection: 'column',
          userSelect: selectionMode ? 'none' : undefined,
        }}
      >
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-secondary)', gap: 12 }}>
            <Bookmark size={52} style={{ opacity: 0.15 }} />
            <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>No saved messages yet</p>
            <p style={{ fontSize: 13, margin: 0, opacity: 0.6, textAlign: 'center', maxWidth: 280 }}>
              Type a note below, or bookmark / forward messages from any chat to save them here.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const prev = messages[idx - 1];
          const showDatePill = !prev || getDateKey(msg.timestamp) !== getDateKey(prev.timestamp);
          const isSearchMatch = searchMatchIndices.includes(idx);
          const isActiveMatch = searchMatchIndices[searchMatchIdx] === idx;

          return (
            <React.Fragment key={msg.messageId}>
              {showDatePill && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
                  <span style={{
                    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                    fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
                    border: '1px solid var(--border)', userSelect: 'none',
                  }}>
                    {formatDateLabel(msg.timestamp)}
                  </span>
                </div>
              )}
              {/* Source label for bookmarked (non-note) entries */}
              {!msg.isNote && msg.sourceChatName && (!prev || prev.sourceChatName !== msg.sourceChatName || prev.isNote) && (
                <div style={{ textAlign: 'center', padding: '2px 0 4px' }}>
                  <span style={{ fontSize: 11, color: 'var(--accent)', opacity: 0.8 }}>
                    from {msg.sourceChatName}
                  </span>
                </div>
              )}
              <div
                data-msg-idx={idx}
                data-msg-id={msg.messageId}
                style={{ display: 'flex', alignItems: 'center' }}
              >
                {selectionMode && (
                  <div
                    onClick={() => toggleSelectMessage(msg.messageId)}
                    style={{ flexShrink: 0, width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', paddingLeft: 8 }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%',
                      border: `2px solid ${selectedIds.has(msg.messageId) ? 'var(--accent)' : 'var(--border)'}`,
                      backgroundColor: selectedIds.has(msg.messageId) ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
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
                    message={msg as Message}
                    isOwn={msg.senderId === currentUid}
                    senderName={msg.senderName || userProfiles[msg.senderId]?.name}
                    senderAvatar={msg.senderAvatar || userProfiles[msg.senderId]?.avatar}
                    showSender={msg.senderId !== currentUid}
                    onDelete={selectionMode ? undefined : handleDelete}
                    onStartEdit={selectionMode ? undefined : (msg.isNote ? (message) => {
                      setEditingMsg(message as SavedMessage);
                      setReplyingTo(null);
                      setInputText(message.content ?? '');
                      setTimeout(() => inputRef.current?.focus(), 0);
                    } : undefined)}
                    onReply={selectionMode ? undefined : handleReply}
                    onForward={selectionMode ? undefined : handleForward}
                    onPin={selectionMode ? undefined : handlePin}
                    isPinned={!!msg.pinnedInSaved}
                    onScrollToMessage={handleScrollToMessage}
                    onEnterSelect={selectionMode ? undefined : enterSelectionMode}
                    searchQuery={isSearchMatch ? searchQuery : undefined}
                    isActiveSearchMatch={isActiveMatch}
                    isHighlighted={highlightedMsgId === msg.messageId}
                  />
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Scroll navigation arrows ──────────────────────────────────────── */}
      {showScrollBottom && (
        <div style={{ position: 'absolute', right: 16, bottom: 90, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10 }}>
          {showScrollTop && (
            <button onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} title="Scroll to top" style={scrollNavBtnStyle}>
              <ChevronUp size={18} />
            </button>
          )}
          <button onClick={() => { const el = scrollContainerRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }} title="Scroll to bottom" style={scrollNavBtnStyle}>
            <ChevronDown size={18} />
          </button>
        </div>
      )}

      {/* ─── Selection mode bar ────────────────────────────────────────────── */}
      {selectionMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <button onClick={exitSelectionMode} style={{ ...selActionBtnStyle, gap: 6, paddingLeft: 0 }}>
            <X size={16} /><span style={{ fontSize: 13 }}>Cancel</span>
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {selectedIds.size === 0 ? 'Select messages' : `${selectedIds.size} selected`}
          </span>
        </div>
      )}

      {/* ─── Upload progress ────────────────────────────────────────────────── */}
      {isUploading && (
        <div style={{ padding: '8px 20px', backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 4, backgroundColor: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${uploadProgress}%`, backgroundColor: 'var(--accent)', transition: 'width 0.2s' }} />
          </div>
          <span>{uploadProgress}%</span>
        </div>
      )}

      {/* ─── Edit message bar ─────────────────────────────────────────────── */}
      {editingMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', flexShrink: 0 }}>
          <Pencil size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>Edit message</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {editingMsg.content || `[${editingMsg.type}]`}
            </div>
          </div>
          <button onClick={() => { setEditingMsg(null); setInputText(''); }} style={{ ...iconBtnStyle, width: 24, height: 24, flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── Reply preview bar ───────────────────────────────────────────────── */}
      {replyingTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', flexShrink: 0 }}>
          <CornerUpLeft size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
              Replying to {replyingTo.senderName || 'message'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {replyingTo.type !== 'text' && !replyingTo.content ? `[${replyingTo.type}]` : replyingTo.content || `[${replyingTo.type}]`}
            </div>
          </div>
          <button onClick={() => setReplyingTo(null)} style={{ ...iconBtnStyle, width: 24, height: 24, flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── Input area ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 16px',
          borderTop: (replyingTo || editingMsg) ? 'none' : '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', flexShrink: 0,
        }}
      >
        <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
        <button onClick={() => fileInputRef.current?.click()} style={inputAreaBtnStyle} title="Attach file">
          <Paperclip size={20} />
        </button>
        <textarea
          ref={inputRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a note..."
          rows={1}
          style={{
            flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)',
            resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
            maxHeight: 120, overflowY: 'auto',
          }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = Math.min(t.scrollHeight, 120) + 'px';
          }}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          title="Send"
          style={{
            ...inputAreaBtnStyle,
            backgroundColor: inputText.trim() ? 'var(--accent)' : 'var(--border)',
            color: '#fff', borderRadius: 10, padding: 10,
            cursor: inputText.trim() ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.15s',
          }}
        >
          <Send size={16} />
        </button>
      </div>

      {/* ─── Forward to chat modal ────────────────────────────────────────────── */}
      {forwardingMsgs.length > 0 && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setForwardingMsgs([]); setForwardTargetIds(new Set()); } }}
        >
          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, width: 360, maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>
                Forward {forwardingMsgs.length > 1 ? `${forwardingMsgs.length} messages` : 'message'} to chat
              </span>
              <button onClick={() => { setForwardingMsgs([]); setForwardTargetIds(new Set()); }} style={iconBtnStyle} title="Close">
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '6px 10px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {forwardingMsgs.length === 1
                ? (forwardingMsgs[0].type !== 'text' && !forwardingMsgs[0].content ? `[${forwardingMsgs[0].type}]` : forwardingMsgs[0].content || `[${forwardingMsgs[0].type}]`)
                : forwardingMsgs.map((m) => m.content || `[${m.type}]`).join(' · ')}
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {chats.map((c) => {
                const otherUid = c.type === 'private' ? c.members.find((m) => m !== currentUid) : null;
                const profile = otherUid ? userProfiles[otherUid] : null;
                const name = profile?.name || c.chatId;
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
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, background: checked ? 'var(--bg-active)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)', fontSize: 14 }}
                    onMouseEnter={(e) => { if (!checked) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-tertiary)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = checked ? 'var(--bg-active)' : 'transparent'; }}
                  >
                    <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, backgroundColor: checked ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
              {chats.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)', fontSize: 13 }}>No chats available</div>
              )}
            </div>
            <button
              onClick={() => handleForwardTo([...forwardTargetIds])}
              disabled={forwardTargetIds.size === 0}
              style={{ padding: '10px 0', borderRadius: 8, border: 'none', backgroundColor: forwardTargetIds.size > 0 ? 'var(--accent)' : 'var(--border)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: forwardTargetIds.size > 0 ? 'pointer' : 'not-allowed', transition: 'background-color 0.15s' }}
            >
              Forward{forwardTargetIds.size > 0 ? ` to ${forwardTargetIds.size} chat${forwardTargetIds.size > 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookmarksPage;

