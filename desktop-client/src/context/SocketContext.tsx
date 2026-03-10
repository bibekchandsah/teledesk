import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, sendMessage } from '../services/socketService';
import { SOCKET_EVENTS } from '@shared/constants/events';
import { useChatStore } from '../store/chatStore';
import { useCallStore } from '../store/callStore';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { showNotification } from '../services/notificationService';
import { Message, SavedMessage } from '@shared/types';
import { useBookmarkStore } from '../store/bookmarkStore';

interface SocketContextValue {
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ isConnected: false });

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addMessage, setTyping, setLiveTypingText, setUserOnline, setUserShowActiveStatus, setUserShowMessageStatus, updateChatLastMessage, incrementUnread, removeChat, markMessageDeleted, updateMessage, updateChatPins, markChatMessagesRead, markMessageDelivered, activeChat, nicknames } =
    useChatStore();
  const { setIncomingCall } = useCallStore();
  const { currentUser } = useAuthStore();
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
    const handleNewMessage = (message: Message) => {
      // Deduplicate: backend emits to both chat room + personal room
      if (processedMsgIds.current.has(message.messageId)) return;
      processedMsgIds.current.add(message.messageId);
      // Keep the set bounded so it doesn't grow forever
      if (processedMsgIds.current.size > 500) {
        const first = processedMsgIds.current.values().next().value;
        if (first) processedMsgIds.current.delete(first);
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
        showNotification({
          title: nicknames[message.senderId] || message.senderName || 'New Message',
          body:
            message.type === 'text'
              ? (message.content || '').slice(0, 100)
              : `Sent a ${message.type}`,
          icon: message.senderAvatar,
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

      showNotification({
        title: `Incoming ${data.callType} call`,
        body: `${nicknames[data.callerId] || data.callerName} is calling...`,
        icon: data.callerAvatar,
      });
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

    // ─── Saved Messages sync (other device updates) ───────────────────────
    const handleSavedMessageUpdated = (payload: { entry: SavedMessage }) => {
      if (!payload?.entry) return;
      useBookmarkStore.getState().applyRemoteEntry(payload.entry);
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
    socket.on(SOCKET_EVENTS.INCOMING_CALL, handleIncomingCall);
    socket.on(SOCKET_EVENTS.CHAT_DELETED, handleChatDeleted);
    socket.on(SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
    socket.on(SOCKET_EVENTS.MESSAGE_EDITED, handleMessageEdited);
    socket.on(SOCKET_EVENTS.PINS_UPDATED, handlePinsUpdated);
    socket.on(SOCKET_EVENTS.SAVED_MESSAGE_UPDATED, handleSavedMessageUpdated);

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
      socket.off(SOCKET_EVENTS.INCOMING_CALL, handleIncomingCall);
      socket.off(SOCKET_EVENTS.CHAT_DELETED, handleChatDeleted);
      socket.off(SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
      socket.off(SOCKET_EVENTS.MESSAGE_EDITED, handleMessageEdited);
      socket.off(SOCKET_EVENTS.PINS_UPDATED, handlePinsUpdated);
      socket.off(SOCKET_EVENTS.SAVED_MESSAGE_UPDATED, handleSavedMessageUpdated);
    };
  }, [currentUser, addMessage, setTyping, setLiveTypingText, setUserOnline, setUserShowActiveStatus, setUserShowMessageStatus, updateChatLastMessage, incrementUnread, removeChat, markMessageDeleted, updateMessage, updateChatPins, markChatMessagesRead, markMessageDelivered, setIncomingCall, navigate]);

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
