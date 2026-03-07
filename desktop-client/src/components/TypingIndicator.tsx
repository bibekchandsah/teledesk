import React from 'react';

interface TypingUser {
  userId: string;
  userName: string;
}

interface LiveTypingEntry {
  userId: string;
  userName: string;
  text: string;
}

interface TypingIndicatorProps {
  users: TypingUser[];
  liveTexts?: LiveTypingEntry[];
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ users, liveTexts = [] }) => {
  if (users.length === 0 && liveTexts.length === 0) return null;

  // Prefer showing live text for users who have it; fall back to typed indicator for others
  const liveMap = new Map(liveTexts.map((e) => [e.userId, e]));
  const liveEntries = liveTexts.filter((e) => e.text);
  const dotUsers = users.filter((u) => !liveMap.has(u.userId));
  const hasAnything = liveEntries.length > 0 || dotUsers.length > 0;
  if (!hasAnything) return null;

  const firstUser = liveEntries[0] ?? dotUsers[0];
  const isLive = liveEntries.length > 0;

  const names = (isLive ? liveEntries : dotUsers)
    .map((u) => u.userName.split(' ')[0])
    .join(', ');

  return (
    <div
      className="typing-indicator"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 16px',
        fontSize: 13,
        color: 'var(--text-secondary)',
      }}
    >
      {isLive ? (
        // Live text preview bubble
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px 12px 12px 4px',
            padding: '6px 10px',
            maxWidth: 260,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            fontSize: 13,
            color: 'var(--text-primary)',
            opacity: 0.75,
          }}
        >
          {liveEntries.map((e) => e.text).join(' | ')}
        </div>
      ) : (
        // Standard animated dots
        <div
          className="typing-bubble"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px 12px 12px 4px',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--text-secondary)', animation: 'bounce 1.4s infinite 0s' }} />
          <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--text-secondary)', animation: 'bounce 1.4s infinite 0.2s' }} />
          <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--text-secondary)', animation: 'bounce 1.4s infinite 0.4s' }} />
        </div>
      )}
      <span>{names} {(isLive ? liveEntries : dotUsers).length === 1 ? 'is typing' : 'are typing'}...</span>
    </div>
  );
};

export default TypingIndicator;
