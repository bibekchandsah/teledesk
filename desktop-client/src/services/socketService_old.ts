import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@shared/constants/events';
import { Message } from '@shared/types';
import { getSocketUrl } from '../utils/runtimeUrls';
import { APP_CONFIG } from '@shared/constants/config';
import { useChatStore } from '../store/chatStore';

let socket: Socket | null = null;
let reconnectAttempts = 0;

const SOCKET_URL = getSocketUrl();

// ─── Initialize Socket Connection ─────────────────────────────────────────
export const initSocket = (token: string): Socket => {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: APP_CONFIG.RECONNECT_ATTEMPTS,
    reconnectionDelay: APP_CONFIG.RECONNECT_DELAY_MS,
    reconnectionDelayMax: 10000,
    timeout: 20000,
    transports: ['websocket'],
  });

  socket.on(SOCKET_EVENTS.CONNECT, () => {
    console.log('[Socket] Connected:', socket?.id);
    reconnectAttempts = 0;
  });

  socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on(SOCKET_EVENTS.RECONNECT, (attempt) => {
    console.log('[Socket] Reconnected after', attempt, 'attempts');
    reconnectAttempts = 0;
  });

  socket.on('reconnect_attempt', (attempt) => {
    reconnectAttempts = attempt;
    console.log('[Socket] Reconnection attempt', attempt);
  });

  socket.on(SOCKET_EVENTS.ERROR, (err) => {
    console.error('[Socket] Error:', err);
  });

  // Heartbeat to keep presence alive
  setInterval(() => {
    if (socket?.connected) {
      socket.emit(SOCKET_EVENTS.HEARTBEAT);
    }
  }, APP_CONFIG.HEARTBEAT_INTERVAL_MS);

  return socket;
};

export const getSocket = (): Socket | null => socket;

export const disconnectSocket = (): void => {
  socket?.disconnect();
  socket = null;
  // Clear stale presence data so the new account starts with a clean slate
  useChatStore.getState().clearOnlineUsers();
};

// ─── Room Management ──────────────────────────────────────────────────────
export const joinChatRoom = (chatId: string): void => {
  socket?.emit(SOCKET_EVENTS.JOIN_ROOM, chatId);
};

export const leaveChatRoom = (chatId: string): void => {
  socket?.emit(SOCKET_EVENTS.LEAVE_ROOM, chatId);
};

// ─── Messaging ────────────────────────────────────────────────────────────
export const sendMessage = (payload: {
  messageId?: string;
  chatId: string;
  content: string;
  type: Message['type'];
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  senderName?: string;
  senderAvatar?: string;
  callType?: 'voice' | 'video';
  callDuration?: number;
  callStatus?: 'completed' | 'missed' | 'cancelled' | 'no_answer' | 'declined';
  callStatusReceiver?: 'completed' | 'missed' | 'cancelled' | 'no_answer' | 'declined';
  replyTo?: Message['replyTo'];
  duration?: number;
  mirrored?: boolean;
  forwarded?: boolean;
  groupId?: string;
}): void => {
  socket?.emit(SOCKET_EVENTS.SEND_MESSAGE, payload);
};

export const sendTyping = (chatId: string, isTyping: boolean, userName: string): void => {
  socket?.emit(SOCKET_EVENTS.TYPING, { chatId, isTyping, userName });
};

export const sendLiveTyping = (chatId: string, text: string, userName: string): void => {
  socket?.emit(SOCKET_EVENTS.LIVE_TYPING, { chatId, text, userName });
};

export const sendReadReceipt = (chatId: string, messageId: string): void => {
  socket?.emit(SOCKET_EVENTS.MESSAGE_READ, { chatId, messageId });
};

export const sendReaction = (messageId: string, chatId: string, emoji: string): void => {
  socket?.emit(SOCKET_EVENTS.REACTION_ADDED, { messageId, chatId, emoji });
};

export const removeReaction = (messageId: string, chatId: string, emoji: string): void => {
  socket?.emit(SOCKET_EVENTS.REACTION_REMOVED, { messageId, chatId, emoji });
};

// ─── Call Signaling ────────────────────────────────────────────────────────
export const callUser = (payload: {
  targetUserId: string;
  callType: 'video' | 'voice';
  callId: string;
  callerName: string;
  callerAvatar?: string;
}): void => {
  socket?.emit(SOCKET_EVENTS.CALL_USER, payload);
};

export const acceptCall = (callId: string, callerId: string): void => {
  socket?.emit(SOCKET_EVENTS.ACCEPT_CALL, { callId, callerId });
};

export const rejectCall = (callId: string, callerId: string): void => {
  socket?.emit(SOCKET_EVENTS.REJECT_CALL, { callId, callerId });
};

export const sendOffer = (to: string, callId: string, offer: { type?: string; sdp?: string }): void => {
  socket?.emit(SOCKET_EVENTS.OFFER, { to, callId, offer });
};

export const sendAnswer = (to: string, callId: string, answer: { type?: string; sdp?: string }): void => {
  socket?.emit(SOCKET_EVENTS.ANSWER, { to, callId, answer });
};

export const sendIceCandidate = (to: string, callId: string, candidate: { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null }): void => {
  socket?.emit(SOCKET_EVENTS.ICE_CANDIDATE, { to, callId, candidate });
};

export const endCall = (to: string, callId: string): void => {
  socket?.emit(SOCKET_EVENTS.END_CALL, { to, callId });
};

export const sendCallMuteChanged = (to: string, callId: string, isMuted: boolean): void => {
  socket?.emit(SOCKET_EVENTS.CALL_MUTE_CHANGED, { to, callId, isMuted });
};

export const sendCallVideoChanged = (to: string, callId: string, isVideoOff: boolean): void => {
  socket?.emit(SOCKET_EVENTS.CALL_VIDEO_CHANGED, { to, callId, isVideoOff });
};

/** Broadcast active-status visibility change to peers in real-time */
export const emitActiveStatusChange = (showActiveStatus: boolean): void => {
  socket?.emit(SOCKET_EVENTS.ACTIVE_STATUS_CHANGED, { showActiveStatus });
};

export const sendThemePreview = (chatId: string, theme: any): void => {
  socket?.emit(SOCKET_EVENTS.THEME_PREVIEW, { chatId, theme });
};

export { SOCKET_EVENTS };
