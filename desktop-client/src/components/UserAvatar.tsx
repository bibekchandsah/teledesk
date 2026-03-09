import React from 'react';
import { getAvatarColor, getInitials } from '../utils/formatters';

interface UserAvatarProps {
  name: string;
  avatar?: string;
  size?: number;
  online?: boolean;
  onClick?: () => void;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatar,
  size = 40,
  online,
  onClick,
}) => {
  const initials = getInitials(name || '?');
  const color = getAvatarColor(name || '');

  return (
    <div
      className="user-avatar"
      style={{ width: size, height: size, position: 'relative', cursor: onClick ? 'pointer' : 'inherit' }}
      onClick={onClick}
      title={name}
    >
      {avatar ? (
        <img
          src={avatar}
          alt={name}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
          }}
          onError={(e) => {
            // Fallback to initials on broken image
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            backgroundColor: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: size * 0.38,
            fontWeight: 600,
            userSelect: 'none',
          }}
        >
          {initials}
        </div>
      )}
      {online !== undefined && (
        <span
          style={{
            position: 'absolute',
            bottom: 1,
            right: 1,
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: '50%',
            backgroundColor: online ? '#22c55e' : '#6b7280',
            border: '2px solid var(--bg-primary)',
          }}
        />
      )}
    </div>
  );
};

export default UserAvatar;
