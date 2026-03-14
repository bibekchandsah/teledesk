import React, { useState } from 'react';
import { Shield, AlertCircle, Key } from 'lucide-react';
import { verify2FALogin, verify2FABackup } from '../../services/apiService';
import TwoFactorSetupModal from './TwoFactorSetupModal';

interface TwoFactorVerifyModalProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const TwoFactorVerifyModal: React.FC<TwoFactorVerifyModalProps> = ({ onSuccess, onCancel }) => {
  const [token, setToken] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);

  const handleVerify = async () => {
    if (useBackupCode) {
      if (!backupCode.trim()) {
        setError('Please enter a backup code');
        return;
      }

      setLoading(true);
      setError('');
      try {
        const result = await verify2FABackup(backupCode.trim().toUpperCase());
        if (result.success && result.data?.verified) {
          onSuccess();
        } else {
          setError('Invalid backup code');
        }
      } catch (err) {
        setError('Failed to verify backup code');
      } finally {
        setLoading(false);
      }
    } else {
      if (token.length !== 6) {
        setError('Please enter a 6-digit code');
        return;
      }

      setLoading(true);
      setError('');
      try {
        const result = await verify2FALogin(token);
        if (result.success && result.data?.verified) {
          onSuccess();
        } else {
          setError('Invalid verification code');
        }
      } catch (err) {
        setError('Failed to verify code');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: 20,
        animation: 'fadeIn 0.2s ease-out',
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
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
          }}>
            <Shield size={28} color="#fff" />
          </div>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>
            Two-Factor Authentication
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            {useBackupCode 
              ? 'Enter one of your backup codes to continue'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        {/* Toggle between code and backup */}
        <div style={{
          display: 'flex',
          gap: 8,
          marginBottom: 24,
          padding: 4,
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: 12,
        }}>
          <button
            onClick={() => {
              setUseBackupCode(false);
              setError('');
              setBackupCode('');
            }}
            style={{
              flex: 1,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: !useBackupCode ? 'var(--accent)' : 'transparent',
              color: !useBackupCode ? '#fff' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Authenticator Code
          </button>
          <button
            onClick={() => {
              setUseBackupCode(true);
              setError('');
              setToken('');
            }}
            style={{
              flex: 1,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: useBackupCode ? 'var(--accent)' : 'transparent',
              color: useBackupCode ? '#fff' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Backup Code
          </button>
        </div>

        {/* Input */}
        {useBackupCode ? (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Backup Code
            </label>
            <div style={{ position: 'relative' }}>
              <Key size={18} color="var(--text-secondary)" style={{
                position: 'absolute',
                left: 16,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }} />
              <input
                type="text"
                value={backupCode}
                onChange={(e) => {
                  setBackupCode(e.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="XXXXXXXX"
                autoFocus
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 44px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: 15,
                  fontFamily: 'monospace',
                  letterSpacing: '0.1em',
                  outline: 'none',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && backupCode.trim()) {
                    handleVerify();
                  }
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.4 }}>
              Each backup code can only be used once
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Verification Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={token}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setToken(val);
                setError('');
              }}
              placeholder="000000"
              autoFocus
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: 20,
                fontFamily: 'monospace',
                letterSpacing: '0.5em',
                textAlign: 'center',
                outline: 'none',
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && token.length === 6) {
                  handleVerify();
                }
              }}
            />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div style={{
            padding: 12,
            borderRadius: 8,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: 13,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Info */}
        {!useBackupCode && (
          <div style={{
            padding: 12,
            borderRadius: 8,
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 20,
            lineHeight: 1.5,
          }}>
            Open your authenticator app and enter the current 6-digit code
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px 24px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 15,
              transition: 'all 0.2s ease',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleVerify}
            disabled={loading || (!useBackupCode && token.length !== 6) || (useBackupCode && !backupCode.trim())}
            style={{
              flex: 2,
              padding: '12px 24px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
              color: '#fff',
              fontWeight: 600,
              cursor: loading || (!useBackupCode && token.length !== 6) || (useBackupCode && !backupCode.trim()) ? 'not-allowed' : 'pointer',
              fontSize: 15,
              opacity: loading || (!useBackupCode && token.length !== 6) || (useBackupCode && !backupCode.trim()) ? 0.5 : 1,
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
            }}
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </div>

        {/* Regenerate Link */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button
            onClick={() => setShowRegenerateModal(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
              opacity: 0.8,
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
          >
            Regenerate QR Code
          </button>
        </div>
      </div>

      {showRegenerateModal && (
        <TwoFactorSetupModal
          isRegenerate
          onClose={() => setShowRegenerateModal(false)}
          onSuccess={() => {
            setShowRegenerateModal(false);
          }}
        />
      )}
    </div>
  );
};

export default TwoFactorVerifyModal;
