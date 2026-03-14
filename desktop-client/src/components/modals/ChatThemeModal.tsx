import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Trash2, Eye, EyeOff, Image as ImageIcon } from 'lucide-react';
import { ChatTheme } from '@shared/types';
import { setChatTheme, removeChatTheme } from '../../services/apiService';
import { uploadChatFile } from '../../services/fileService';
import { useAuthStore } from '../../store/authStore';

interface ChatThemeModalProps {
  chatId: string;
  currentTheme?: ChatTheme;
  onClose: () => void;
  onSave: (theme: ChatTheme) => void;
}

const ChatThemeModal: React.FC<ChatThemeModalProps> = ({ chatId, currentTheme, onClose, onSave }) => {
  const { currentUser, setCurrentUser } = useAuthStore();
  const [theme, setTheme] = useState<ChatTheme>(currentTheme || {
    opacity: 0.8,
    blur: 10,
    showToOthers: false,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(currentTheme?.backgroundImage || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!confirm('Remove custom theme for this chat?')) return;
    
    setSaving(true);
    try {
      const res = await removeChatTheme(chatId);
      if (res.success) {
        // Update local user state
        if (currentUser) {
          const updatedThemes = { ...currentUser.chatThemes };
          delete updatedThemes[chatId];
          setCurrentUser({ ...currentUser, chatThemes: updatedThemes });
        }
        onSave({} as ChatTheme);
        onClose();
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
        {/* Live Preview */}
        {imagePreview && (
          <div style={{ 
            marginBottom: 24, 
            borderRadius: 12, 
            overflow: 'hidden', 
            position: 'relative', 
            height: 120,
            backgroundImage: `url(${imagePreview})`,
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
                  backgroundColor: `rgba(15, 23, 42, ${1 - theme.opacity})`,
                  backdropFilter: theme.blur > 0 ? `blur(${theme.blur}px)` : undefined,
                  WebkitBackdropFilter: theme.blur > 0 ? `blur(${theme.blur}px)` : undefined,
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
                }}
              >
                Preview
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

        {/* Background Image */}
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

        {/* Opacity Slider */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            <span>Opacity</span>
            <span style={{ color: 'var(--accent)' }}>{Math.round(theme.opacity * 100)}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={theme.opacity}
            onChange={(e) => setTheme({ ...theme, opacity: parseFloat(e.target.value) })}
            style={{
              width: '100%',
              height: 6,
              borderRadius: 3,
              outline: 'none',
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${theme.opacity * 100}%, var(--bg-tertiary) ${theme.opacity * 100}%, var(--bg-tertiary) 100%)`,
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Blur Slider */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            <span>Blur</span>
            <span style={{ color: 'var(--accent)' }}>{theme.blur}px</span>
          </label>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={theme.blur}
            onChange={(e) => setTheme({ ...theme, blur: parseInt(e.target.value) })}
            style={{
              width: '100%',
              height: 6,
              borderRadius: 3,
              outline: 'none',
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${(theme.blur / 50) * 100}%, var(--bg-tertiary) ${(theme.blur / 50) * 100}%, var(--bg-tertiary) 100%)`,
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Show to Others Toggle */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                Show to Others
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                Let the other person see your custom theme
              </div>
            </div>
            <button
              onClick={() => setTheme({ ...theme, showToOthers: !theme.showToOthers })}
              style={{
                width: 46,
                height: 26,
                borderRadius: 13,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: theme.showToOthers ? 'var(--accent)' : 'var(--bg-tertiary)',
                position: 'relative',
                transition: 'background-color 0.2s',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  left: theme.showToOthers ? 23 : 3,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  backgroundColor: '#fff',
                  transition: 'left 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {theme.showToOthers ? <Eye size={12} color="var(--accent)" /> : <EyeOff size={12} color="var(--text-secondary)" />}
              </span>
            </button>
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          {currentTheme && (
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
    </div>
  );
};

export default ChatThemeModal;
