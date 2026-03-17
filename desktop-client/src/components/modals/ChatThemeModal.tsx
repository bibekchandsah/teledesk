import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Trash2, Eye, EyeOff, Image as ImageIcon } from 'lucide-react';
import { ChatTheme } from '@shared/types';
import { setChatTheme, removeChatTheme } from '../../services/apiService';
import { uploadChatFile } from '../../services/fileService';
import { useAuthStore } from '../../store/authStore';
import { sendThemePreview } from '../../services/socketService';
import ConfirmModal from './ConfirmModal';
import PremiumToggle from '../PremiumToggle';

interface ChatThemeModalProps {
  chatId: string;
  currentTheme?: ChatTheme;
  peerTheme?: ChatTheme;
  onClose: () => void;
  onSave: (theme: ChatTheme) => void;
}

const ChatThemeModal: React.FC<ChatThemeModalProps> = ({ chatId, currentTheme, peerTheme, onClose, onSave }) => {
  const { currentUser, setCurrentUser } = useAuthStore();
  const [activeSource, setActiveSource] = useState<'me' | 'peer'>(
    currentTheme?.backgroundImage || !peerTheme ? 'me' : 'peer'
  );
  const [theme, setTheme] = useState<ChatTheme>(currentTheme || {
    opacity: 0.8,
    blur: 10,
    showToOthers: false,
    peerOverrides: {},
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(currentTheme?.backgroundImage || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Emit live preview to peer if showToOthers is enabled
  useEffect(() => {
    if (theme.showToOthers) {
      sendThemePreview(chatId, theme);
    } else {
      // If disabled, send empty theme so peer hides their preview
      sendThemePreview(chatId, {});
    }
  }, [theme, chatId]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be under 10 MB');
      return;
    }

    setUploading(true);
    try {
      const result = await uploadChatFile(file, chatId, (progress) => {
        // Optional: could show upload progress
      });
      if (result.url) {
        setTheme({ ...theme, backgroundImage: result.url, backgroundColor: undefined });
        setImagePreview(result.url);
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = () => {
    setTheme({ ...theme, backgroundImage: undefined });
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await setChatTheme(chatId, theme);
      if (res.success) {
        // Update local user state
        if (currentUser) {
          const updatedThemes = { ...currentUser.chatThemes, [chatId]: theme };
          setCurrentUser({ ...currentUser, chatThemes: updatedThemes });
        }
        onSave(theme);
        onClose();
      }
    } catch (error) {
      console.error('Failed to save theme:', error);
      alert('Failed to save theme');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveTheme = async () => {
    setShowConfirm(true);
  };

  const confirmRemoveTheme = async () => {
    setSaving(true);
    try {
      if (activeSource === 'me') {
        // Removing own theme
        const res = await removeChatTheme(chatId);
        if (res.success) {
          if (currentUser) {
            const updatedThemes = { ...currentUser.chatThemes };
            delete updatedThemes[chatId];
            setCurrentUser({ ...currentUser, chatThemes: updatedThemes });
          }
          onSave({} as ChatTheme);
          onClose();
        }
      } else {
        // Removing peer's shared theme (ignoring it and clearing overrides)
        const myTheme = currentUser?.chatThemes?.[chatId] || { opacity: 0.8, blur: 5, showToOthers: false };
        const updatedTheme: ChatTheme = {
          ...myTheme,
          opacity: myTheme.opacity ?? 0.8,
          blur: myTheme.blur ?? 5,
          showToOthers: myTheme.showToOthers ?? false,
          peerThemeIgnored: true, // New flag to indicate we don't want to see their theme
          peerOverrides: undefined // Clear any custom overrides
        };
        
        const res = await setChatTheme(chatId, updatedTheme);
        if (res.success) {
          if (currentUser) {
            const updatedThemes = { ...currentUser.chatThemes, [chatId]: updatedTheme };
            setCurrentUser({ ...currentUser, chatThemes: updatedThemes });
          }
          // The ChatWindow displayTheme memo will now see peerThemeIgnored and fallback to 'me' or default
          onSave(updatedTheme);
          onClose();
        }
      }
    } catch (error) {
      console.error('Failed to remove theme:', error);
      alert('Failed to remove theme');
    } finally {
      setSaving(false);
    }
  };

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 20,
          padding: 32,
          maxWidth: 500,
          width: '100%',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
          animation: 'slideUp 0.3s ease-out',
          border: '1px solid rgba(255,255,255,0.08)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Theme Source Selection (Tabs) */}
        {peerTheme && (
          <div style={{ 
            display: 'flex', 
            backgroundColor: 'var(--bg-tertiary)', 
            padding: 4, 
            borderRadius: 12, 
            marginBottom: 24,
            gap: 4
          }}>
            <button
              onClick={() => setActiveSource('me')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 9,
                border: 'none',
                backgroundColor: activeSource === 'me' ? 'var(--bg-secondary)' : 'transparent',
                color: activeSource === 'me' ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: activeSource === 'me' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              My Theme
            </button>
            <button
              onClick={() => setActiveSource('peer')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 9,
                border: 'none',
                backgroundColor: activeSource === 'peer' ? 'var(--bg-secondary)' : 'transparent',
                color: activeSource === 'peer' ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: activeSource === 'peer' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              Peer's Shared Theme
            </button>
          </div>
        )}

        {/* Live Preview */}
        {((activeSource === 'me' && imagePreview) || (activeSource === 'peer' && peerTheme?.backgroundImage)) && (
          <div style={{ 
            marginBottom: 24, 
            borderRadius: 12, 
            overflow: 'hidden', 
            position: 'relative', 
            height: 120,
            backgroundImage: `url(${activeSource === 'me' ? imagePreview : peerTheme?.backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}>
            <div style={{ position: 'relative', height: '100%' }}>
              {/* Backdrop overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: `rgba(15, 23, 42, ${1 - (activeSource === 'me' ? theme.opacity : (theme.peerOverrides?.opacity ?? peerTheme!.opacity))})`,
                  backdropFilter: (activeSource === 'me' ? theme.blur : (theme.peerOverrides?.blur ?? peerTheme!.blur)) > 0 
                    ? `blur(${activeSource === 'me' ? theme.blur : (theme.peerOverrides?.blur ?? peerTheme!.blur)}px)` 
                    : undefined,
                  WebkitBackdropFilter: (activeSource === 'me' ? theme.blur : (theme.peerOverrides?.blur ?? peerTheme!.blur)) > 0 
                    ? `blur(${activeSource === 'me' ? theme.blur : (theme.peerOverrides?.blur ?? peerTheme!.blur)}px)` 
                    : undefined,
                  pointerEvents: 'none',
                }}
              />
              {/* Preview text */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontWeight: 500,
                  textShadow: '0 1px 4px rgba(0,0,0,0.8)'
                }}
              >
                {activeSource === 'peer' ? "Peer's Theme Preview" : "My Theme Preview"}
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, margin: 0 }}>
            Chat Theme
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              borderRadius: 8,
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Background Image - Only for 'me' source */}
        {activeSource === 'me' && (
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Background Image
            </label>
          
          {imagePreview ? (
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
              <img
                src={imagePreview}
                alt="Background preview"
                style={{
                  width: '100%',
                  height: 200,
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <button
                onClick={handleRemoveImage}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  padding: 8,
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  backdropFilter: 'blur(8px)',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <Trash2 size={14} />
                Remove
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                width: '100%',
                padding: '40px 20px',
                borderRadius: 12,
                border: '2px dashed var(--border)',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                cursor: uploading ? 'not-allowed' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!uploading) {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
              }}
            >
              {uploading ? (
                <>
                  <div className="spinner" style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <ImageIcon size={32} />
                  <span style={{ fontWeight: 500 }}>Click to upload image</span>
                  <span style={{ fontSize: 12 }}>Max 10 MB</span>
                </>
              )}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageUpload}
            />
          </div>
        )}

        {/* Opacity Slider */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            <span>{activeSource === 'me' ? 'Opacity' : 'Local Opacity Overwrite'}</span>
            <span style={{ color: 'var(--accent)' }}>
              {Math.round((activeSource === 'me' ? theme.opacity : (theme.peerOverrides?.opacity ?? peerTheme!.opacity)) * 100)}%
            </span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={activeSource === 'me' ? theme.opacity : (theme.peerOverrides?.opacity ?? peerTheme!.opacity)}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (activeSource === 'me') {
                setTheme({ ...theme, opacity: val });
              } else {
                setTheme({ ...theme, peerOverrides: { ...theme.peerOverrides, opacity: val } });
              }
            }}
            style={{
              width: '100%',
              height: 6,
              borderRadius: 3,
              outline: 'none',
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${(activeSource === 'me' ? theme.opacity : (theme.peerOverrides?.opacity ?? peerTheme!.opacity)) * 100}%, var(--bg-tertiary) ${(activeSource === 'me' ? theme.opacity : (theme.peerOverrides?.opacity ?? peerTheme!.opacity)) * 100}%, var(--bg-tertiary) 100%)`,
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Blur Slider */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            <span>{activeSource === 'me' ? 'Blur' : 'Local Blur Overwrite'}</span>
            <span style={{ color: 'var(--accent)' }}>
              {activeSource === 'me' ? theme.blur : (theme.peerOverrides?.blur ?? peerTheme!.blur)}px
            </span>
          </label>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={activeSource === 'me' ? theme.blur : (theme.peerOverrides?.blur ?? peerTheme!.blur)}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (activeSource === 'me') {
                setTheme({ ...theme, blur: val });
              } else {
                setTheme({ ...theme, peerOverrides: { ...theme.peerOverrides, blur: val } });
              }
            }}
            style={{
              width: '100%',
              height: 6,
              borderRadius: 3,
              outline: 'none',
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((activeSource === 'me' ? theme.blur : (theme.peerOverrides?.blur ?? peerTheme!.blur)) / 50) * 100}%, var(--bg-tertiary) ${((activeSource === 'me' ? theme.blur : (theme.peerOverrides?.blur ?? peerTheme!.blur)) / 50) * 100}%, var(--bg-tertiary) 100%)`,
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Show to Others Toggle - Only for 'me' source */}
        {activeSource === 'me' && (
          <div style={{ marginBottom: 28 }}>
            <PremiumToggle
              label="Show to Others"
              description="Let the other person see your custom theme"
              checked={theme.showToOthers}
              onChange={(val) => setTheme({ ...theme, showToOthers: val })}
              iconOn={<Eye size={12} color="var(--accent)" />}
              iconOff={<EyeOff size={12} color="var(--text-secondary)" />}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          {((activeSource === 'me' && currentTheme) || (activeSource === 'peer' && peerTheme && !theme.peerThemeIgnored)) && (
            <button
              onClick={handleRemoveTheme}
              disabled={saving}
              style={{
                flex: 1,
                padding: '12px 24px',
                borderRadius: 12,
                border: '1px solid rgba(239, 68, 68, 0.3)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 15,
                opacity: saving ? 0.5 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              Remove Theme
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            style={{
              flex: 1,
              padding: '12px 24px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
              color: '#fff',
              fontWeight: 600,
              cursor: (saving || uploading) ? 'not-allowed' : 'pointer',
              fontSize: 15,
              opacity: (saving || uploading) ? 0.7 : 1,
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
            }}
          >
            {saving ? 'Saving...' : 'Save Theme'}
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={confirmRemoveTheme}
        title={activeSource === 'me' ? "Remove My Theme?" : "Remove Peer's Theme?"}
        message={activeSource === 'me' 
          ? "Are you sure you want to remove your custom theme? This will restore the default background (or the peer's shared theme if available)."
          : "Are you sure you want to disable the peer's shared theme? This will restore your own theme (or the default background)."
        }
        confirmText="Remove"
        type="danger"
      />
    </div>
  );
};

export default ChatThemeModal;
