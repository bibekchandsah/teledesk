import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../services/socketService';
import { SOCKET_EVENTS } from '@shared/constants/events';
import { useChatStore } from '../store/chatStore';
import { useCallStore } from '../store/callStore';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { showNotification } from '../services/notificationService';
import { Message } from '@shared/types';

interface SocketContextValue {
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ isConnected: false });

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addMessage, setTyping, setLiveTypingText, setUserOnline, setUserShowActiveStatus, updateChatLastMessage, incrementUnread, removeChat, markMessageDeleted, updateMessage, updateChatPins, activeChat } =
    useChatStore();
  const { setIncomingCall } = useCallStore();
  const { currentUser } = useAuthStore();
  const { liveTypingEnabled } = useUIStore();
  const navigate = useNavigate();
  const isConnectedRef = useRef(false);

  useEffect(() => {
    if (!currentUser) return;

    const socket = getSocket();
    if (!socket) return;

    // ─── Message Events ──────────────────────────────────────────────────
    const handleNewMessage = (message: Message) => {
      addMessage(message);
      updateChatLastMessage(message);

      // Notify if chat not active
      if (activeChat?.chatId !== message.chatId && message.senderId !== currentUser.uid) {
        incrementUnread(message.chatId);
        showNotification({
          title: message.senderName || 'New Message',
          body:
            message.type === 'text'
              ? (message.content || '').slice(0, 100)
              : `Sent a ${message.type}`,
          icon: message.senderAvatar,
        });
      }
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
      if (data.userId !== currentUser.uid && liveTypingEnabled) {
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

      showNotification({
        title: `Incoming ${data.callType} call`,
        body: `${data.callerName} is calling...`,
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
    socket.on(SOCKET_EVENTS.NEW_MESSAGE, handleNewMessage);
    socket.on(SOCKET_EVENTS.USER_TYPING, handleTyping);
    socket.on(SOCKET_EVENTS.LIVE_TYPING_UPDATE, handleLiveTyping);
    socket.on(SOCKET_EVENTS.USER_ONLINE, handleUserOnline);
    socket.on(SOCKET_EVENTS.USER_OFFLINE, handleUserOffline);
    socket.on(SOCKET_EVENTS.ACTIVE_STATUS_CHANGED, handleActiveStatusChanged);
    socket.on(SOCKET_EVENTS.INCOMING_CALL, handleIncomingCall);
    socket.on(SOCKET_EVENTS.CHAT_DELETED, handleChatDeleted);
    socket.on(SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
    socket.on(SOCKET_EVENTS.MESSAGE_EDITED, handleMessageEdited);
    socket.on(SOCKET_EVENTS.PINS_UPDATED, handlePinsUpdated);

    isConnectedRef.current = socket.connected;

    return () => {
      socket.off(SOCKET_EVENTS.NEW_MESSAGE, handleNewMessage);
      socket.off(SOCKET_EVENTS.USER_TYPING, handleTyping);
      socket.off(SOCKET_EVENTS.LIVE_TYPING_UPDATE, handleLiveTyping);
      socket.off(SOCKET_EVENTS.USER_ONLINE, handleUserOnline);
      socket.off(SOCKET_EVENTS.USER_OFFLINE, handleUserOffline);
      socket.off(SOCKET_EVENTS.ACTIVE_STATUS_CHANGED, handleActiveStatusChanged);
      socket.off(SOCKET_EVENTS.INCOMING_CALL, handleIncomingCall);
      socket.off(SOCKET_EVENTS.CHAT_DELETED, handleChatDeleted);
      socket.off(SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
      socket.off(SOCKET_EVENTS.MESSAGE_EDITED, handleMessageEdited);
      socket.off(SOCKET_EVENTS.PINS_UPDATED, handlePinsUpdated);
    };
  }, [currentUser, activeChat, liveTypingEnabled, addMessage, setTyping, setLiveTypingText, setUserOnline, setUserShowActiveStatus, updateChatLastMessage, incrementUnread, removeChat, markMessageDeleted, updateMessage, updateChatPins, setIncomingCall, navigate]);

  return (
    <SocketContext.Provider value={{ isConnected: isConnectedRef.current }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocketContext = (): SocketContextValue => useContext(SocketContext);
