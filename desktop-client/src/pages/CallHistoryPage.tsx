import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Video, VideoOff, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { Message } from '@shared/types';
import UserAvatar from '../components/UserAvatar';
import { formatDuration } from '../utils/formatters';

interface CallEntry {
  message: Message;
  chatId: string;
  peerName: string;
  peerAvatar: string;
  peerUid: string;
  direction: 'incoming' | 'outgoing';
  date: Date;
}

const formatCallDate = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'long' });
  return date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatCallTime = (date: Date): string =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const CallHistoryPage: React.FC = () => {
  const { messages, userProfiles, chats, nicknames } = useChatStore();
  const { currentUser } = useAuthStore();
  const navigate = useNavigate();

  const callEntries = useMemo<CallEntry[]>(() => {
    if (!currentUser) return [];
    const entries: CallEntry[] = [];

    for (const [chatId, msgs] of Object.entries(messages)) {
      const chat = chats.find((c) => c.chatId === chatId);
      if (!chat) continue;

      const peerUid = chat.members.find((m) => m !== currentUser.uid) ?? '';
      const peer = userProfiles[peerUid];
      const peerName = nicknames[peerUid] || peer?.name || 'Unknown';
      const peerAvatar = peer?.avatar ?? '';

      for (const msg of msgs) {
        if (msg.type !== 'call') continue;
        entries.push({
          message: msg,
          chatId,
          peerName,
          peerAvatar,
          peerUid,
          direction: msg.senderId === currentUser.uid ? 'outgoing' : 'incoming',
          date: new Date(msg.timestamp),
        });
      }
    }

    // Sort newest first
    return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [messages, userProfiles, chats, currentUser, nicknames]);

  // Group by day label
  const grouped = useMemo(() => {
    const map: { label: string; entries: CallEntry[] }[] = [];
    const seen = new Map<string, CallEntry[]>();

    for (const entry of callEntries) {
      const label = formatCallDate(entry.date);
      if (!seen.has(label)) {
        seen.set(label, []);
        map.push({ label, entries: seen.get(label)! });
      }
      seen.get(label)!.push(entry);
    }
    return map;
  }, [callEntries]);

  const getStatusIcon = (entry: CallEntry) => {
    const { callStatus, callStatusReceiver, callType } = entry.message;
    const status = entry.direction === 'outgoing' ? callStatus : callStatusReceiver;
    const isVideo = callType === 'video';

    if (status === 'missed' || status === 'no_answer') {
      return isVideo
        ? <VideoOff size={16} color="#f87171" />
        : <PhoneMissed size={16} color="#f87171" />;
    }
    if (status === 'declined' || status === 'cancelled') {
      return isVideo
        ? <VideoOff size={16} color="#f87171" />
        : <PhoneOff size={16} color="#f87171" />;
    }
    if (entry.direction === 'incoming') {
      return isVideo
        ? <Video size={16} color="#34d399" />
        : <PhoneIncoming size={16} color="#34d399" />;
    }
    return isVideo
      ? <Video size={16} color="var(--accent)" />
      : <PhoneOutgoing size={16} color="var(--accent)" />;
  };

  const getStatusLabel = (entry: CallEntry) => {
    const { callStatus, callStatusReceiver } = entry.message;
    const status = entry.direction === 'outgoing' ? callStatus : callStatusReceiver;

    if (status === 'missed') return 'Missed';
    if (status === 'no_answer') return entry.direction === 'outgoing' ? 'No answer' : 'Missed';
    if (status === 'declined') return entry.direction === 'outgoing' ? 'Declined' : 'Declined';
    if (status === 'cancelled') return 'Cancelled';
    if (entry.message.callDuration && entry.message.callDuration > 0) {
      return formatDuration(entry.message.callDuration);
    }
    return entry.direction === 'incoming' ? 'Incoming' : 'Outgoing';
  };

  const getStatusColor = (entry: CallEntry) => {
    const { callStatus, callStatusReceiver } = entry.message;
    const status = entry.direction === 'outgoing' ? callStatus : callStatusReceiver;
    if (status === 'missed' || status === 'no_answer') return '#f87171';
    if (status === 'declined' || status === 'cancelled') return '#f87171';
    return 'var(--text-secondary)';
  };

  return (
    <div
      style={{
        width: 340,
        minWidth: 280,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-primary)',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 20px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
          Calls
        </h2>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {callEntries.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 12,
              color: 'var(--text-secondary)',
              padding: 32,
              textAlign: 'center',
            }}
          >
            <Phone size={48} style={{ opacity: 0.25 }} />
            <p style={{ margin: 0, fontSize: 14 }}>No call history yet</p>
          </div>
        ) : (
          grouped.map(({ label, entries }) => (
            <div key={label}>
              {/* Day separator */}
              <div
                style={{
                  padding: '10px 20px 4px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: 'var(--bg-primary)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}
              >
                {label}
              </div>

              {entries.map((entry) => (
                <div
                  key={entry.message.messageId}
                  onClick={() => navigate(`/chats/${entry.chatId}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = 'transparent')
                  }
                >
                  {/* Avatar */}
                  <div style={{ flexShrink: 0 }}>
                    <UserAvatar name={entry.peerName} avatar={entry.peerAvatar} size={44} />
                  </div>

                  {/* Middle: name + status */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginBottom: 3,
                      }}
                    >
                      {entry.peerName}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12,
                        color: getStatusColor(entry),
                      }}
                    >
                      {getStatusIcon(entry)}
                      <span>
                        {entry.direction === 'incoming' ? 'Incoming' : 'Outgoing'}{' '}
                        {entry.message.callType === 'video' ? 'video' : 'voice'} call
                        {' · '}
                        {getStatusLabel(entry)}
                      </span>
                    </div>
                  </div>

                  {/* Right: time */}
                  <div
                    style={{
                      flexShrink: 0,
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      textAlign: 'right',
                    }}
                  >
                    {formatCallTime(entry.date)}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CallHistoryPage;
