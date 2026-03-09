/**
 * Format a timestamp (ISO string or Date) for display
 */
export const formatTime = (timestamp: string | Date): string => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
};

/**
 * Format call duration (seconds) as mm:ss
 */
export const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * Get initials from a user name
 */
export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
};

/**
 * Truncate a string to maxLength with ellipsis
 */
export const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
};

/**
 * Format file size in human-readable form
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Get a human-readable preview string for a chat message.
 * Handles all non-text types with descriptive labels.
 */
export const getMessagePreview = (msg: {
  type: string;
  content: string;
  callType?: string;
  callStatus?: string;
  callDuration?: number;
}): string => {
  switch (msg.type) {
    case 'text': return msg.content;
    case 'image': return 'Photo';
    case 'video': return 'Video';
    case 'audio': return 'Audio message';
    case 'file': return 'File';
    case 'call': {
      const kind = msg.callType === 'video' ? 'Video call' : 'Voice call';
      if (msg.callStatus === 'missed' || msg.callStatus === 'no_answer') return `Missed ${kind.toLowerCase()}`;
      if (msg.callStatus === 'declined') return `Declined ${kind.toLowerCase()}`;
      if (msg.callStatus === 'cancelled') return `${kind} cancelled`;
      if (msg.callDuration && msg.callDuration > 0) {
        const m = Math.floor(msg.callDuration / 60);
        const s = msg.callDuration % 60;
        const dur = m > 0 ? `${m}m ${s}s` : `${s}s`;
        return `${kind} \u00b7 ${dur}`;
      }
      return kind;
    }
    default: return `[${msg.type}]`;
  }
};

/**
 * Returns a CSS color override for the message preview, or null for default.
 * Red for missed / declined / cancelled calls.
 */
export const getMessagePreviewColor = (msg: {
  type: string;
  callStatus?: string;
}): string | null => {
  if (msg.type === 'call' &&
    (msg.callStatus === 'missed' || msg.callStatus === 'no_answer' ||
     msg.callStatus === 'declined' || msg.callStatus === 'cancelled')) {
    return '#ef4444';
  }
  return null;
};

/**
 * Returns a lucide icon key for the message type, or null for plain text.
 */
export const getMessagePreviewIcon = (msg: {
  type: string;
  callType?: string;
  callStatus?: string;
}): 'Phone' | 'Video' | 'Image' | 'Film' | 'Mic' | 'Paperclip' | 'PhoneMissed' | 'PhoneOff' | null => {
  switch (msg.type) {
    case 'image': return 'Image';
    case 'video': return 'Film';
    case 'audio': return 'Mic';
    case 'file': return 'Paperclip';
    case 'call': {
      if (msg.callStatus === 'missed' || msg.callStatus === 'no_answer') return 'PhoneMissed';
      if (msg.callStatus === 'declined' || msg.callStatus === 'cancelled') return 'PhoneOff';
      return msg.callType === 'video' ? 'Video' : 'Phone';
    }
    default: return null;
  }
};

/**
 * Get a consistent color from a string (for avatars)
 */
const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6',
];

export const getAvatarColor = (str: string): string => {
  let hash = 0;
  for (const char of str) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};
