import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getUserById, updateMyProfile, uploadAvatar } from '../services/apiService';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { emitActiveStatusChange } from '../services/socketService';
import UserAvatar from '../components/UserAvatar';
import { formatLastSeen } from '../utils/formatters';
import { User } from '@shared/types';
import { Pencil, Check, X, Camera, Trash2 } from 'lucide-react';

const UserProfile: React.FC = () => {
  const { uid } = useParams<{ uid?: string }>();
  const { currentUser, setCurrentUser } = useAuthStore();
  const { onlineUsers, userProfiles, setUserProfile } = useChatStore();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const targetUid = uid || currentUser?.uid;
  const isOwnProfile = targetUid === currentUser?.uid;

  // ─── Own-profile edit state ───────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [showActiveStatus, setShowActiveStatus] = useState(true);
  const [showMessageStatus, setShowMessageStatus] = useState(true);
  const [showLiveTyping, setShowLiveTyping] = useState(true);

  // ─── Load profile ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!targetUid) return;
    setLoading(true);
    if (targetUid === currentUser?.uid && currentUser) {
      setProfile(currentUser);
      setLoading(false);
      return;
    }
    getUserById(targetUid)
      .then((res) => { if (res.success && res.data) setProfile(res.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [targetUid, currentUser]);

  // Keep own profile in sync with store
  useEffect(() => {
    if (isOwnProfile && currentUser) {
      setProfile(currentUser);
      setNameInput(currentUser.name ?? '');
      setUsernameInput(currentUser.username ?? '');
      setShowActiveStatus(currentUser.showActiveStatus !== false);
      setShowMessageStatus(currentUser.showMessageStatus !== false);
      setShowLiveTyping(currentUser.showLiveTyping !== false);
    }
  }, [currentUser, isOwnProfile]);

  // ─── Username availability check ─────────────────────────────────────────
  useEffect(() => {
    if (!editingUsername || !usernameInput || usernameInput === currentUser?.username) {
      setUsernameCheckStatus('idle');
      setUsernameMessage('');
      return;
    }
    const timer = setTimeout(async () => {
      setUsernameCheckStatus('checking');
      const { checkUsernameAvailability } = await import('../services/usernameService');
      const result = await checkUsernameAvailability(usernameInput);
      if (result.available) {
        setUsernameCheckStatus('available');
        setUsernameMessage('✓ Username is available');
      } else {
        setUsernameCheckStatus('unavailable');
        setUsernameMessage(result.message);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [usernameInput, editingUsername, currentUser?.username]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !currentUser || trimmed === currentUser.name) { setEditingName(false); return; }
    setIsSavingName(true);
    try {
      const res = await updateMyProfile({ name: trimmed });
      if (res.success && res.data) { setCurrentUser(res.data); setUserProfile(res.data); }
    } catch (e) { console.error('[Profile] Failed to update name', e); }
    finally { setIsSavingName(false); setEditingName(false); }
  };

  const handleSaveUsername = async () => {
    if (!usernameInput.trim() || usernameCheckStatus !== 'available') return;
    setIsSavingUsername(true);
    try {
      const { updateUsername } = await import('../services/usernameService');
      const result = await updateUsername(usernameInput.trim());
      if (result.success) {
        const res = await updateMyProfile({ username: usernameInput.trim().toLowerCase() });
        if (res.success && res.data) { setCurrentUser(res.data); setUserProfile(res.data); }
        setEditingUsername(false);
      } else {
        setUsernameMessage(result.error || 'Failed to update username');
        setUsernameCheckStatus('unavailable');
      }
    } catch (e) {
      console.error('[Profile] Failed to update username', e);
      setUsernameMessage('Failed to update username');
      setUsernameCheckStatus('unavailable');
    } finally { setIsSavingUsername(false); }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5 MB.'); return; }
    setIsUploadingAvatar(true);
    try {
      const uploadRes = await uploadAvatar(file);
      if (!uploadRes.success || !uploadRes.data?.url) throw new Error('Upload failed');
      const res = await updateMyProfile({ avatar: uploadRes.data.url });
      if (res.success && res.data) { setCurrentUser(res.data); setUserProfile(res.data); }
    } catch (err) { console.error('[Profile] Avatar upload failed', err); }
    finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!currentUser?.avatar) return;
    try {
      const res = await updateMyProfile({ avatar: '' });
      if (res.success && res.data) { setCurrentUser(res.data); setUserProfile(res.data); }
    } catch (e) { console.error('[Profile] Failed to remove avatar', e); }
  };

  const handleToggleActiveStatus = async () => {
    const newVal = !showActiveStatus;
    setShowActiveStatus(newVal);
    try {
      const res = await updateMyProfile({ showActiveStatus: newVal });
      if (res.success && res.data) setCurrentUser(res.data);
      emitActiveStatusChange(newVal);
    } catch { setShowActiveStatus(!newVal); }
  };

  const handleToggleMessageStatus = async () => {
    const newVal = !showMessageStatus;
    setShowMessageStatus(newVal);
    try {
      const res = await updateMyProfile({ showMessageStatus: newVal });
      if (res.success && res.data) setCurrentUser(res.data);
      const socket = (await import('../services/socketService')).getSocket();
      socket?.emit('message_status_changed', { showMessageStatus: newVal });
    } catch { setShowMessageStatus(!newVal); }
  };

  const handleToggleLiveTyping = async () => {
    const newVal = !showLiveTyping;
    setShowLiveTyping(newVal);
    try {
      const res = await updateMyProfile({ showLiveTyping: newVal });
      if (res.success && res.data) setCurrentUser(res.data);
      const socket = (await import('../services/socketService')).getSocket();
      socket?.emit('live_typing_status_changed', { showLiveTyping: newVal });
    } catch { setShowLiveTyping(!newVal); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'var(--text-secondary)' }}>Loading...</span>
    </div>
  );

  if (!profile) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'var(--text-secondary)' }}>User not found</span>
    </div>
  );

  const storeProfile = profile.uid === currentUser?.uid ? currentUser : (userProfiles[profile.uid] ?? profile);
  const isOnline = isOwnProfile
    ? storeProfile?.showActiveStatus !== false
    : onlineUsers.has(profile.uid) && storeProfile?.showActiveStatus !== false;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', backgroundColor: 'var(--bg-primary)', overflowY: 'auto' }}>

      {/* ── Avatar ── */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <UserAvatar name={profile.name} avatar={profile.avatar} size={100} online={isOnline} />
        {isOwnProfile && (
          <>
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={isUploadingAvatar}
              title="Change avatar"
              style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: '50%', backgroundColor: 'var(--accent)', border: '2px solid var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              {isUploadingAvatar
                ? <span style={{ width: 12, height: 12, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                : <Camera size={14} color="#fff" />}
            </button>
            {profile.avatar && (
              <button
                onClick={handleRemoveAvatar}
                title="Remove avatar"
                style={{ position: 'absolute', top: 0, right: 0, width: 22, height: 22, borderRadius: '50%', backgroundColor: '#ef4444', border: '2px solid var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <Trash2 size={11} color="#fff" />
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Name ── */}
      {isOwnProfile && editingName ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
            style={{ fontSize: 22, fontWeight: 700, background: 'var(--bg-secondary)', border: '1px solid var(--accent)', borderRadius: 8, padding: '4px 10px', color: 'var(--text-primary)', outline: 'none', width: 220, textAlign: 'center' }}
          />
          <button onClick={handleSaveName} disabled={isSavingName} style={iconBtnStyle('#22c55e')}><Check size={15} color="#fff" /></button>
          <button onClick={() => { setEditingName(false); setNameInput(currentUser?.name ?? ''); }} style={iconBtnStyle('#6b7280')}><X size={15} color="#fff" /></button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 24, fontWeight: 700 }}>{profile.name}</h2>
          {isOwnProfile && (
            <button onClick={() => setEditingName(true)} title="Edit name" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-secondary)', display: 'flex' }}>
              <Pencil size={15} />
            </button>
          )}
        </div>
      )}

      {/* ── Email ── */}
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 6px', fontSize: 14 }}>{profile.email}</p>

      {/* ── Username ── */}
      {isOwnProfile && editingUsername ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>@</span>
            <input
              autoFocus
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveUsername(); if (e.key === 'Escape') setEditingUsername(false); }}
              style={{ fontSize: 14, background: 'var(--bg-secondary)', border: `1px solid ${usernameCheckStatus === 'available' ? '#22c55e' : usernameCheckStatus === 'unavailable' ? '#ef4444' : 'var(--border)'}`, borderRadius: 8, padding: '4px 10px', color: 'var(--text-primary)', outline: 'none', width: 180 }}
            />
            <button onClick={handleSaveUsername} disabled={isSavingUsername || usernameCheckStatus !== 'available'} style={iconBtnStyle('#22c55e')}><Check size={15} color="#fff" /></button>
            <button onClick={() => { setEditingUsername(false); setUsernameInput(currentUser?.username ?? ''); setUsernameCheckStatus('idle'); setUsernameMessage(''); }} style={iconBtnStyle('#6b7280')}><X size={15} color="#fff" /></button>
          </div>
          {usernameMessage && (
            <span style={{ fontSize: 12, color: usernameCheckStatus === 'available' ? '#22c55e' : '#ef4444' }}>{usernameMessage}</span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {profile.username ? `@${profile.username}` : isOwnProfile ? 'No username set' : ''}
          </span>
          {isOwnProfile && (
            <button onClick={() => setEditingUsername(true)} title="Edit username" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-secondary)', display: 'flex' }}>
              <Pencil size={13} />
            </button>
          )}
        </div>
      )}

      {/* ── Online status badge ── */}
      <div style={{ marginBottom: 32, padding: '4px 12px', borderRadius: 20, backgroundColor: isOnline ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)', color: isOnline ? '#22c55e' : '#6b7280', fontSize: 13, fontWeight: 500 }}>
        {isOnline ? '● Online' : profile.lastSeen ? formatLastSeen(profile.lastSeen) : 'Offline'}
      </div>

      {/* ── Info card ── */}
      <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: 12, padding: '16px 24px', border: '1px solid var(--border)', width: '100%', maxWidth: 420 }}>
        <div style={rowStyle}>
          <span style={{ color: 'var(--text-secondary)' }}>Member since</span>
          <span style={{ color: 'var(--text-primary)' }}>
            {new Date(profile.createdAt).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* ── Privacy toggles (own profile only) ── */}
      {isOwnProfile && (
        <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: 12, padding: '8px 24px', border: '1px solid var(--border)', width: '100%', maxWidth: 420, marginTop: 16 }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '12px 0 4px' }}>Privacy</p>

          <ToggleRow
            label="Show active status"
            description="Let others see when you're online"
            checked={showActiveStatus}
            onChange={handleToggleActiveStatus}
          />
          <ToggleRow
            label="Show message status"
            description="Show delivery and read receipts"
            checked={showMessageStatus}
            onChange={handleToggleMessageStatus}
          />
          <ToggleRow
            label="Show live typing"
            description="Let others see your typing preview"
            checked={showLiveTyping}
            onChange={handleToggleLiveTyping}
            last
          />
        </div>
      )}
    </div>
  );
};

// ─── Small reusable components ────────────────────────────────────────────────
const iconBtnStyle = (bg: string): React.CSSProperties => ({
  width: 26, height: 26, borderRadius: '50%', backgroundColor: bg,
  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
});

const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', padding: '10px 0',
  fontSize: 14, borderBottom: '1px solid var(--border)',
};

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  last?: boolean;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, checked, onChange, last }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
    <div>
      <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{description}</div>
    </div>
    <button
      onClick={onChange}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
        backgroundColor: checked ? 'var(--accent)' : 'var(--bg-hover)',
        position: 'relative', transition: 'background-color 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%', backgroundColor: '#fff',
        transition: 'left 0.2s', display: 'block',
      }} />
    </button>
  </div>
);

export default UserProfile;
