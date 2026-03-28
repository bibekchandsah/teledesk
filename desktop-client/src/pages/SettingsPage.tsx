import React, { useRef, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useUIStore } from '../store/uiStore';
import UserAvatar from '../components/UserAvatar';
import { updateMyProfile, uploadAvatar, get2FAStatus, disable2FA, requestEmailVerification, getMyProfile } from '../services/apiService';
import { emitActiveStatusChange } from '../services/socketService';
import { Pencil, Sun, Moon, Trash2, Sparkles, RefreshCw, ExternalLink } from 'lucide-react';
import { firebaseAuth } from '../services/firebaseService';
import TwoFactorSetupModal from '../components/modals/TwoFactorSetupModal';
import VerificationModal from '../components/modals/VerificationModal';

const SettingsPage: React.FC = () => {
  const { logout } = useAuth();
  const { currentUser, setCurrentUser } = useAuthStore();
  const { setUserProfile } = useChatStore();
  const { theme, toggleTheme, liveTypingEnabled, toggleLiveTyping, selectedMicId, setSelectedMicId } = useUIStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteVerification, setShowDeleteVerification] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionVerifyError, setDeletionVerifyError] = useState<string | null>(null);
  const [showDisableAppLockConfirm, setShowDisableAppLockConfirm] = useState(false);
  const [isDisablingAppLock, setIsDisablingAppLock] = useState(false);
  const [disableAppLockPin, setDisableAppLockPin] = useState('');
  const [disableAppLockPinError, setDisableAppLockPinError] = useState<string | null>(null);
  
  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [show2FARegenerate, setShow2FARegenerate] = useState(false);
  const [showDisable2FAConfirm, setShowDisable2FAConfirm] = useState(false);
  const [disable2FAToken, setDisable2FAToken] = useState('');
  const [disable2FAEmailOtp, setDisable2FAEmailOtp] = useState('');
  const [disable2FAMode, setDisable2FAMode] = useState<'totp' | 'email'>('totp');
  const [isRequestingEmailOtp, setIsRequestingEmailOtp] = useState(false);
  const [isDisabling2FA, setIsDisabling2FA] = useState(false);
  const [disable2FAError, setDisable2FAError] = useState('');

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

  // Load 2FA status
  useEffect(() => {
    const load2FAStatus = async () => {
      try {
        const result = await get2FAStatus();
        if (result.success && result.data) {
          setTwoFactorEnabled(result.data.enabled);
        }
      } catch (err) {
        console.error('Failed to load 2FA status:', err);
      }
    };
    load2FAStatus();
  }, []);

  const [showActiveStatus, setShowActiveStatus] = useState(currentUser?.showActiveStatus !== false);
  const [showMessageStatus, setShowMessageStatus] = useState(currentUser?.showMessageStatus !== false);
  const [showLiveTyping, setShowLiveTyping] = useState(currentUser?.showLiveTyping !== false);
  const [editingName, setEditingName] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState(currentUser?.username ?? '');
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  // AI Assistant states
  const [aiSuggestionsEnabled, setAiSuggestionsEnabled] = useState(currentUser?.aiSuggestionsEnabled === true);
  const [geminiApiKeys, setGeminiApiKeys] = useState<string[]>(currentUser?.geminiApiKeys || (currentUser?.geminiApiKey ? [currentUser.geminiApiKey] : []));
  const [newKeyInput, setNewKeyInput] = useState('');
  const [isSavingGeminiKey, setIsSavingGeminiKey] = useState(false);
  const [geminiKeySavedMessage, setGeminiKeySavedMessage] = useState('');
  const [selectedKeyIndex, setSelectedKeyIndex] = useState(0);

  const [groqApiKeys, setGroqApiKeys] = useState<string[]>(currentUser?.groqApiKeys || []);
  const [newGroqKeyInput, setNewGroqKeyInput] = useState('');
  const [isSavingGroqKey, setIsSavingGroqKey] = useState(false);
  const [groqKeySavedMessage, setGroqKeySavedMessage] = useState('');
  const [selectedGroqKeyIndex, setSelectedGroqKeyIndex] = useState(0);

  const [activeTrackerTab, setActiveTrackerTab] = useState<'gemini' | 'groq'>('gemini');

  // Sync toggle states with currentUser when it changes (e.g., after login or profile update)
  useEffect(() => {
    setShowActiveStatus(currentUser?.showActiveStatus !== false);
    setShowMessageStatus(currentUser?.showMessageStatus !== false);
    setShowLiveTyping(currentUser?.showLiveTyping !== false);
    setUsernameInput(currentUser?.username ?? '');
    setNameInput(currentUser?.name ?? '');
    setAiSuggestionsEnabled(currentUser?.aiSuggestionsEnabled === true);
    setGeminiApiKeys(currentUser?.geminiApiKeys || (currentUser?.geminiApiKey ? [currentUser.geminiApiKey] : []));
    if (selectedKeyIndex >= (currentUser?.geminiApiKeys?.length || 1)) {
      setSelectedKeyIndex(0);
    }
    setGroqApiKeys(currentUser?.groqApiKeys || []);
    if (selectedGroqKeyIndex >= (currentUser?.groqApiKeys?.length || 1)) {
      setSelectedGroqKeyIndex(0);
    }
  }, [currentUser?.showActiveStatus, currentUser?.showMessageStatus, currentUser?.showLiveTyping, currentUser?.username, currentUser?.name, currentUser?.aiSuggestionsEnabled, currentUser?.geminiApiKey, currentUser?.geminiApiKeys, currentUser?.groqApiKeys]);
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

      // 1. Request the verification code
      const reqRes = await requestEmailVerification('delete_account');
      if (reqRes.success) {
        setShowDeleteVerification(true);
        setShowDeleteConfirm(false);
      } else {
        setDeleteError(reqRes.error || 'Failed to send verification code');
      }
    } catch (error: any) {
      console.error('[Delete] Error:', error);
      setDeleteError(error.message || 'Failed to request deletion code');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeletionVerificationSuccess = async (otp: string) => {
    setIsDeleting(true);
    setDeletionVerifyError(null);
    try {
      // 2. Call the deletion API directly with the OTP
      // This performs ATOMIC verification on the backend
      const { deleteMyAccount } = await import('../services/apiService');
      const result = await deleteMyAccount(otp);

      if (!result.success) {
        setDeletionVerifyError(result.error || 'Failed to delete account');
        setIsDeleting(false);
        return;
      }

      setShowDeleteVerification(false);
      await logout();
      window.location.href = '/login?logout=true';
    } catch (error: any) {
      console.error('[Delete] Verification Error:', error);
      setDeletionVerifyError(error.message || 'Failed to delete account');
      setIsDeleting(false);
    }
  };

  const handleRequestDisable2FAEmail = async () => {
    setIsRequestingEmailOtp(true);
    setDisable2FAError('');
    try {
      const res = await requestEmailVerification('two_factor');
      if (res.success) {
        setDisable2FAMode('email');
      } else {
        setDisable2FAError(res.error || 'Failed to send verification code');
      }
    } catch (err) {
      setDisable2FAError('Failed to send verification code');
    } finally {
      setIsRequestingEmailOtp(false);
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

  const handleToggleLiveTyping = async () => {
    const newVal = !showLiveTyping;
    setShowLiveTyping(newVal);
    try {
      const res = await updateMyProfile({ showLiveTyping: newVal });
      if (res.success && res.data) setCurrentUser(res.data);
      const socket = (await import('../services/socketService')).getSocket();
      if (socket) {
        socket.emit('live_typing_status_changed', { showLiveTyping: newVal });
      }
    } catch (e) {
      console.error('[Settings] Failed to update live typing setting', e);
      setShowLiveTyping(!newVal); // rollback on error
    }
  };

  const handleToggleAiSuggestions = async () => {
    const newVal = !aiSuggestionsEnabled;
    setAiSuggestionsEnabled(newVal);
    try {
      const res = await updateMyProfile({ aiSuggestionsEnabled: newVal });
      if (res.success && res.data) setCurrentUser(res.data);
    } catch (e) {
      console.error('[Settings] Failed to update AI suggestions setting', e);
      setAiSuggestionsEnabled(!newVal); // rollback on error
    }
  };

  const handleAddGeminiKey = async () => {
    const trimmed = newKeyInput.trim();
    if (!trimmed || !currentUser) return;
    if (geminiApiKeys.includes(trimmed)) {
      setGeminiKeySavedMessage('Key already added');
      return;
    }
    
    const updatedKeys = [...geminiApiKeys, trimmed];
    setIsSavingGeminiKey(true);
    try {
      const res = await updateMyProfile({ 
        geminiApiKeys: updatedKeys,
        geminiApiKey: updatedKeys[0] // sync first key to legacy field
      });
      if (res.success && res.data) {
        setCurrentUser(res.data);
        setNewKeyInput('');
        setGeminiKeySavedMessage('Key added successfully');
      } else {
        setGeminiKeySavedMessage('Failed to add key');
      }
    } catch (err) {
      setGeminiKeySavedMessage('Error adding key');
    } finally {
      setIsSavingGeminiKey(false);
      setTimeout(() => setGeminiKeySavedMessage(''), 3000);
    }
  };

  const handleRemoveGeminiKey = async (keyToRemove: string) => {
    if (!currentUser) return;
    const updatedKeys = geminiApiKeys.filter(k => k !== keyToRemove);
    setIsSavingGeminiKey(true);
    try {
      const res = await updateMyProfile({ 
        geminiApiKeys: updatedKeys,
        geminiApiKey: updatedKeys[0] || '' // sync or clear legacy field
      });
      if (res.success && res.data) {
        setCurrentUser(res.data);
        setGeminiKeySavedMessage('Key removed');
      }
    } catch (err) {
      setGeminiKeySavedMessage('Error removing key');
    } finally {
      setIsSavingGeminiKey(false);
      setTimeout(() => setGeminiKeySavedMessage(''), 3000);
    }
  };

  const handleAddGroqKey = async () => {
    const trimmed = newGroqKeyInput.trim();
    if (!trimmed || !currentUser) return;
    if (groqApiKeys.includes(trimmed)) {
      setGroqKeySavedMessage('Key already added');
      return;
    }
    
    const updatedKeys = [...groqApiKeys, trimmed];
    setIsSavingGroqKey(true);
    try {
      const res = await updateMyProfile({ groqApiKeys: updatedKeys });
      if (res.success && res.data) {
        setCurrentUser(res.data);
        setNewGroqKeyInput('');
        setGroqKeySavedMessage('Key added successfully');
      } else {
        setGroqKeySavedMessage('Failed to add key');
      }
    } catch (err) {
      setGroqKeySavedMessage('Error adding key');
    } finally {
      setIsSavingGroqKey(false);
      setTimeout(() => setGroqKeySavedMessage(''), 3000);
    }
  };

  const handleRemoveGroqKey = async (keyToRemove: string) => {
    if (!currentUser) return;
    const updatedKeys = groqApiKeys.filter(k => k !== keyToRemove);
    setIsSavingGroqKey(true);
    try {
      const res = await updateMyProfile({ groqApiKeys: updatedKeys });
      if (res.success && res.data) {
        setCurrentUser(res.data);
        setGroqKeySavedMessage('Key removed');
      }
    } catch (err) {
      setGroqKeySavedMessage('Error removing key');
    } finally {
      setIsSavingGroqKey(false);
      setTimeout(() => setGroqKeySavedMessage(''), 3000);
    }
  };

  if (!currentUser) return null;

  return (
    <div
      className="responsive-scroll-page"
      style={{
        flex: 1,
        // overflowY: 'auto',
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
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 2, display: 'flex', alignItems: 'center', transition: 'opacity 0.2s ease' }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
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
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 2, display: 'flex', alignItems: 'center', transition: 'opacity 0.2s ease' }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
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

      {/* AI Assistant */}
      <Section title="AI Assistant">
        <SettingRow
          label="Enable AI Suggestions"
          description="Get smart message suggestions using Google's Gemini AI"
        >
          <button
            onClick={handleToggleAiSuggestions}
            style={{
              width: 46,
              height: 26,
              borderRadius: 13,
              border: 'none',
              backgroundColor: aiSuggestionsEnabled ? 'var(--accent)' : 'var(--bg-tertiary)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                backgroundColor: '#fff',
                position: 'absolute',
                left: aiSuggestionsEnabled ? 23 : 3,
                transition: 'left 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              }}
            />
          </button>
        </SettingRow>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24, padding: '0 8px' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Gemini API Keys</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Add multiple keys for automatic failover. Currently: {geminiApiKeys.length} keys</div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
            {/* New key input */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                placeholder="Add new Gemini API Key"
                value={newKeyInput}
                onChange={(e) => setNewKeyInput(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  flex: 1,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleAddGeminiKey}
                disabled={isSavingGeminiKey || !newKeyInput.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  backgroundColor: newKeyInput.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: newKeyInput.trim() ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: (isSavingGeminiKey || !newKeyInput.trim()) ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
              >
                {isSavingGeminiKey ? '...' : 'Add'}
              </button>
            </div>

            {/* List of keys */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {geminiApiKeys.map((key, index) => {
                const usage = (currentUser?.aiUsageCounts && currentUser.aiUsageCounts[index]) || 0;
                const limit = 1500; // Standard free tier limit
                const percentage = Math.min(100, (usage / limit) * 100);
                
                let barColor = '#22c55e'; // Green
                if (percentage > 80) barColor = '#ef4444'; // Red
                else if (percentage > 50) barColor = '#eab308'; // Yellow

                const isSelected = selectedKeyIndex === index;

                return (
                  <div 
                    key={index} 
                    onClick={() => setSelectedKeyIndex(index)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 8,
                      backgroundColor: isSelected ? 'rgba(var(--accent-rgb), 0.05)' : 'var(--bg-secondary)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      overflow: 'hidden',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div 
                          title={index === 0 ? 'Primary Key' : 'Backup Key'}
                          style={{ 
                            width: 6, 
                            height: 6, 
                            borderRadius: '50%', 
                            backgroundColor: index === 0 ? '#22c55e' : 'var(--text-secondary)',
                          }} 
                        />
                        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                          ••••••••{key.slice(-4)}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.8 }}>
                          ({usage}/{limit})
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveGeminiKey(key);
                        }}
                        style={{
                          border: 'none',
                          background: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: 4,
                          opacity: 0.7,
                          zIndex: 2
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {/* Progress Bar */}
                    <div style={{ 
                      height: 2, 
                      width: '100%', 
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      marginTop: -2 
                    }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${percentage}%`, 
                        backgroundColor: barColor,
                        transition: 'width 0.3s ease, background-color 0.3s ease'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                Get API Key <ExternalLink size={10} />
              </a>
              <a 
                href="https://aistudio.google.com/app/usage" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                Check official usage <ExternalLink size={10} />
              </a>
            </div>

            {geminiKeySavedMessage && (
              <span style={{ fontSize: 11, color: geminiKeySavedMessage.includes('Failed') || geminiKeySavedMessage.includes('Error') ? '#ef4444' : '#22c55e' }}>
                {geminiKeySavedMessage}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24, padding: '0 8px' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Groq API Keys</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Ultra-fast fallback when Gemini hits limits. Currently: {groqApiKeys.length} keys</div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
            {/* New key input */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                placeholder="Add new Groq API Key (gsk_...)"
                value={newGroqKeyInput}
                onChange={(e) => setNewGroqKeyInput(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  flex: 1,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleAddGroqKey}
                disabled={isSavingGroqKey || !newGroqKeyInput.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  backgroundColor: newGroqKeyInput.trim() ? '#f55036' : 'var(--bg-tertiary)', // Groq orange
                  color: newGroqKeyInput.trim() ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: (isSavingGroqKey || !newGroqKeyInput.trim()) ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
              >
                {isSavingGroqKey ? '...' : 'Add'}
              </button>
            </div>

            {/* List of keys */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groqApiKeys.map((key, index) => {
                const usage = (currentUser?.groqUsageCounts && currentUser.groqUsageCounts[index]) || 0;
                const limit = 1500; // Tracked limit mirroring Gemini
                const percentage = Math.min(100, (usage / limit) * 100);
                
                let barColor = '#22c55e'; // Green
                if (percentage > 80) barColor = '#ef4444'; // Red
                else if (percentage > 50) barColor = '#eab308'; // Yellow

                const isSelected = selectedGroqKeyIndex === index;

                return (
                  <div 
                    key={index} 
                    onClick={() => setSelectedGroqKeyIndex(index)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 8,
                      backgroundColor: isSelected ? 'rgba(245, 80, 54, 0.05)' : 'var(--bg-secondary)',
                      border: `1px solid ${isSelected ? '#f55036' : 'var(--border)'}`,
                      overflow: 'hidden',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div 
                          title="Backup Key"
                          style={{ 
                            width: 6, 
                            height: 6, 
                            borderRadius: '50%', 
                            backgroundColor: '#f55036',
                          }} 
                        />
                        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                          ••••••••{key.slice(-4)}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.8 }}>
                          ({usage}/{limit})
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveGroqKey(key);
                        }}
                        style={{
                          border: 'none',
                          background: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: 4,
                          opacity: 0.7,
                          zIndex: 2
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {/* Progress Bar */}
                    <div style={{ 
                      height: 2, 
                      width: '100%', 
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      marginTop: -2 
                    }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${percentage}%`, 
                        backgroundColor: barColor,
                        transition: 'width 0.3s ease, background-color 0.3s ease'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <a 
                href="https://console.groq.com/keys" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: '#f55036', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                Get Groq Key <ExternalLink size={10} />
              </a>
            </div>

            {groqKeySavedMessage && (
              <span style={{ fontSize: 11, color: groqKeySavedMessage.includes('Failed') || groqKeySavedMessage.includes('Error') ? '#ef4444' : '#22c55e' }}>
                {groqKeySavedMessage}
              </span>
            )}
          </div>
        </div>

        {/* AI Usage Tracker */}
        {aiSuggestionsEnabled && (geminiApiKeys.length > 0 || groqApiKeys.length > 0) && (
          <div style={{ 
            marginTop: 8, 
            padding: '16px', 
            borderRadius: 12, 
            backgroundColor: 'var(--bg-tertiary)', 
            border: '1px solid var(--border)',
            animation: 'fadeIn 0.3s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Request Usage
                  </span>
                </div>
                
                <div style={{ display: 'flex', backgroundColor: 'var(--bg-secondary)', borderRadius: 8, padding: 2, border: '1px solid var(--border)' }}>
                  <button 
                    onClick={() => setActiveTrackerTab('gemini')}
                    style={{ 
                      padding: '4px 10px', 
                      fontSize: 11, 
                      fontWeight: 700, 
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: activeTrackerTab === 'gemini' ? 'var(--accent)' : 'transparent',
                      color: activeTrackerTab === 'gemini' ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    Gemini
                  </button>
                  <button 
                    onClick={() => setActiveTrackerTab('groq')}
                    style={{ 
                      padding: '4px 10px', 
                      fontSize: 11, 
                      fontWeight: 700, 
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: activeTrackerTab === 'groq' ? '#f55036' : 'transparent',
                      color: activeTrackerTab === 'groq' ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    Groq
                  </button>
                </div>
              </div>
              
              <button 
                onClick={async () => {
                  try {
                    const res = await getMyProfile();
                    if (res.success && res.data) setCurrentUser(res.data);
                  } catch (e) {}
                }}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer', 
                  color: 'var(--accent)', 
                  display: 'flex', 
                  alignItems: 'center',
                  padding: 4,
                  borderRadius: 4,
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(var(--accent-rgb), 0.1)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                title="Refresh usage statistics"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            
            {/* Stat Row */}
            {(() => {
              const isGemini = activeTrackerTab === 'gemini';
              const keys = isGemini ? geminiApiKeys : groqApiKeys;
              const idx = isGemini ? selectedKeyIndex : selectedGroqKeyIndex;
              const counts = isGemini ? currentUser.aiUsageCounts : currentUser.groqUsageCounts;
              const usage = (counts && counts[idx]) || 0;
              const limit = currentUser.aiUsageLimit || 1500;
              const percentage = Math.min(100, (usage / limit) * 100);
              const accentColor = isGemini ? 'var(--accent)' : '#f55036';

              if (keys.length === 0) {
                return (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                    No {isGemini ? 'Gemini' : 'Groq'} keys configured.
                  </div>
                );
              }

              return (
                <>
                  <div style={{ 
                    position: 'relative', 
                    height: 10, 
                    width: '100%', 
                    backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: 5, 
                    overflow: 'hidden', 
                    marginBottom: 10,
                    border: '1px solid var(--border)'
                  }}>
                    <div style={{ 
                      position: 'absolute', 
                      left: 0, 
                      top: 0, 
                      height: '100%', 
                      width: `${percentage}%`, 
                      background: isGemini 
                        ? 'linear-gradient(90deg, var(--accent) 0%, #818cf8 100%)'
                        : 'linear-gradient(90deg, #f55036 0%, #fa7c68 100%)',
                      transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: `0 0 10px ${isGemini ? 'rgba(99, 102, 241, 0.3)' : 'rgba(245, 80, 54, 0.3)'}`
                    }} />
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                    <span style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: accentColor }} />
                      Key #{idx + 1}: <strong>{usage}</strong> / {limit} requests
                    </span>
                    <span style={{ fontSize: 11, opacity: 0.8 }}>Resets every 24h</span>
                  </div>
                </>
              );
            })()}

            <div style={{
              marginTop: 16, 
              paddingTop: 12, 
              borderTop: '1px solid var(--border)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Daily Strategy</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Adjust limit based on your API tier</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'var(--bg-secondary)', padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>MAX:</span>
                <input 
                  type="number"
                  min="1"
                  max="10000"
                  value={currentUser.aiUsageLimit || 1500}
                  onChange={async (e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) {
                      try {
                        const res = await updateMyProfile({ aiUsageLimit: val });
                        if (res.success && res.data) setCurrentUser(res.data);
                      } catch (e) {}
                    }
                  }}
                  style={{ 
                    width: 55, 
                    padding: '2px 4px', 
                    fontSize: 12, 
                    fontWeight: 700,
                    background: 'transparent', 
                    border: 'none', 
                    color: 'var(--accent)',
                    textAlign: 'right',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>
        )}
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
            onClick={handleToggleLiveTyping}
            style={{
              width: 46,
              height: 26,
              borderRadius: 13,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: showLiveTyping ? 'var(--accent)' : 'var(--bg-tertiary)',
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
                left: showLiveTyping ? 23 : 3,
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

        <SettingRow
          label="App Lock"
          description={currentUser?.appLockEnabled ? "App requires PIN on launch. Disable or change PIN." : "Require PIN to unlock app on launch"}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {currentUser?.appLockEnabled && (
              <button
                onClick={() => {
                  useUIStore.getState().setAppLockModal({ mode: 'change' });
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
                Change PIN
              </button>
            )}
            <button
              onClick={() => {
                if (currentUser?.appLockEnabled) {
                  setShowDisableAppLockConfirm(true);
                } else {
                  useUIStore.getState().setAppLockModal({ mode: 'setup' });
                }
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                backgroundColor: currentUser?.appLockEnabled ? 'rgba(239, 68, 68, 0.1)' : 'var(--accent)',
                color: currentUser?.appLockEnabled ? '#ef4444' : '#fff',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              {currentUser?.appLockEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </SettingRow>

        <SettingRow
          label="Two-Factor Authentication"
          description={twoFactorEnabled ? "Extra security with authenticator app. Disable or regenerate QR code." : "Add an extra layer of security with Google/Microsoft Authenticator"}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {twoFactorEnabled && (
              <button
                onClick={() => setShow2FARegenerate(true)}
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
                Regenerate QR
              </button>
            )}
            <button
              onClick={() => {
                if (twoFactorEnabled) {
                  setShowDisable2FAConfirm(true);
                } else {
                  setShow2FASetup(true);
                }
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                backgroundColor: twoFactorEnabled ? 'rgba(239, 68, 68, 0.1)' : 'var(--accent)',
                color: twoFactorEnabled ? '#ef4444' : '#fff',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              {twoFactorEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
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
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>1.0.04</span>
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
            marginBottom: 12,
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

      {/* Disable App Lock Confirmation Modal */}
      {showDisableAppLockConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: 20,
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={() => {
            if (!isDisablingAppLock) {
              setShowDisableAppLockConfirm(false);
              setDisableAppLockPin('');
              setDisableAppLockPinError(null);
            }
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 20,
              padding: 32,
              maxWidth: 400,
              width: '100%',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
              animation: 'slideUp 0.3s ease-out',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
              }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: 8, fontSize: 20, fontWeight: 700 }}>
                Confirm Your PIN
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                Enter your 6-digit app lock PIN to disable it.
              </p>
            </div>

            {/* PIN Input */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (disableAppLockPin.length !== 6) return;
                setIsDisablingAppLock(true);
                setDisableAppLockPinError(null);
                try {
                  const { verifyAppLockPin, removeAppLockPin } = await import('../services/apiService');
                  const verify = await verifyAppLockPin(disableAppLockPin);
                  if (!verify.success || !verify.data?.isValid) {
                    setDisableAppLockPinError('Incorrect PIN. Please try again.');
                    setDisableAppLockPin('');
                    return;
                  }
                  const res = await removeAppLockPin();
                  if (res.success) {
                    setCurrentUser({ ...currentUser, appLockEnabled: false, appLockPin: undefined });
                    setUserProfile({ ...currentUser, appLockEnabled: false, appLockPin: undefined });
                    setShowDisableAppLockConfirm(false);
                    setDisableAppLockPin('');
                  }
                } catch (error) {
                  console.error('Failed to disable app lock:', error);
                  setDisableAppLockPinError('Something went wrong. Please try again.');
                } finally {
                  setIsDisablingAppLock(false);
                }
              }}
            >
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={disableAppLockPin}
                onChange={(e) => {
                  setDisableAppLockPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setDisableAppLockPinError(null);
                }}
                placeholder="••••••"
                autoFocus
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  borderRadius: 12,
                  border: `2px solid ${disableAppLockPinError ? '#ef4444' : 'var(--border)'}`,
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: 24,
                  fontWeight: 600,
                  textAlign: 'center',
                  letterSpacing: '0.5em',
                  outline: 'none',
                  marginBottom: 8,
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => {
                  if (!disableAppLockPinError) e.currentTarget.style.borderColor = 'var(--accent)';
                }}
                onBlur={(e) => {
                  if (!disableAppLockPinError) e.currentTarget.style.borderColor = 'var(--border)';
                }}
              />

              {disableAppLockPinError && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#f87171',
                  fontSize: 13,
                  marginBottom: 16,
                  padding: '8px 12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: 8,
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {disableAppLockPinError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: disableAppLockPinError ? 0 : 16 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowDisableAppLockConfirm(false);
                    setDisableAppLockPin('');
                    setDisableAppLockPinError(null);
                  }}
                  disabled={isDisablingAppLock}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    cursor: isDisablingAppLock ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    opacity: isDisablingAppLock ? 0.5 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDisablingAppLock || disableAppLockPin.length !== 6}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: (isDisablingAppLock || disableAppLockPin.length !== 6) ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    opacity: (isDisablingAppLock || disableAppLockPin.length !== 6) ? 0.6 : 1,
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                  }}
                >
                  {isDisablingAppLock ? 'Verifying...' : 'Disable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
            animation: 'fadeIn 0.2s ease-out',
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
              borderRadius: 20,
              padding: 32,
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
              animation: 'slideUp 0.3s ease-out',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(220, 38, 38, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  border: '2px solid rgba(220, 38, 38, 0.3)',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: 8, fontSize: 22, fontWeight: 700 }}>
                Delete Account
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
                This action cannot be undone. This will permanently delete your account, all your messages, and remove you from all chats.
              </p>
            </div>

            {deleteError && (
              <div
                style={{
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 20,
                  color: '#ef4444',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
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
                  <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
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
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: 15,
                      outline: 'none',
                      transition: 'border-color 0.2s ease',
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isDeleting) handleDeleteAccount();
                    }}
                  />
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePassword('');
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  fontSize: 15,
                  opacity: isDeleting ? 0.5 : 1,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isDeleting) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  fontSize: 15,
                  opacity: isDeleting ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                }}
                onMouseEnter={(e) => {
                  if (!isDeleting) {
                    e.currentTarget.style.backgroundColor = '#b91c1c';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#dc2626';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.3)';
                }}
              >
                {isDeleting ? 'Requesting Code...' : 'Send Verification Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2FA Setup Modal */}
      {show2FASetup && (
        <TwoFactorSetupModal
          onClose={() => setShow2FASetup(false)}
          onSuccess={() => {
            setTwoFactorEnabled(true);
            setCurrentUser({ ...currentUser!, twoFactorEnabled: true });
          }}
        />
      )}

      {/* 2FA Regenerate Modal */}
      {show2FARegenerate && (
        <TwoFactorSetupModal
          isRegenerate
          onClose={() => setShow2FARegenerate(false)}
          onSuccess={() => {}}
        />
      )}



      {/* Disable 2FA Confirmation Modal */}
      {showDisable2FAConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: 20,
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={() => {
            setShowDisable2FAConfirm(false);
            setDisable2FAToken('');
            setDisable2FAError('');
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 20,
              padding: 32,
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
              animation: 'slideUp 0.3s ease-out',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                border: '2px solid rgba(239, 68, 68, 0.3)',
              }}>
                <Trash2 size={28} color="#ef4444" />
              </div>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: 8, fontSize: 22, fontWeight: 700 }}>
                Disable Two-Factor Authentication?
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
                Your account will be less secure. {disable2FAMode === 'totp' ? 'Enter your current 6-digit code to confirm.' : `Enter the 6-digit code we sent to ${currentUser?.email}.`}
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 16 }}>
                <button
                  onClick={() => setDisable2FAMode('totp')}
                  style={{
                    background: 'none', border: 'none', padding: '4px 8px', fontSize: 13,
                    color: disable2FAMode === 'totp' ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: disable2FAMode === 'totp' ? 700 : 400,
                    borderBottom: disable2FAMode === 'totp' ? '2px solid var(--accent)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  App Code
                </button>
                <button
                  onClick={handleRequestDisable2FAEmail}
                  disabled={isRequestingEmailOtp}
                  style={{
                    background: 'none', border: 'none', padding: '4px 8px', fontSize: 13,
                    color: disable2FAMode === 'email' ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: disable2FAMode === 'email' ? 700 : 400,
                    borderBottom: disable2FAMode === 'email' ? '2px solid var(--accent)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  {isRequestingEmailOtp ? 'Sending...' : 'Email OTP'}
                </button>
              </div>

              <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                {disable2FAMode === 'totp' ? 'Authenticator App Code' : 'Email Verification Code'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={disable2FAMode === 'totp' ? disable2FAToken : disable2FAEmailOtp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (disable2FAMode === 'totp') setDisable2FAToken(val);
                  else setDisable2FAEmailOtp(val);
                  setDisable2FAError('');
                }}
                placeholder="000000"
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: 16,
                  fontFamily: 'monospace',
                  letterSpacing: '0.5em',
                  textAlign: 'center',
                  outline: 'none',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>

            {disable2FAError && (
              <div style={{
                padding: 12,
                borderRadius: 8,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: 13,
                marginBottom: 16,
              }}>
                {disable2FAError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  setShowDisable2FAConfirm(false);
                  setDisable2FAToken('');
                  setDisable2FAError('');
                }}
                disabled={isDisabling2FA}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  cursor: isDisabling2FA ? 'not-allowed' : 'pointer',
                  fontSize: 15,
                  opacity: isDisabling2FA ? 0.5 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const token = disable2FAMode === 'totp' ? disable2FAToken : undefined;
                  const emailOtp = disable2FAMode === 'email' ? disable2FAEmailOtp : undefined;

                  if (disable2FAMode === 'totp' && (!token || token.length !== 6)) {
                    setDisable2FAError('Please enter a 6-digit code');
                    return;
                  }
                  if (disable2FAMode === 'email' && (!emailOtp || emailOtp.length !== 6)) {
                    setDisable2FAError('Please enter a 6-digit code');
                    return;
                  }

                  setIsDisabling2FA(true);
                  setDisable2FAError('');
                  try {
                    const res = await disable2FA(token, emailOtp);
                    if (res.success) {
                      setTwoFactorEnabled(false);
                      setCurrentUser({ ...currentUser!, twoFactorEnabled: false });
                      setShowDisable2FAConfirm(false);
                      setDisable2FAToken('');
                      setDisable2FAEmailOtp('');
                    } else {
                      setDisable2FAError(res.error || 'Invalid verification code');
                    }
                  } catch (error) {
                    console.error('Failed to disable 2FA:', error);
                    setDisable2FAError('Failed to disable 2FA');
                  } finally {
                    setIsDisabling2FA(false);
                  }
                }}
                disabled={isDisabling2FA || (disable2FAMode === 'totp' ? disable2FAToken.length !== 6 : disable2FAEmailOtp.length !== 6)}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: isDisabling2FA || disable2FAToken.length !== 6 ? 'not-allowed' : 'pointer',
                  fontSize: 15,
                  opacity: isDisabling2FA || disable2FAToken.length !== 6 ? 0.5 : 1,
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                }}
              >
                {isDisabling2FA ? 'Disabling...' : 'Disable 2FA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Deletion Verification Modal */}
      <VerificationModal
        isOpen={showDeleteVerification}
        onClose={() => setShowDeleteVerification(false)}
        onVerified={handleDeletionVerificationSuccess}
        action="delete_account"
        title="Verify Account Deletion"
        description="To permanently delete your account, please enter the 6-digit code we sent to your email."
        shouldVerify={false}
        isExternalLoading={isDeleting}
        externalError={deletionVerifyError}
      />
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
        flexDirection: 'column',
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
