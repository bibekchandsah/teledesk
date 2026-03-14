import React, { useRef, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useUIStore } from '../store/uiStore';
import UserAvatar from '../components/UserAvatar';
import { updateMyProfile, uploadAvatar } from '../services/apiService';
import { emitActiveStatusChange } from '../services/socketService';
import { Pencil, Sun, Moon, Trash2 } from 'lucide-react';
import { firebaseAuth } from '../services/firebaseService';

const SettingsPage: React.FC = () => {
  const { logout } = useAuth();
  const { currentUser, setCurrentUser } = useAuthStore();
  const { setUserProfile } = useChatStore();
  const { theme, toggleTheme, liveTypingEnabled, toggleLiveTyping, selectedMicId, setSelectedMicId } = useUIStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Enumerate microphone devices
  useEffect(() => {
    const loadDevices = async () => {
      const md = navigator.mediaDevices;
      if (!md) {
        console.warn('[Settings] navigator.mediaDevices unavailable');
        return;
      }
      // Try to enumerate straight away — in Electron mic permission is usually
      // already granted, so labels are populated without a getUserMedia call.
      const tryEnum = async () => {
        const devices = await md.enumerateDevices();
        const mics = devices.filter((d) => d.kind === 'audioinput');
        // Labels are empty when permission hasn't been granted yet
        if (mics.length > 0 && mics.some((d) => d.label)) return mics;
        return null;
      };

      let mics = await tryEnum().catch(() => null);
      if (!mics) {
        // Ask for permission then re-enumerate to get labels
        try {
          const s = await md.getUserMedia({ audio: true });
          s.getTracks().forEach((t) => t.stop());
          mics = await tryEnum().catch(() => null);
        } catch (err) {
          console.warn('[Settings] Mic permission denied:', err);
          // Still enumerate — labels will be blank but devices are listed
          mics = await md.enumerateDevices()
            .then((d) => d.filter((x) => x.kind === 'audioinput'))
            .catch(() => null);
        }
      }
      if (mics && mics.length > 0) {
        console.log('[Settings] Mic devices:', mics);
        setMicDevices(mics);
      }
    };
    loadDevices();
  }, []);

  const [showActiveStatus, setShowActiveStatus] = useState(currentUser?.showActiveStatus !== false);
  const [showMessageStatus, setShowMessageStatus] = useState(currentUser?.showMessageStatus !== false);
  const [editingName, setEditingName] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState(currentUser?.username ?? '');
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  // Sync toggle states with currentUser when it changes (e.g., after login or profile update)
  useEffect(() => {
    setShowActiveStatus(currentUser?.showActiveStatus !== false);
    setShowMessageStatus(currentUser?.showMessageStatus !== false);
    setUsernameInput(currentUser?.username ?? '');
    setNameInput(currentUser?.name ?? '');
  }, [currentUser?.showActiveStatus, currentUser?.showMessageStatus, currentUser?.username, currentUser?.name]);
  const [nameInput, setNameInput] = useState(currentUser?.name ?? '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState(0);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !currentUser || trimmed === currentUser.name) {
      setEditingName(false);
      return;
    }
    setIsSavingName(true);
    try {
      const res = await updateMyProfile({ name: trimmed });
      if (res.success && res.data) {
        setCurrentUser(res.data);
        setUserProfile(res.data); // Also update chat store cache
      }
    } catch (e) {
      console.error('[Profile] Failed to update name', e);
    } finally {
      setIsSavingName(false);
      setEditingName(false);
    }
  };

  // Username validation with debounce
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

  const handleSaveUsername = async () => {
    if (!usernameInput.trim() || usernameCheckStatus !== 'available') return;

    setIsSavingUsername(true);
    try {
      const { updateUsername } = await import('../services/usernameService');
      const result = await updateUsername(usernameInput.trim());

      if (result.success) {
        const res = await updateMyProfile({ username: usernameInput.trim().toLowerCase() });
        if (res.success && res.data) {
          setCurrentUser(res.data);
          setUserProfile(res.data); // Also update chat store cache
        }
        setEditingUsername(false);
      } else {
        setUsernameMessage(result.error || 'Failed to update username');
        setUsernameCheckStatus('unavailable');
      }
    } catch (e) {
      console.error('[Profile] Failed to update username', e);
      setUsernameMessage('Failed to update username');
      setUsernameCheckStatus('unavailable');
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!currentUser?.avatar) return;
    try {
      const res = await updateMyProfile({ avatar: '' });
      if (res.success && res.data) {
        setCurrentUser(res.data);
        setUserProfile(res.data);
      }
    } catch (e) {
      console.error('[Profile] Failed to remove avatar', e);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5 MB.'); return; }
    setIsUploadingAvatar(true);
    setAvatarProgress(0);
    try {
      const uploadRes = await uploadAvatar(file);
      if (!uploadRes.success || !uploadRes.data?.url) throw new Error('Upload failed');
      setAvatarProgress(100);
      const res = await updateMyProfile({ avatar: uploadRes.data.url });
      if (res.success && res.data) {
        setCurrentUser(res.data);
        setUserProfile(res.data); // Also update chat store cache
      }
    } catch (err) {
      console.error('[Profile] Avatar upload failed', err);
    } finally {
      setIsUploadingAvatar(false);
      setAvatarProgress(0);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout(false); // false = not switching, explicit logout
    // Redirect to login with logout flag
    window.location.href = '/login?logout=true';
  };

  const handleDeleteAccount = async () => {
    const providerData = firebaseAuth.currentUser?.providerData || [];
    const isPasswordProvider = providerData.length > 0 && providerData[0]?.providerId === 'password';

    if (isPasswordProvider && !deletePassword) {
      setDeleteError('Please enter your password to confirm');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      // For email/password users: re-authenticate client-side first 
      if (isPasswordProvider) {
        const { reauthenticateWithPassword } = await import('../services/firebaseService');
        const reauthed = await reauthenticateWithPassword(deletePassword);
        if (!reauthed) {
          setDeleteError('Incorrect password');
          setIsDeleting(false);
          return;
        }
      }

      // Call backend — which deletes from DB AND Firebase Auth (via Admin SDK).
      // Admin SDK bypasses requires-recent-login, so no re-auth needed for OAuth users.
      const { deleteMyAccount } = await import('../services/apiService');
      const result = await deleteMyAccount();

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete account');
      }

      // Sign out locally and redirect
      await logout();
      window.location.href = '/login?logout=true';
    } catch (error: any) {
      console.error('[Delete] Error:', error);
      setDeleteError(error.message || 'Failed to delete account');
      setIsDeleting(false);
    }
  };


  const handleToggleActiveStatus = async () => {
    const newVal = !showActiveStatus;
    setShowActiveStatus(newVal);
    try {
      const res = await updateMyProfile({ showActiveStatus: newVal });
      if (res.success && res.data) setCurrentUser(res.data);
      emitActiveStatusChange(newVal);
    } catch (e) {
      console.error('[Settings] Failed to update active status', e);
      setShowActiveStatus(!newVal); // rollback on error
    }
  };

  const handleToggleMessageStatus = async () => {
    const newVal = !showMessageStatus;
    setShowMessageStatus(newVal);
    try {
      const res = await updateMyProfile({ showMessageStatus: newVal });
      if (res.success && res.data) setCurrentUser(res.data);
      // Emit socket event to notify other users
      const socket = (await import('../services/socketService')).getSocket();
      if (socket) {
        socket.emit('message_status_changed', { showMessageStatus: newVal });
      }
    } catch (e) {
      console.error('[Settings] Failed to update message status', e);
      setShowMessageStatus(!newVal); // rollback on error
    }
  };

  if (!currentUser) return null;

  return (
    <div
      className="responsive-scroll-page"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 32,
        maxWidth: 600,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <h2 style={{ color: 'var(--text-primary)', marginBottom: 28 }}>Settings</h2>

      {/* Profile Section */}
      <Section title="Profile">
        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <UserAvatar name={currentUser.name} avatar={currentUser.avatar} size={64} />
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={isUploadingAvatar}
              title="Change profile picture"
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 22, height: 22, borderRadius: '50%',
                backgroundColor: 'var(--accent)', border: '2px solid var(--bg-secondary)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: '#fff', padding: 0,
              }}
            >
              {isUploadingAvatar ? `${avatarProgress}%` : <Pencil size={11} />}
            </button>
            {currentUser.avatar && (
              <button
                onClick={handleRemoveAvatar}
                title="Remove profile picture"
                style={{
                  position: 'absolute', top: -2, right: -2,
                  width: 20, height: 20, borderRadius: '50%',
                  backgroundColor: '#ef4444', border: '2px solid var(--bg-secondary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', padding: 0,
                }}
              >
                <Trash2 size={11} />
              </button>
            )}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Editable display name */}
            {editingName ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditingName(false); setNameInput(currentUser.name); } }}
                  maxLength={100}
                  style={{
                    fontSize: 16, fontWeight: 600, color: 'var(--text-primary)',
                    background: 'var(--bg-tertiary)', border: '1px solid var(--accent)',
                    borderRadius: 6, padding: '4px 8px', flex: 1, minWidth: 0,
                  }}
                />
                <button
                  onClick={handleSaveName}
                  disabled={isSavingName}
                  style={{ ...smallBtnStyle, backgroundColor: 'var(--accent)', color: '#fff', border: 'none' }}
                >
                  {isSavingName ? '...' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditingName(false); setNameInput(currentUser.name); }}
                  style={smallBtnStyle}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 18, color: 'var(--text-primary)' }}>{currentUser.name}</span>
                <button
                  onClick={() => { setNameInput(currentUser.name); setEditingName(true); }}
                  title="Edit name"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, padding: 2, display: 'flex', alignItems: 'center' }}
                >
                  <Pencil size={14} />
                </button>
              </div>
            )}
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>{currentUser.email}</div>
            {/* Username */}
            {editingUsername ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value.toLowerCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && usernameCheckStatus === 'available') handleSaveUsername();
                      if (e.key === 'Escape') { setEditingUsername(false); setUsernameInput(currentUser.username ?? ''); setUsernameCheckStatus('idle'); setUsernameMessage(''); }
                    }}
                    placeholder="username"
                    maxLength={20}
                    style={{
                      fontSize: 13, color: 'var(--text-primary)',
                      background: 'var(--bg-tertiary)', border: '1px solid var(--accent)',
                      borderRadius: 6, padding: '4px 8px', flex: 1, minWidth: 0,
                    }}
                  />
                  <button
                    onClick={handleSaveUsername}
                    disabled={isSavingUsername || usernameCheckStatus !== 'available'}
                    style={{
                      ...smallBtnStyle,
                      backgroundColor: usernameCheckStatus === 'available' ? 'var(--accent)' : 'var(--bg-tertiary)',
                      color: usernameCheckStatus === 'available' ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      opacity: usernameCheckStatus === 'available' ? 1 : 0.5,
                      cursor: usernameCheckStatus === 'available' ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {isSavingUsername ? '...' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditingUsername(false); setUsernameInput(currentUser.username ?? ''); setUsernameCheckStatus('idle'); setUsernameMessage(''); }}
                    style={smallBtnStyle}
                  >
                    Cancel
                  </button>
                </div>
                {usernameMessage && (
                  <div style={{
                    fontSize: 11,
                    marginTop: 4,
                    color: usernameCheckStatus === 'available' ? '#22c55e' : '#ef4444'
                  }}>
                    {usernameMessage}
                  </div>
                )}
                {usernameCheckStatus === 'checking' && (
                  <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>
                    Checking availability...
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  @{currentUser.username || 'not set'}
                </span>
                <button
                  onClick={() => { setUsernameInput(currentUser.username ?? ''); setEditingUsername(true); }}
                  title="Edit username"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, padding: 2, display: 'flex', alignItems: 'center' }}
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <SettingRow label="Theme" description={`Currently: ${theme} mode`}>
          <button
            onClick={toggleTheme}
            style={toggleBtnStyle}
          >
            {theme === 'dark'
              ? <><Sun size={16} style={{ marginRight: 6 }} />Light Mode</>
              : <><Moon size={16} style={{ marginRight: 6 }} />Dark Mode</>}
          </button>
        </SettingRow>
      </Section>

      {/* Privacy & Security */}
      <Section title="Privacy & Security">
        <SettingRow label="End-to-End Encryption" description="All messages are encrypted with AES-256">
          <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 600 }}>✓ Enabled</span>
        </SettingRow>
        <SettingRow
          label="Device Sessions"
          description="Manage your active sessions across all devices"
        >
          <button
            onClick={() => window.location.href = '/device-sessions'}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Manage Devices
          </button>
        </SettingRow>
        <SettingRow
          label="Live Typing Preview"
          description="When both users enable this, you see each other’s text as they type"
        >
          <button
            onClick={toggleLiveTyping}
            style={{
              width: 46,
              height: 26,
              borderRadius: 13,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: liveTypingEnabled ? 'var(--accent)' : 'var(--bg-tertiary)',
              position: 'relative',
              transition: 'background-color 0.2s',
              flexShrink: 0,
            }}
            aria-label="Toggle live typing preview"
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: liveTypingEnabled ? 23 : 3,
                width: 20,
                height: 20,
                borderRadius: '50%',
                backgroundColor: '#fff',
                transition: 'left 0.2s',
              }}
            />
          </button>
        </SettingRow>
        <SettingRow
          label="Show Active Status"
          description="When enabled, contacts can see when you're online — only if they've also enabled this"
        >
          <button
            onClick={handleToggleActiveStatus}
            style={{
              width: 46,
              height: 26,
              borderRadius: 13,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: showActiveStatus ? 'var(--accent)' : 'var(--bg-tertiary)',
              position: 'relative',
              transition: 'background-color 0.2s',
              flexShrink: 0,
            }}
            aria-label="Toggle active status visibility"
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: showActiveStatus ? 23 : 3,
                width: 20,
                height: 20,
                borderRadius: '50%',
                backgroundColor: '#fff',
                transition: 'left 0.2s',
              }}
            />
          </button>
        </SettingRow>
        <SettingRow
          label="Show Message Status"
          description="When enabled, you can see delivery/read receipts — only if both users have enabled this"
        >
          <button
            onClick={handleToggleMessageStatus}
            style={{
              width: 46,
              height: 26,
              borderRadius: 13,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: showMessageStatus ? 'var(--accent)' : 'var(--bg-tertiary)',
              position: 'relative',
              transition: 'background-color 0.2s',
              flexShrink: 0,
            }}
            aria-label="Toggle message status visibility"
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: showMessageStatus ? 23 : 3,
                width: 20,
                height: 20,
                borderRadius: '50%',
                backgroundColor: '#fff',
                transition: 'left 0.2s',
              }}
            />
          </button>
        </SettingRow>

        <SettingRow
          label="Chat Lock PIN"
          description={currentUser?.chatLockPin ? "Change your 6-digit chat lock PIN" : "Set up a 6-digit PIN to lock specific chats"}
        >
          <button
            onClick={() => {
              const { setPinModal } = useUIStore.getState();
              setPinModal({ mode: currentUser?.chatLockPin ? 'change' : 'setup' });
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {currentUser?.chatLockPin ? 'Change PIN' : 'Set Up PIN'}
          </button>
        </SettingRow>
      </Section>

      {/* Audio */}
      <Section title="Audio &amp; Microphone">
        <SettingRow
          label="Microphone"
          description={micDevices.length === 0 ? 'Grant microphone permission to see devices' : `${micDevices.length} device${micDevices.length !== 1 ? 's' : ''} found`}
        >
          {micDevices.length > 0 ? (
            <select
              value={selectedMicId}
              onChange={(e) => setSelectedMicId(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: 13,
                cursor: 'pointer',
                maxWidth: 220,
              }}
            >
              <option value="">Default microphone</option>
              {micDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
          )}
        </SettingRow>
      </Section>

      {/* About */}
      <Section title="About">
        <SettingRow label="App Version" description="TeleDesk Desktop">
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>1.0.0</span>
        </SettingRow>
      </Section>

      {/* Danger Zone */}
      <Section title="Account">
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          style={{
            padding: '10px 20px',
            borderRadius: 10,
            border: '1px solid #ef4444',
            backgroundColor: 'transparent',
            color: '#ef4444',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 14,
            opacity: isLoggingOut ? 0.7 : 1,
            // marginBottom: 12,
          }}
        >
          {isLoggingOut ? 'Signing out...' : 'Sign Out'}
        </button>

        <button
          onClick={() => setShowDeleteConfirm(true)}
          style={{
            padding: '10px 20px',
            borderRadius: 10,
            border: '1px solid #dc2626',
            backgroundColor: '#dc2626',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Delete Account
        </button>
      </Section>

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => {
            if (!isDeleting) {
              setShowDeleteConfirm(false);
              setDeletePassword('');
              setDeleteError(null);
            }
          }}
        >
          <div
            className="responsive-modal"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 16,
              padding: 28,
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: 'var(--text-primary)', marginBottom: 12, fontSize: 20, fontWeight: 700 }}>
              Delete Account
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
              This action cannot be undone. This will permanently delete your account, all your messages, and remove you from all chats.
            </p>

            {deleteError && (
              <div
                style={{
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  border: '1px solid #ef4444',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 16,
                  color: '#ef4444',
                  fontSize: 13,
                }}
              >
                {deleteError}
              </div>
            )}

            {/* Only show password field for email/password users */}
            {(() => {
              const providerData = firebaseAuth.currentUser?.providerData || [];
              const isPasswordUser = providerData.length > 0 && providerData[0]?.providerId === 'password';
              if (!isPasswordUser) return null;
              return (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Confirm your password
                  </label>
                  <input
                    type="password"
                    placeholder="Enter your password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    disabled={isDeleting}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: 14,
                      outline: 'none',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isDeleting) handleDeleteAccount();
                    }}
                  />
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePassword('');
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  opacity: isDeleting ? 0.7 : 1,
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 32 }}>
    <h3
      style={{
        color: 'var(--accent)',
        fontSize: 13,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
      }}
    >
      {title}
    </h3>
    <div
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: 12,
        padding: '8px 16px',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'center',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      {children}
    </div>
  </div >
);

const SettingRow: React.FC<{
  label: string;
  description?: string;
  children?: React.ReactNode;
}> = ({ label, description, children }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 0',
      borderBottom: '1px solid var(--border)',
      gap: 12,
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 500 }}>{label}</div>
      {description && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
          {description}
        </div>
      )}
    </div>
    <div style={{ flexShrink: 0 }}>
      {children}
    </div>
  </div>
);

const toggleBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
};

const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  flexShrink: 0,
};

export default SettingsPage;
