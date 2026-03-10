import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
// crypto.randomUUID() is available in Electron/Chromium without polyfill
const genId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import MessageBubble from '../components/MessageBubble';
import TypingIndicator from '../components/TypingIndicator';
import UserAvatar from '../components/UserAvatar';
import { listenToMessages } from '../services/firebaseService';
import { sendMessage, sendTyping, sendLiveTyping, sendReadReceipt, joinChatRoom, leaveChatRoom } from '../services/socketService';
import { uploadChatFile, getMessageTypeFromMime, validateFile } from '../services/fileService';
import { markChatRead, getChatMessages, deleteMessage as deleteMessageApi, editMessage as editMessageApi, pinMessage as pinMessageApi, unpinMessage as unpinMessageApi, deleteChat as deleteChatApi } from '../services/apiService';
import { Message } from '@shared/types';
import { useCallContext } from '../context/CallContext';
import { APP_CONFIG } from '@shared/constants/config';
import { useUIStore } from '../store/uiStore';
import { useCallStore } from '../store/callStore';
import { useBookmarkStore } from '../store/bookmarkStore';
import { MessageCircle, Phone, Video, Paperclip, Send, ChevronLeft, Search, X, ChevronUp, ChevronDown, CornerUpLeft, Pin, PinOff, Archive, ArchiveRestore, CheckSquare, Trash2, Forward, Copy, MoreVertical, ExternalLink, Pencil, Bookmark, UserRound } from 'lucide-react';
import { formatTime } from '../utils/formatters';

interface ChatWindowProps {
  /** When provided (e.g. rendered in-call sidebar), skips useParams and disables nav. */
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
  const { messages, setMessages, activeChat, setActiveChat, typingUsers, userProfiles, onlineUsers, clearUnread, removeMessage, markMessageDeleted, updateMessage, liveTypingTexts, chats, updateChatPins, pinnedChatIds, togglePinChat, archivedChatIds, toggleArchiveChat, removeChat, nicknames, setNickname } =
    useChatStore();
  const { currentUser } = useAuthStore();
  const { startCall } = useCallContext();
  const { activeCall } = useCallStore();
  const isInCall = !!activeCall;
  const { liveTypingEnabled } = useUIStore();
  const { addBookmark, isBookmarked, removeBookmark } = useBookmarkStore();

  // When opened directly via URL (e.g. "open in new window"), activeChat won't be
  // set from a sidebar click.  Resolve it from the chats list as soon as it loads.
  useEffect(() => {
    if (!chatId) return;
    if (activeChat?.chatId === chatId) return;
    const found = chats.find((c) => c.chatId === chatId);
    if (found) setActiveChat(found);
  }, [chatId, chats, activeChat, setActiveChat]);

  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  // ─── Chat header three-dot menu ──────────────────────────────────────────
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showProfileMore, setShowProfileMore] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [chatConfirmDelete, setChatConfirmDelete] = useState<'me' | 'both' | null>(null);
  const [chatDeleting, setChatDeleting] = useState(false);

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

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which chatId we've already instant-scrolled to bottom for
  const lastScrolledChatRef = useRef<string>('');
  const isFetchingRef = useRef(false);

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
  const chatMessages = useMemo(() => {
    const olderFiltered = olderMessages.filter(
      (o) => !liveMsgs.some((l) => l.messageId === o.messageId),
    );
    return [...olderFiltered, ...liveMsgs];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [olderMessages, liveMsgs.length, deletedCount, editedSignature, readBySignature, chatId]);

  const typingList = typingUsers[chatId!] || [];
  const liveTexts = liveTypingTexts?.[chatId!] || [];

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

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Scroll to the active search match
  useEffect(() => {
    if (searchMatchIndices.length === 0) return;
    const targetIdx = searchMatchIndices[searchMatchIdx];
    const el = scrollContainerRef.current;
    if (!el) return;
    // Find the nth message element by data-msg-idx attribute
    const target = el.querySelector<HTMLElement>(`[data-msg-idx="${targetIdx}"]`);
    if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [searchMatchIdx, searchMatchIndices]);

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

    if (lastScrolledChatRef.current !== chatId) {
      // New chat opened (or first messages arrived) — instantly jump to bottom
      el.scrollTop = el.scrollHeight;
      lastScrolledChatRef.current = chatId;
    } else {
      // Same chat, new message — only auto-scroll if user is already near the bottom
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distFromBottom < 200) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [chatMessages.length, chatId]);

  // Also scroll when typing indicator appears/disappears
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 200) el.scrollTop = el.scrollHeight;
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
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;

    isFetchingRef.current = true;
    setIsLoadingMore(true);
    try {
      const res = await getChatMessages(chatId, 30, oldestTs);
      if (res.success && res.data && res.data.length > 0) {
        const uid = currentUser?.uid ?? '';
        const fetched = res.data.filter((m) => !(m.deletedFor ?? []).includes(uid));
        setOlderMessages((prev) => {
          // Deduplicate against existing older messages
          const existing = new Set(prev.map((m) => m.messageId));
          const newOnes = fetched.filter((m) => !existing.has(m.messageId));
          return [...newOnes, ...prev];
        });
        // Restore scroll position so the view doesn't jump
        requestAnimationFrame(() => {
          if (el) el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
        });
        if (fetched.length < 30) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('[Pagination] Failed to load older messages:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [chatId, hasMore, olderMessages, messages, currentUid, currentUser]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Pagination trigger
    if (!isFetchingRef.current && hasMore && el.scrollTop < 120) loadOlderMessages();
    // Show/hide scroll nav arrows
    setShowScrollTop(el.scrollTop > 200);
    setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  }, [loadOlderMessages, hasMore]);

  // ─── Get peer info for private chat header ────────────────────────────────
  const peerInfo = useCallback(() => {
    if (!activeChat || activeChat.type !== 'private') return null;
    const isSelfChat = activeChat.members.every((m) => m === currentUser?.uid);
    const peerId = isSelfChat
      ? currentUser?.uid
      : activeChat.members.find((m) => m !== currentUser?.uid);
    if (!peerId) return null;
    const peerProfile = userProfiles[peerId];
    const isPeerVisible = peerProfile?.showActiveStatus !== false;
    const isSelfVisible = currentUser?.showActiveStatus !== false;
    return {
      uid: peerId,
      isSelf: isSelfChat,
      profile: peerProfile,
      online: !isSelfChat && onlineUsers.has(peerId) && isPeerVisible && isSelfVisible,
    };
  }, [activeChat, currentUser, userProfiles, onlineUsers]);

  const peer = peerInfo();

  // ─── Typing indicator ─────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputText(value);

    if (!chatId || !currentUser) return;

    sendTyping(chatId, true, currentUser.name);
    if (liveTypingEnabled) sendLiveTyping(chatId, value, currentUser.name);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(chatId, false, currentUser.name);
      if (liveTypingEnabled) sendLiveTyping(chatId, '', currentUser.name);
    }, APP_CONFIG.TYPING_TIMEOUT_MS);
  };

  // ─── Send text message ────────────────────────────────────────────────────
  const handleSend = () => {
    if (!inputText.trim() || !chatId || !currentUser) return;

    // ── Edit mode: save the edit instead of sending a new message ────────
    if (editingMsg) {
      if (inputText.trim() !== editingMsg.content) {
        handleEditMessage(editingMsg.messageId, inputText.trim());
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
      content: inputText.trim(),
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
      content: inputText.trim(),
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

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping(chatId, false, currentUser.name);
    if (liveTypingEnabled) sendLiveTyping(chatId, '', currentUser.name);
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
    return otherUid ? userProfiles[otherUid]?.name : undefined;
  }, [activeChat, currentUser, userProfiles]);

  const handleBookmarkMessage = useCallback((message: Message) => {
    if (isBookmarked(message.messageId)) {
      removeBookmark(message.messageId);
    } else {
      addBookmark(message, getActiveChatName());
    }
  }, [isBookmarked, addBookmark, removeBookmark, getActiveChatName]);

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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── File upload ──────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatId) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    try {
      setIsUploading(true);
      const result = await uploadChatFile(file, chatId, (progress) => {
        setUploadProgress(Math.round(progress));
      });

      const msgType = getMessageTypeFromMime(file.type);
      sendMessage({
        chatId,
        content: `Sent a ${msgType}`,
        type: msgType,
        fileUrl: result.url,
        fileName: result.fileName,
        fileSize: result.fileSize,
      });
    } catch (err) {
      console.error('[Upload] Failed:', err);
      alert('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── Delete message ─────────────────────────────────────────────────────
  const handleDeleteMessage = useCallback(
    async (messageId: string, scope: 'me' | 'both') => {
      if (!chatId) return;
      try {
        await deleteMessageApi(chatId, messageId, scope);
        if (scope === 'me') {
          removeMessage(chatId, messageId);
        } else {
          markMessageDeleted(chatId, messageId);
        }
      } catch (err) {
        console.error('[deleteMessage] Failed:', err);
      }
    },
    [chatId, removeMessage, markMessageDeleted],
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

  const toggleSelectMessage = useCallback((messageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId); else next.add(messageId);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(async (scope: 'me' | 'both') => {
    if (!chatId) return;
    for (const id of selectedIds) {
      await handleDeleteMessage(id, scope);
    }
    exitSelectionMode();
  }, [chatId, selectedIds, handleDeleteMessage, exitSelectionMode]);

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
      updateMessage(messageId, { content: newContent, isEdited: true });
      try {
        await editMessageApi(chatId, messageId, newContent);
      } catch (err) {
        console.error('[editMessage] Failed:', err);
      }
    },
    [chatId, updateMessage],
  );
  // ─── Start call ──────────────────────────────────────────────────────────
  const handleStartCall = async (type: 'video' | 'voice') => {
    if (!peer) return;
    // In Electron mode the call window captures its own stream; no pre-capture needed.
    // In non-Electron fallback the stream is captured inside startCall() itself.
    startCall(peer.uid, peer.profile?.name || 'User', type, peer.profile?.avatar);
  };

  if (!activeChat) {
    // If we have a chatId target (popup/direct link) but chats haven't loaded yet,
    // show a loading spinner instead of the "select a chat" placeholder.
    if (chatId) {
      return (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 12,
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--accent, #6366f1)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      );
    }
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
          color: 'var(--text-secondary)',
        }}
      >
        <MessageCircle size={64} style={{ color: 'var(--text-secondary)' }} />
        <p style={{ fontSize: 18 }}>Select a chat to start messaging</p>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
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
              onClick={() => setShowProfile((v) => !v)}
              title="View profile"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', borderRadius: '50%' }}
            >
              <UserAvatar
                name={peer.profile?.name || currentUser?.name || 'User'}
                avatar={peer.profile?.avatar || currentUser?.avatar}
                size={40}
                online={peer.online}
              />
            </button>
            <button
              onClick={() => setShowProfile((v) => !v)}
              title="View profile"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {peer.isSelf
                  ? (peer.profile?.name || currentUser?.name || 'You')
                  : (nicknames[peer.uid] || peer.profile?.name || 'User')}
                {peer.isSelf && (
                  <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--accent)' }}>(You)</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: peer.isSelf ? 'var(--text-secondary)' : (peer.online ? '#22c55e' : 'var(--text-secondary)') }}>
                {peer.isSelf ? 'Message yourself' : (peer.online ? 'Online' : 'Offline')}
              </div>
            </button>
          </>
        ) : (
          <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>
            Group Chat
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {activeChat.type === 'private' && (
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
                  onClick={() => { setHeaderMenu(null); setShowProfile(true); }}
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
                onClick={() => { setHeaderMenu(null); handleDeleteChat('me'); }}
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
                {userProfiles[current.senderId]?.name || current.senderName || 'Unknown'}
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
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 0',
          display: 'flex',
          flexDirection: 'column',
          userSelect: selectionMode ? 'none' : undefined,
        }}
      >
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
        {chatMessages.map((msg, idx) => {
          const prevMsg = chatMessages[idx - 1];
          const showDatePill =
            !prevMsg ||
            getDateKey(msg.timestamp) !== getDateKey(prevMsg.timestamp);
          const isSearchMatch = searchMatchIndices.includes(idx);
          const isActiveMatch = searchMatchIndices[searchMatchIdx] === idx;
          return (
            <React.Fragment key={msg.messageId}>
              {showDatePill && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '10px 0 6px',
                  }}
                >
                  <span
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 12px',
                      borderRadius: 20,
                      border: '1px solid var(--border)',
                      letterSpacing: '0.03em',
                      userSelect: 'none',
                    }}
                  >
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
                      flexShrink: 0,
                      width: 36,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      paddingLeft: 8,
                    }}
                  >
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: `2px solid ${selectedIds.has(msg.messageId) ? 'var(--accent)' : 'var(--border)'}`,
                      backgroundColor: selectedIds.has(msg.messageId) ? 'var(--accent)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s',
                      flexShrink: 0,
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
                  senderName={userProfiles[msg.senderId]?.name}
                  senderAvatar={userProfiles[msg.senderId]?.avatar}
                  showSender={activeChat.type === 'group'}
                  onDelete={selectionMode ? undefined : handleDeleteMessage}
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
                  isPinned={(activeChat.pinnedMessageIds ?? []).includes(msg.messageId)}
                  onScrollToMessage={handleScrollToMessage}
                  onCloseChat={selectionMode ? undefined : (() => { setActiveChat(null); navigate('/chats'); })}
                  onEnterSelect={selectionMode ? undefined : enterSelectionMode}
                  searchQuery={isSearchMatch ? searchQuery : undefined}
                  isActiveSearchMatch={isActiveMatch}
                  isHighlighted={highlightedMsgId === msg.messageId}
                  currentUserShowMessageStatus={currentUser?.showMessageStatus !== false}
                  otherUserShowMessageStatus={(() => {
                    const otherUserId = msg.senderId === currentUser?.uid 
                      ? activeChat.members.find(m => m !== currentUser?.uid) 
                      : msg.senderId;
                    return otherUserId ? userProfiles[otherUserId]?.showMessageStatus !== false : true;
                  })()}
                />
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <TypingIndicator
          users={typingList.filter((u) => u.userId !== currentUser?.uid)}
          liveTexts={liveTexts}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Scroll navigation arrows ──────────────────────────────────── */}
      {/* ─── Scroll navigation arrows (only when user has scrolled up) ──── */}
      {showScrollBottom && (
        <div
          style={{
            position: 'absolute',
            right: 16,
            bottom: 90,
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

      {/* ─── Selection mode bar (count + cancel) ────────────────────────── */}
      {selectionMode && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 14px',
          borderTop: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
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

      {/* Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          padding: '12px 16px',
          borderTop: (replyingTo || editingMsg) ? 'none' : '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
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
        <textarea
          ref={inputRef}
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Write a message..."
          rows={1}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 20,
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: 14,
            outline: 'none',
            resize: 'none',
            maxHeight: 120,
            overflowY: 'auto',
            lineHeight: 1.5,
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || isUploading}
          style={{
            ...iconBtnStyle,
            backgroundColor: inputText.trim() ? 'var(--accent)' : 'var(--border)',
            color: '#fff',
            borderRadius: '50%',
            width: 40,
            height: 40,
            flexShrink: 0,
            fontSize: 16,
            transition: 'background-color 0.2s',
          }}
          title="Send"
        >
          <Send size={16} />
        </button>
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
          }}
        >
          {/* Close button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>Profile</span>
            <button
              onClick={() => setShowProfile(false)}
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
                    {peer.isSelf
                      ? (peer.profile?.name || currentUser?.name || 'You')
                      : (nicknames[peer.uid] || peer.profile?.name || 'User')}
                  </span>
                  {peer.isSelf && <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--accent)', marginLeft: 6 }}>(You)</span>}
                  {!peer.isSelf && (
                    <button
                      onClick={() => { setNicknameInput(nicknames[peer.uid] || ''); setEditingNickname(true); }}
                      title="Edit nickname"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 2, display: 'flex', alignItems: 'center', opacity: 0.6 }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  )}
                  {!peer.isSelf && nicknames[peer.uid] && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>({peer.profile?.name})</span>
                  )}
                </div>
              )}
              <div style={{ fontSize: 13, color: peer.online ? '#22c55e' : 'var(--text-secondary)', fontWeight: 500 }}>
                {peer.isSelf
                  ? 'Your saved messages'
                  : peer.online
                    ? '● Online'
                    : `Last seen ${formatTime(peer.profile?.lastSeen || '')}`}
              </div>
            </div>
          </div>

          

          {/* Actions */}
          {!peer.isSelf && (
            <div style={{ margin: '0 16px 16px', position: 'relative' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {/* Message */}
                <button
                  onClick={() => setShowProfile(false)}
                  title="Message"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--accent)', fontSize: 11, fontWeight: 500 }}
                >
                  <MessageCircle size={20} />
                  <span>Message</span>
                </button>
                {/* Voice call */}
                <button
                  onClick={() => { if (!isInCall) { setShowProfile(false); handleStartCall('voice'); } }}
                  title={isInCall ? 'Already in a call' : 'Voice call'}
                  disabled={isInCall}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, cursor: isInCall ? 'not-allowed' : 'pointer', color: isInCall ? 'var(--text-secondary)' : 'var(--accent)', fontSize: 11, fontWeight: 500, opacity: isInCall ? 0.45 : 1 }}
                >
                  <Phone size={20} />
                  <span>Call</span>
                </button>
                {/* Video call */}
                <button
                  onClick={() => { if (!isInCall) { setShowProfile(false); handleStartCall('video'); } }}
                  title={isInCall ? 'Already in a call' : 'Video call'}
                  disabled={isInCall}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, cursor: isInCall ? 'not-allowed' : 'pointer', color: isInCall ? 'var(--text-secondary)' : 'var(--accent)', fontSize: 11, fontWeight: 500, opacity: isInCall ? 0.45 : 1 }}
                >
                  <Video size={20} />
                  <span>Video</span>
                </button>
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
                        onClick={() => { toggleArchiveChat(activeChat.chatId); setShowProfileMore(false); navigate('/chats'); }}
                        style={headerCtxItemStyle}
                      >
                        {archivedChatIds.includes(activeChat.chatId)
                          ? <><ArchiveRestore size={14} style={{ marginRight: 8 }} />Unarchive chat</>
                          : <><Archive size={14} style={{ marginRight: 8 }} />Archive chat</>}
                      </button>
                      <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '2px 0' }} />
                      <button
                        onClick={() => { setShowProfileMore(false); handleDeleteChat('me'); }}
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
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>Name</div>
              <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                {peer.profile?.name || 'Unknown'}
              </div>
            </div>
            
            {/* Username (only show if user has one) */}
            {peer.profile?.username && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>Username</div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                  @{peer.profile.username}
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

          {/* Username / email */}
          {peer && (peer.profile?.name || peer.profile?.email) && (
            <div style={{ margin: '0 16px 16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {peer.profile?.name && (
                <div style={{ padding: '12px 16px', borderBottom: peer.profile?.email ? '1px solid var(--border)' : undefined }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>Username</div>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{peer.profile.name}</div>
                </div>
              )}
              {peer.profile?.email && (
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>Email</div>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{peer.profile.email}</div>
                </div>
              )}
            </div>
          )}
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
                  const p = uid ? userProfiles[uid] : null;
                  const n = isSelf ? `${p?.name || 'you'} (you)` : (p?.name || c.chatId);
                  return n.toLowerCase().includes(q);
                })
                .map((c) => {
                  const isSelfChat = c.type === 'private' && c.members.every((m) => m === currentUid);
                  const otherUid = c.type === 'private' ? (isSelfChat ? currentUid : c.members.find((m) => m !== currentUid)) : null;
                  const profile = otherUid ? userProfiles[otherUid] : null;
                  const name = isSelfChat ? `${profile?.name || 'You'} (You)` : (profile?.name || c.chatId);
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
      {chatConfirmDelete === 'both' && (
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
            <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 17 }}>Delete for everyone?</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14 }}>
              This will permanently delete the chat and all messages for all participants. This action cannot be undone.
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
                onClick={() => handleDeleteChat('both')}
                disabled={chatDeleting}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, backgroundColor: 'var(--error, #e74c3c)', color: '#fff' }}
              >
                {chatDeleting ? 'Deleting…' : 'Delete for everyone'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Date separator helpers ──────────────────────────────────────────────────
const getDateKey = (timestamp: string): string => {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const formatDateLabel = (timestamp: string): string => {
  const d = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';

  // Within this year: show "Mon, Mar 7"
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  // Older: show "Mar 7, 2024"
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

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

export default ChatWindow;
