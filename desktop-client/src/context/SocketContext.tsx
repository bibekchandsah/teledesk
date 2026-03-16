import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, sendMessage } from '../services/socketService';
import { SOCKET_EVENTS } from '@shared/constants/events';
import { useChatStore } from '../store/chatStore';
import { useCallStore } from '../store/callStore';
import { useAuthStore } from '../store/authStore';
import { useAuth } from './AuthContext';
import { useUIStore } from '../store/uiStore';
import { showNotification } from '../services/notificationService';
import { Message, SavedMessage, User } from '@shared/types';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useDraftStore } from '../store/draftStore';

interface SocketContextValue {
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ isConnected: false });

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addMessage, setTyping, setLiveTypingText, setUserOnline, setUserProfile, setUserShowActiveStatus, setUserShowMessageStatus, updateChatLastMessage, incrementUnread, removeChat, markMessageDeleted, updateMessage, updateChatPins, markChatMessagesRead, markMessageDelivered, activeChat, nicknames } =
    useChatStore();
  // const { setIncomingCall } = useCallStore();
  const { setIncomingCall, setIsCallInPopup } = useCallStore();
  const { currentUser } = useAuthStore();
  const { logout } = useAuth();
  const { liveTypingEnabled } = useUIStore();
  const navigate = useNavigate();
  const isConnectedRef = useRef(false);

  // Use a ref so socket handlers always read the latest activeChat
  // without needing to re-register on every navigation
  const activeChatRef = useRef(activeChat);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  const liveTypingRef = useRef(liveTypingEnabled);
  useEffect(() => { liveTypingRef.current = liveTypingEnabled; }, [liveTypingEnabled]);

  // Deduplicate messages received via both chat-room and personal-room broadcasts
  const processedMsgIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser) return;

    const socket = getSocket();
    if (!socket) return;

    // ─── Message Events ──────────────────────────────────────────────────
    const handleNewMessage = async (message: Message) => {
      // Deduplicate: backend emits to both chat room + personal room
      if (processedMsgIds.current.has(message.messageId)) return;
      processedMsgIds.current.add(message.messageId);
      // Keep the set bounded so it doesn't grow forever
      if (processedMsgIds.current.size > 500) {
        const first = processedMsgIds.current.values().next().value;
        if (first) processedMsgIds.current.delete(first);
      }

      // Check if chat exists in local store
      const { chats, setChats, setUserProfile, userProfiles } = useChatStore.getState();
      const chatExists = chats.some(c => c.chatId === message.chatId);
      
      // If chat doesn't exist locally, fetch it from backend
      if (!chatExists) {
        try {
          const { getChats, getUserById } = await import('../services/apiService');
          const result = await getChats();
          if (result.success && result.data) {
            setChats(result.data);
          }
          
          // Also fetch the sender's profile if we don't have it
          if (message.senderId && !userProfiles[message.senderId]) {
            const userResult = await getUserById(message.senderId);
            if (userResult.success && userResult.data) {
              setUserProfile(userResult.data);
            }
          }
        } catch (error) {
          console.error('Failed to fetch chats or user profile:', error);
        }
      }

      addMessage(message);
      updateChatLastMessage(message);

      // Acknowledge delivery back to server so the sender sees double tick
      // immediately, regardless of whether the server's onlineUsers map had
      // this client registered at the moment the message was sent.
      if (message.senderId !== currentUser.uid) {
        socket.emit(SOCKET_EVENTS.DELIVER_ACK, {
          chatId: message.chatId,
          messageId: message.messageId,
          senderId: message.senderId,
        });
      }

      if (message.senderId === currentUser.uid) return;

      // Window is minimized/hidden or the message is for a different chat
      const windowHidden = document.hidden || !document.hasFocus();
      const differentChat = activeChatRef.current?.chatId !== message.chatId;

      if (differentChat || windowHidden) {
        incrementUnread(message.chatId);
        
        // Helper function to hide spoiler content in notifications
        const hideSpoilers = (text: string): string => {
          return text.replace(/\|\|[\s\S]+?\|\|/g, (match) => {
            // Replace spoiler content with colons (same length as the spoiler markers + content)
            return ':'.repeat(Math.max(20, match.length));
          });
        };
        
        showNotification({
          title: nicknames[message.senderId] || message.senderName || 'New Message',
          body:
            message.type === 'text'
              ? hideSpoilers((message.content || '').slice(0, 100))
              : message.type === 'gif'
              ? 'Sent a GIF'
              : message.type === 'sticker'
              ? 'Sent a Sticker'
              : message.type === 'image'
              ? 'Sent an image'
              : message.type === 'video'
              ? 'Sent a video'
              : message.type === 'audio'
              ? 'Sent an audio message'
              : message.type === 'file'
              ? `Sent a file: ${message.fileName || 'document'}`
              : `Sent a ${message.type}`,
          icon: (message.senderAvatar && message.senderAvatar.trim()) || `https://ui-avatars.com/api/?name=${encodeURIComponent(nicknames[message.senderId] || message.senderName || 'U')}&background=6366f1&color=fff`,
          chatId: message.chatId,
        });
      }
    };

    // ─── Read Receipt (sender learns recipient opened the chat) ────────────
    const handleReadReceipt = (data: { chatId: string; userId: string }) => {
      markChatMessagesRead(data.chatId, data.userId);
    };

    // ─── Delivery Receipt (sender learns recipient's device received the msg) ─
    const handleDelivered = (data: { chatId: string; messageId: string; userId: string }) => {
      markMessageDelivered(data.chatId, data.messageId, data.userId);
    };

    // ─── Typing Events ───────────────────────────────────────────────────
    const handleTyping = (data: {
      chatId: string;
      userId: string;
      userName: string;
      isTyping: boolean;
    }) => {
      if (data.userId !== currentUser.uid) {
        setTyping(data.chatId, data.userId, data.userName, data.isTyping);
      }
    };

    // ─── Live Typing Events ─────────────────────────────────────────────
    const handleLiveTyping = (data: {
      chatId: string;
      userId: string;
      userName: string;
      text: string;
    }) => {
      if (data.userId !== currentUser.uid && liveTypingRef.current) {
        setLiveTypingText(data.chatId, data.userId, data.userName, data.text);
      }
    };

    // ─── Presence Events ─────────────────────────────────────────────────
    const handleUserOnline = (data: { userId: string; showActiveStatus?: boolean }) => {
      setUserOnline(data.userId, true, data.showActiveStatus);
    };

    const handleUserOffline = (data: { userId: string }) => {
      setUserOnline(data.userId, false);
    };

    const handleActiveStatusChanged = (data: { userId: string; showActiveStatus: boolean }) => {
      setUserShowActiveStatus(data.userId, data.showActiveStatus);
    };

    const handleMessageStatusChanged = (data: { userId: string; showMessageStatus: boolean }) => {
      setUserShowMessageStatus(data.userId, data.showMessageStatus);
    };

    // ─── Incoming Call Event ─────────────────────────────────────────────
    const handleIncomingCall = (data: {
      callId: string;
      callerId: string;
      callerName: string;
      callerAvatar?: string;
      callType: 'video' | 'voice';
    }) => {
      setIncomingCall({
        callId: data.callId,
        callerId: data.callerId,
        callerName: data.callerName,
        callerAvatar: data.callerAvatar,
        receiverId: currentUser.uid,
        type: data.callType,
        status: 'ringing',
      });

      // In Electron: open a single merged call window for the incoming call
      if (window.electronAPI?.openCallWindow) {
        window.electronAPI.openCallWindow({
          callId: data.callId,
          callType: data.callType,
          isOutgoing: false,
          targetUserId: data.callerId,
          targetName: nicknames[data.callerId] || data.callerName,
          targetAvatar: data.callerAvatar,
        });
      }
    };

    // ─── Chat Deleted Event ──────────────────────────────────────────────
    const handleChatDeleted = ({ chatId }: { chatId: string }) => {
      if (activeChat?.chatId === chatId) {
        navigate('/chats');
      }
      removeChat(chatId);
    };

    // ─── Message Deleted Event ───────────────────────────────────────
    const handleMessageDeleted = ({ messageId, chatId }: { messageId: string; chatId: string }) => {
      markMessageDeleted(chatId, messageId);
    };
    // ─── Message Edited Event ───────────────────────────────────────────────
    const handleMessageEdited = ({ messageId, content }: { messageId: string; chatId: string; content: string }) => {
      updateMessage(messageId, { content, isEdited: true });
    };
    // ─── Pins Updated Event ────────────────────────────────────────────────
    const handlePinsUpdated = ({ chatId, pinnedMessageIds }: { chatId: string; pinnedMessageIds: string[] }) => {
      updateChatPins(chatId, pinnedMessageIds);
    };
    // ─── Reaction Updated Event ──────────────────────────────────────────────
    const handleReactionUpdated = (payload: { 
      messageId: string; 
      chatId: string; 
      reactions: Record<string, string[]>;
      readBy?: string[];
      reactorId?: string;
      reactorName?: string;
      reactorUsername?: string;
      reactorAvatar?: string;
      emoji?: string;
      senderId?: string;
      content?: string;
      timestamp?: string;
    }) => {
      const updates = { 
        reactions: payload.reactions,
        ...(payload.readBy && { readBy: payload.readBy })
      };
      updateMessage(payload.messageId, updates);

      // Explicitly update chat's last message to "bump" it in the sidebar
      if (payload.content) {
        updateChatLastMessage({
          messageId: payload.messageId,
          chatId: payload.chatId,
          content: payload.content,
          senderId: payload.senderId || '',
          timestamp: payload.timestamp || new Date().toISOString(),
          reactions: payload.reactions,
          readBy: payload.readBy || [],
          type: 'text' // fallback, most are text or image which both have content
        } as Message, new Date().toISOString());
      }

      // Window is minimized/hidden or the reaction is for a different chat
      const windowHidden = document.hidden || !document.hasFocus();
      const differentChat = activeChatRef.current?.chatId !== payload.chatId;

      // Increment unread if someone else reacted and user is not looking at it
      if (payload.reactorId && payload.reactorId !== currentUser.uid && (differentChat || windowHidden)) {
        incrementUnread(payload.chatId);
        
        // Only show notification if someone else reacted to current user's message
        if (payload.senderId === currentUser.uid) {
          const displayReactor = payload.reactorName || payload.reactorUsername || 'Someone';
          const reactorLabel = payload.reactorUsername ? `${displayReactor} | ${payload.reactorUsername}` : displayReactor;
          const contentSnippet = payload.content ? (payload.content.length > 30 ? payload.content.substring(0, 30) + '...' : payload.content) : 'messaage';
          
          showNotification({
            title: 'Message Reaction',
            body: `${reactorLabel} reacted ${payload.emoji} to: "${contentSnippet}"`,
            icon: (payload.reactorAvatar && payload.reactorAvatar.trim()) || `https://ui-avatars.com/api/?name=${encodeURIComponent(payload.reactorName || payload.reactorUsername || 'R')}&background=6366f1&color=fff`,
            chatId: payload.chatId,
          });
        }
      }
    };

    // ─── Saved Messages sync (other device updates) ───────────────────────
    const handleSavedMessageUpdated = (payload: { entry: SavedMessage }) => {
      if (!payload?.entry) return;
      useBookmarkStore.getState().applyRemoteEntry(payload.entry);
    };

    // ─── Session Management ──────────────────────────────────────────────────
    const handleSessionRevoked = (data: { sessionId: string; firebaseTokenId: string; message: string }) => {
      console.warn('Session revoked:', data.message);
      // Force logout from this device since the session was explicitly revoked
      logout(false);
      window.location.href = `/login?logout=true&revoked=true&message=${encodeURIComponent(data.message)}`;
    };

    const handleForceLogout = (data: { message: string; sessionId: string }) => {
      console.warn('Force logout:', data.message);
      // Force logout from this device
      logout(false);
      window.location.href = `/login?logout=true&revoked=true&message=${encodeURIComponent(data.message)}`;
    };

    const handleUserUpdated = (user: User) => {
      setUserProfile(user);
    };

    // ─── Draft sync (cross-device) ──────────────────────────────────────────
    const handleDraftUpdated = (draft: { chatId: string; content: string }) => {
      console.log('[Draft] Received draft update:', draft);
      useDraftStore.getState().setDraft(draft.chatId, draft.content);
    };

    const handleDraftDeleted = (data: { chatId: string }) => {
      console.log('[Draft] Received draft deletion:', data);
      useDraftStore.getState().clearDraft(data.chatId);
    };

    socket.on(SOCKET_EVENTS.NEW_MESSAGE, handleNewMessage);
    socket.on(SOCKET_EVENTS.MESSAGE_READ_RECEIPT, handleReadReceipt);
    socket.on(SOCKET_EVENTS.MESSAGE_DELIVERED, handleDelivered);
    socket.on(SOCKET_EVENTS.USER_TYPING, handleTyping);
    socket.on(SOCKET_EVENTS.LIVE_TYPING_UPDATE, handleLiveTyping);
    socket.on(SOCKET_EVENTS.USER_ONLINE, handleUserOnline);
    socket.on(SOCKET_EVENTS.USER_OFFLINE, handleUserOffline);
    socket.on(SOCKET_EVENTS.ACTIVE_STATUS_CHANGED, handleActiveStatusChanged);
    socket.on(SOCKET_EVENTS.MESSAGE_STATUS_CHANGED, handleMessageStatusChanged);
    socket.on(SOCKET_EVENTS.CHAT_DELETED, handleChatDeleted);
    socket.on(SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
    socket.on(SOCKET_EVENTS.MESSAGE_EDITED, handleMessageEdited);
    socket.on(SOCKET_EVENTS.PINS_UPDATED, handlePinsUpdated);
    socket.on(SOCKET_EVENTS.REACTION_UPDATED, handleReactionUpdated);
    socket.on(SOCKET_EVENTS.SAVED_MESSAGE_UPDATED, handleSavedMessageUpdated);
    socket.on(SOCKET_EVENTS.SESSION_REVOKED, handleSessionRevoked);
    socket.on(SOCKET_EVENTS.FORCE_LOGOUT, handleForceLogout);
    socket.on(SOCKET_EVENTS.USER_UPDATED, handleUserUpdated);
    socket.on(SOCKET_EVENTS.DRAFT_UPDATED, handleDraftUpdated);
    socket.on(SOCKET_EVENTS.DRAFT_DELETED, handleDraftDeleted);

    isConnectedRef.current = socket.connected;

    return () => {
      socket.off(SOCKET_EVENTS.NEW_MESSAGE, handleNewMessage);
      socket.off(SOCKET_EVENTS.MESSAGE_READ_RECEIPT, handleReadReceipt);
      socket.off(SOCKET_EVENTS.MESSAGE_DELIVERED, handleDelivered);
      socket.off(SOCKET_EVENTS.USER_TYPING, handleTyping);
      socket.off(SOCKET_EVENTS.LIVE_TYPING_UPDATE, handleLiveTyping);
      socket.off(SOCKET_EVENTS.USER_ONLINE, handleUserOnline);
      socket.off(SOCKET_EVENTS.USER_OFFLINE, handleUserOffline);
      socket.off(SOCKET_EVENTS.ACTIVE_STATUS_CHANGED, handleActiveStatusChanged);
      socket.off(SOCKET_EVENTS.MESSAGE_STATUS_CHANGED, handleMessageStatusChanged);
      socket.off(SOCKET_EVENTS.CHAT_DELETED, handleChatDeleted);
      socket.off(SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
      socket.off(SOCKET_EVENTS.MESSAGE_EDITED, handleMessageEdited);
      socket.off(SOCKET_EVENTS.PINS_UPDATED, handlePinsUpdated);
      socket.off(SOCKET_EVENTS.REACTION_UPDATED, handleReactionUpdated);
      socket.off(SOCKET_EVENTS.SAVED_MESSAGE_UPDATED, handleSavedMessageUpdated);
      socket.off(SOCKET_EVENTS.SESSION_REVOKED, handleSessionRevoked);
      socket.off(SOCKET_EVENTS.FORCE_LOGOUT, handleForceLogout);
      socket.off(SOCKET_EVENTS.USER_UPDATED, handleUserUpdated);
      socket.off(SOCKET_EVENTS.DRAFT_UPDATED, handleDraftUpdated);
      socket.off(SOCKET_EVENTS.DRAFT_DELETED, handleDraftDeleted);
    };
  }, [currentUser, addMessage, setTyping, setLiveTypingText, setUserOnline, setUserShowActiveStatus, setUserShowMessageStatus, updateChatLastMessage, incrementUnread, removeChat, markMessageDeleted, updateMessage, updateChatPins, markChatMessagesRead, markMessageDelivered, setIncomingCall, navigate, nicknames]);

  // ─── Notification reply (Electron only) ──────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.onNotificationReply) return;
    return window.electronAPI.onNotificationReply((chatId, text) => {
      if (!currentUser || !text.trim()) return;
      sendMessage({
        chatId,
        content: text.trim(),
        type: 'text',
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar ?? undefined,
      });
    });
  }, [currentUser]);

  return (
    <SocketContext.Provider value={{ isConnected: isConnectedRef.current }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocketContext = (): SocketContextValue => useContext(SocketContext);
