import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getUserById } from '../services/apiService';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import UserAvatar from '../components/UserAvatar';
import { formatTime } from '../utils/formatters';
import { User } from '@shared/types';

const UserProfile: React.FC = () => {
  const { uid } = useParams<{ uid?: string }>();
  const { currentUser } = useAuthStore();
  const { onlineUsers, userProfiles } = useChatStore();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const targetUid = uid || currentUser?.uid;

  useEffect(() => {
    if (!targetUid) return;
    setLoading(true);

    if (targetUid === currentUser?.uid && currentUser) {
      setProfile(currentUser);
      setLoading(false);
      return;
    }

    getUserById(targetUid)
      .then((res) => {
        if (res.success && res.data) setProfile(res.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [targetUid, currentUser]);

  // Update profile when currentUser changes (for own profile view)
  useEffect(() => {
    if (targetUid === currentUser?.uid && currentUser) {
      setProfile(currentUser);
    }
  }, [currentUser, targetUid]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Loading...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-secondary)' }}>User not found</span>
      </div>
    );
  }

  // Use store profile for showActiveStatus (kept up-to-date via socket) with API profile as fallback
  const storeProfile = profile.uid === currentUser?.uid ? currentUser : (userProfiles[profile.uid] ?? profile);
  const isOnline = onlineUsers.has(profile.uid) && storeProfile?.showActiveStatus !== false;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 48,
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      <UserAvatar name={profile.name} avatar={profile.avatar} size={100} online={isOnline} />
      <h2 style={{ color: 'var(--text-primary)', marginTop: 16, marginBottom: 4, fontSize: 24 }}>
        {profile.name}
      </h2>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{profile.email}</p>
      <div
        style={{
          marginTop: 12,
          padding: '4px 12px',
          borderRadius: 20,
          backgroundColor: isOnline ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
          color: isOnline ? '#22c55e' : '#6b7280',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {isOnline ? '● Online' : `Last seen ${formatTime(profile.lastSeen)}`}
      </div>

      <div
        style={{
          marginTop: 32,
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 12,
          padding: '16px 24px',
          border: '1px solid var(--border)',
          width: '100%',
          maxWidth: 400,
        }}
      >
        <div style={infoRowStyle}>
          <span style={{ color: 'var(--text-secondary)' }}>Member since</span>
          <span style={{ color: 'var(--text-primary)' }}>
            {new Date(profile.createdAt).toLocaleDateString([], {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>
    </div>
  );
};

const infoRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 0',
  fontSize: 14,
  borderBottom: '1px solid var(--border)',
};

export default UserProfile;
