import React, { useState, useEffect } from 'react';
import { X, Download, Copy, Check, Shield, Smartphone, AlertCircle } from 'lucide-react';
import { setup2FA, verify2FA, regenerate2FA, cancelPending2FA } from '../../services/apiService';

interface TwoFactorSetupModalProps {
  onClose: () => void;
  onSuccess: () => void;
  isRegenerate?: boolean; // true if regenerating QR code
}

type Step = 'qr' | 'verify' | 'backup';

const TwoFactorSetupModal: React.FC<TwoFactorSetupModalProps> = ({ onClose, onSuccess, isRegenerate = false }) => {
  const [step, setStep] = useState<Step>('qr');
  const [qrCode, setQrCode] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [token, setToken] = useState('');
  const [regenerateToken, setRegenerateToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isRegenerate) {
      loadSetup();
    }
  }, [isRegenerate]);

  const loadSetup = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await setup2FA();
      if (result.success && result.data) {
        setQrCode(result.data.qrCode);
        setBackupCodes(result.data.backupCodes);
      } else {
        setError(result.error || 'Failed to generate QR code');
      }
    } catch (err) {
      setError('Failed to setup 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateSubmit = async () => {
    if (regenerateToken.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await regenerate2FA(regenerateToken);
      if (result.success && result.data) {
        setQrCode(result.data.qrCode);
        setBackupCodes(result.data.backupCodes);
        setStep('qr');
        setRegenerateToken('');
      } else {
        setError(result.error || 'Invalid verification code');
      }
    } catch (err) {
      setError('Failed to regenerate QR code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (token.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await verify2FA(token);
      if (result.success) {
        setStep('backup');
      } else {
        setError(result.error || 'Invalid verification code');
      }
    } catch (err) {
      setError('Failed to verify code');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadBackupCodes = () => {
    const text = `TeleDesk Two-Factor Authentication Backup Codes\n\nGenerated: ${new Date().toLocaleString()}\n\nIMPORTANT: Save these codes in a secure location. Each code can only be used once.\n\n${backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}\n\nIf you lose access to your authenticator app, you can use these codes to log in.`;
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teledesk-backup-codes-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyBackupCodes = async () => {
    const text = backupCodes.join('\n');
    try {
      if (window.electronAPI?.copyTextToClipboard) {
        window.electronAPI.copyTextToClipboard(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleComplete = () => {
    onSuccess();
    onClose();
  };

  const handleClose = async () => {
    // If regenerating and user hasn't completed verification, cancel pending changes
    if (isRegenerate && qrCode && step !== 'backup') {
      try {
        await cancelPending2FA();
      } catch (err) {
        console.error('Failed to cancel pending 2FA:', err);
      }
    }
    onClose();
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
      onClick={handleClose}
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
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Shield size={20} color="#fff" />
            </div>
            <h3 style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, margin: 0 }}>
              {isRegenerate ? 'Regenerate 2FA' : 'Two-Factor Authentication'}
            </h3>
          </div>
          <button
            onClick={handleClose}
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

        {/* Regenerate Token Input */}
        {isRegenerate && step === 'qr' && !qrCode && (
          <div>
            <div style={{
              padding: 16,
              borderRadius: 12,
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              marginBottom: 24,
              display: 'flex',
              gap: 12,
            }}>
              <AlertCircle size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Enter your current 6-digit code from your authenticator app to regenerate your QR code.
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Current Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={regenerateToken}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setRegenerateToken(val);
                  setError('');
                }}
                placeholder="000000"
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

            {error && (
              <div style={{
                padding: 12,
                borderRadius: 8,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: 13,
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleRegenerateSubmit}
              disabled={loading || regenerateToken.length !== 6}
              style={{
                width: '100%',
                padding: '12px 24px',
                borderRadius: 12,
                border: 'none',
                background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
                color: '#fff',
                fontWeight: 600,
                cursor: loading || regenerateToken.length !== 6 ? 'not-allowed' : 'pointer',
                fontSize: 15,
                opacity: loading || regenerateToken.length !== 6 ? 0.5 : 1,
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              }}
            >
              {loading ? 'Verifying...' : 'Continue'}
            </button>
          </div>
        )}

        {/* Step 1: QR Code */}
        {step === 'qr' && qrCode && (
          <div>
            <div style={{
              padding: 16,
              borderRadius: 12,
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              marginBottom: 24,
              display: 'flex',
              gap: 12,
            }}>
              <Smartphone size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Scan this QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.)
              </div>
            </div>

            {/* QR Code Display */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: 24,
              padding: 20,
              backgroundColor: '#fff',
              borderRadius: 16,
            }}>
              {loading ? (
                <div style={{ padding: 40 }}>
                  <div className="spinner" style={{
                    width: 40,
                    height: 40,
                    border: '4px solid var(--border)',
                    borderTop: '4px solid var(--accent)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                </div>
              ) : (
                <img src={qrCode} alt="2FA QR Code" style={{ width: 200, height: 200, display: 'block' }} />
              )}
            </div>

            {/* App Download Links */}
            <div style={{
              padding: 12,
              borderRadius: 8,
              backgroundColor: 'var(--bg-tertiary)',
              marginBottom: 24,
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                Don't have an authenticator app?
              </div>
              <div>Download: Google Authenticator, Microsoft Authenticator, or Authy</div>
            </div>

            <button
              onClick={() => setStep('verify')}
              style={{
                width: '100%',
                padding: '12px 24px',
                borderRadius: 12,
                border: 'none',
                background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 15,
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              }}
            >
              Next: Verify Code
            </button>
          </div>
        )}

        {/* Step 2: Verify */}
        {step === 'verify' && (
          <div>
            <div style={{
              padding: 16,
              borderRadius: 12,
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              marginBottom: 24,
              display: 'flex',
              gap: 12,
            }}>
              <AlertCircle size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Enter the 6-digit code from your authenticator app to verify the setup.
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
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
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && token.length === 6) {
                    handleVerify();
                  }
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: 12,
                borderRadius: 8,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: 13,
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setStep('qr')}
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
                Back
              </button>
              <button
                onClick={handleVerify}
                disabled={loading || token.length !== 6}
                style={{
                  flex: 2,
                  padding: '12px 24px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: loading || token.length !== 6 ? 'not-allowed' : 'pointer',
                  fontSize: 15,
                  opacity: loading || token.length !== 6 ? 0.5 : 1,
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                }}
              >
                {loading ? 'Verifying...' : 'Verify & Enable'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Backup Codes */}
        {step === 'backup' && (
          <div>
            <div style={{
              padding: 16,
              borderRadius: 12,
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              marginBottom: 24,
              display: 'flex',
              gap: 12,
            }}>
              <Check size={20} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Two-factor authentication is now enabled! Save these backup codes in a secure location.
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>
                  Backup Codes
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleCopyBackupCodes}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.2s',
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={handleDownloadBackupCodes}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.2s',
                    }}
                  >
                    <Download size={14} />
                    Download
                  </button>
                </div>
              </div>

              <div style={{
                padding: 16,
                borderRadius: 12,
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                fontFamily: 'monospace',
                fontSize: 13,
                maxHeight: 200,
                overflowY: 'auto',
              }}>
                {backupCodes.map((code, i) => (
                  <div key={i} style={{
                    padding: '6px 0',
                    color: 'var(--text-primary)',
                    borderBottom: i < backupCodes.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    {i + 1}. {code}
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              padding: 12,
              borderRadius: 8,
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              fontSize: 12,
              color: '#ef4444',
              marginBottom: 24,
              lineHeight: 1.5,
            }}>
              <strong>Important:</strong> Each backup code can only be used once. Store them securely. You'll need them if you lose access to your authenticator app.
            </div>

            <button
              onClick={handleComplete}
              style={{
                width: '100%',
                padding: '12px 24px',
                borderRadius: 12,
                border: 'none',
                background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 15,
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TwoFactorSetupModal;
