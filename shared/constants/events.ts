// ============================================================
// Socket Event Constants - Shared between client and server
// ============================================================

export const SOCKET_EVENTS = {
  // Client → Server
  SEND_MESSAGE: 'send_message',
  TYPING: 'typing',
  MESSAGE_READ: 'message_read',
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',

  // Client → Server (delivery ack: recipient notifies server when message received)
  DELIVER_ACK: 'deliver_ack',

  // Server → Client
  NEW_MESSAGE: 'new_message',
  USER_TYPING: 'user_typing',
  MESSAGE_DELIVERED: 'message_delivered',
  MESSAGE_READ_RECEIPT: 'message_read_receipt',

  // Presence
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  HEARTBEAT: 'heartbeat',

  // Call signaling
  CALL_USER: 'call_user',
  INCOMING_CALL: 'incoming_call',
  ACCEPT_CALL: 'accept_call',
  REJECT_CALL: 'reject_call',
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice_candidate',
  END_CALL: 'end_call',
  CALL_ENDED: 'call_ended',
  CALL_REJECTED: 'call_rejected',
  CALL_MUTE_CHANGED: 'call_mute_changed',
  CALL_VIDEO_CHANGED: 'call_video_changed',
  CALL_RINGING: 'call_ringing',
  ACTIVE_STATUS_CHANGED: 'active_status_changed',
  MESSAGE_STATUS_CHANGED: 'message_status_changed',

  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  RECONNECT: 'reconnect',
  ERROR: 'error',

  // Chat management
  CHAT_DELETED: 'chat_deleted',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_EDITED: 'message_edited',
  PINS_UPDATED: 'pins_updated',
  USER_UPDATED: 'user_updated',

  // Live typing preview
  LIVE_TYPING: 'live_typing',
  LIVE_TYPING_UPDATE: 'live_typing_update',

  // Live theme preview
  THEME_PREVIEW: 'theme_preview',
  PEER_THEME_PREVIEW: 'peer_theme_preview',

  // Saved Messages / Bookmarks sync (per-user)
  SAVED_MESSAGE_UPDATED: 'saved_message_updated',

  // Message reactions (Telegram-style)
  REACTION_ADDED:   'reaction_added',    // client → server: { messageId, chatId, emoji }
  REACTION_REMOVED: 'reaction_removed',  // client → server: { messageId, chatId, emoji }
  REACTION_UPDATED: 'reaction_updated',  // server → client: { messageId, chatId, reactions }

  // Device session management
  SESSION_REVOKED: 'session_revoked',
  FORCE_LOGOUT: 'force_logout',

  // Draft messages (cross-device sync)
  DRAFT_UPDATED: 'draft_updated',
  DRAFT_DELETED: 'draft_deleted',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
