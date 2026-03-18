/**
 * Get a key for grouping messages by date
 */
export const getDateKey = (ts: string) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * Format a timestamp as a human-readable date label (e.g. "Today", "Yesterday", "Oct 12")
 */
export const formatDateLabel = (ts: string): string => {
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now); 
  yesterday.setDate(now.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    
  if (same(d, now)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Format a timestamp (ISO string or Date) for display
 * Always shows exact time (HH:MM) for consistency
 */
export const formatTime = (timestamp: string | Date): string => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * Format a "last seen" timestamp with full context:
 * - Today     → "last seen today at 04:57 PM"
 * - Yesterday → "last seen yesterday at 04:57 PM"
 * - This year → "last seen Mon, Jan 6 at 04:57 PM"
 * - Older     → "last seen Jan 6, 2023 at 04:57 PM"
 */
export const formatLastSeen = (timestamp: string | Date): string => {
  if (!timestamp) return 'last seen recently';
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  if (isNaN(d.getTime())) return 'last seen recently';

  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (sameDay(d, now)) return `last seen today at ${time}`;
  if (sameDay(d, yesterday)) return `last seen yesterday at ${time}`;

  if (d.getFullYear() === now.getFullYear()) {
    const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return `last seen ${dateStr} at ${time}`;
  }

  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `last seen ${dateStr} at ${time}`;
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
  reactions?: Record<string, string[]>;
}): string => {
  let preview = '';
  switch (msg.type) {
    case 'text': {
      // Hide spoiler content in previews
      preview = msg.content.replace(/\|\|[\s\S]+?\|\|/g, (match) => {
        return ':'.repeat(Math.max(20, match.length));
      });
      break;
    }
    case 'image': preview = 'Photo'; break;
    case 'video': preview = 'Video'; break;
    case 'audio': preview = 'Audio message'; break;
    case 'file': preview = 'File'; break;
    case 'call': {
      const kind = msg.callType === 'video' ? 'Video call' : 'Voice call';
      if (msg.callStatus === 'missed' || msg.callStatus === 'no_answer') preview = `Missed ${kind.toLowerCase()}`;
      else if (msg.callStatus === 'declined') preview = `Declined ${kind.toLowerCase()}`;
      else if (msg.callStatus === 'cancelled') preview = `${kind} cancelled`;
      else if (msg.callDuration && msg.callDuration > 0) {
        const m = Math.floor(msg.callDuration / 60);
        const s = msg.callDuration % 60;
        const dur = m > 0 ? `${m}m ${s}s` : `${s}s`;
        preview = `${kind} \u00b7 ${dur}`;
      } else {
        preview = kind;
      }
      break;
    }
    default: preview = `[${msg.type}]`; break;
  }

  // Append reactions if exist
  if (msg.reactions && Object.keys(msg.reactions).length > 0) {
    const emojis = Object.keys(msg.reactions).join('');
    return `${preview} ${emojis}`;
  }

  return preview;
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
