// ============================================================
// Shared Types - Used by both client and server
// ============================================================

export interface User {
  uid: string;
  name: string;
  username?: string; // unique username for @mentions and profile URLs
  email: string;
  avatar: string;
  createdAt: string;
  lastSeen: string;
  onlineStatus: 'online' | 'offline' | 'away';
  showActiveStatus?: boolean; // if false, hides online dot from others (mutual: both must enable to see each other)
  showMessageStatus?: boolean; // if false, hides message delivery/read receipts (mutual: both must enable to see each other's status)
  pinnedChatIds?: string[]; // chats pinned by this user (synced across devices)
  archivedChatIds?: string[]; // chats archived by this user (synced across devices)
  nicknames?: Record<string, string>; // custom display names for other users, keyed by uid
}

export interface DeviceSession {
  sessionId: string;
  uid: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'web';
  ipAddress: string;
  locationCountry?: string;
  locationCity?: string;
  locationRegion?: string;
  userAgent: string;
  firebaseTokenId: string;
  createdAt: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface Message {
  messageId: string;
  chatId: string;
  senderId: string;
  mirrored?: boolean;
  senderName?: string;
  senderAvatar?: string;
  content: string;
  type: 'text' | 'file' | 'image' | 'video' | 'audio' | 'call' | 'gif' | 'sticker' | 'voice_note' | 'video_note';
  timestamp: string;
  readBy: string[];
  deliveredTo?: string[];  // UIDs whose device has received the message
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  encrypted?: boolean;
  deleted?: boolean;          // true = deleted for everyone (shows placeholder)
  deletedFor?: string[];     // UIDs who deleted this for themselves only
  isEdited?: boolean;        // true when the sender has edited the message
  forwarded?: boolean;       // true when this message was forwarded from another chat
  replyTo?: {               // quoted message this is a reply to
    messageId: string;
    senderId: string;
    senderName?: string;
    content: string;
    type: string;
    fileUrl?: string;
    fileName?: string;
  };
  callType?: 'voice' | 'video';  // populated when type === 'call'
  callDuration?: number;         // seconds, 0 = missed/cancelled
  callStatus?: 'completed' | 'missed' | 'cancelled' | 'no_answer' | 'declined'; // sender's view
  callStatusReceiver?: 'completed' | 'missed' | 'cancelled' | 'no_answer' | 'declined'; // receiver's view
  reactions?: Record<string, string[]>; // emoji → array of userIds who reacted
  duration?: number;         // seconds, for voice/video notes or calls
}

// Saved Messages / Bookmarks (stored per-user, synced across devices)
export interface SavedMessage extends Message {
  isNote?: boolean;        // true = typed by user directly in saved messages
  sourceChatName?: string; // from which chat this was bookmarked
  savedAt: string;
  pinnedInSaved?: boolean;
  updatedAt?: string;      // used for cross-device conflict resolution
}

export interface Chat {
  chatId: string;
  type: 'private' | 'group';
  members: string[];
  createdAt: string;
  lastMessage?: Message;
  lastMessageAt?: string;
  unreadCount?: number;
  pinnedMessageIds?: string[]; // up to 5 pinned message IDs
}

export interface Group {
  groupId: string;
  name: string;
  avatar: string;
  members: string[];
  admins: string[];
  createdAt: string;
  description?: string;
}

export interface CallSession {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  receiverId: string;
  receiverName?: string;
  receiverAvatar?: string;
  type: 'video' | 'voice';
  status: 'ringing' | 'active' | 'ended' | 'rejected' | 'missed';
  startedAt?: string;
  endedAt?: string;
}

export interface TypingEvent {
  chatId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

export interface PresenceEvent {
  userId: string;
  status: 'online' | 'offline';
  lastSeen?: string;
}

export interface SignalingData {
  type: 'offer' | 'answer' | 'ice_candidate';
  data: { type?: string; sdp?: string } | { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null };
  callId: string;
  from: string;
  to: string;
}

export interface Notification {
  id: string;
  type: 'message' | 'call' | 'missed_call' | 'file';
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
