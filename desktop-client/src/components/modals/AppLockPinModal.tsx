import React, { useState, useEffect, useRef } from 'react';
import { X, Lock, Key, AlertCircle, CheckCircle2 } from 'lucide-react';
import { setAppLockPin, verifyAppLockPin } from '../../services/apiService';
import { reauthenticate, reauthenticateWithPassword } from '../../services/firebaseService';
import { useAuthStore } from '../../store/authStore';

interface AppLockPinModalProps {
  mode: 'setup' | 'verify' | 'reset' | 'change';
  onSuccess: (pin?: string) => void;
  onCancel: () => void;
}

const AppLockPinModal: React.FC<AppLockPinModalProps> = ({ mode, onSuccess, onCancel }) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'input' | 'confirm' | 'forgot' | 'verify-current' | 'reauth-password' | 'reset-input' | 'reset-confirm'>('input');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { currentUser } = useAuthStore();

  useEffect(() => {
    inputRef.current?.focus();
    if (mode === 'verify') setStep('input');
    if (mode === 'setup') setStep('input');
    if (mode === 'reset') setStep('forgot');
    if (mode === 'change') setStep('verify-current');
  }, [mode]);

  const handlePinChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setPin(digits);
    setError(null);
  };

  const handleConfirmChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setConfirmPin(digits);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    // ── Pre-auth / Reset steps ────────────────────────────────────────────
    if (step === 'reauth-password') {
      if (!password) {
        setError('Please enter your password');
        return;
      }
      setLoading(true);
      try {
        const success = await reauthenticateWithPassword(password);
        if (success) {
          setStep('reset-input');
          setPin('');
          setPassword('');
          setError(null);
          setMessage('Identity verified. Please set a new PIN.');
        } else {
          setError('Incorrect password. Please try again.');
        }
      } catch (err) {
        setError('Verification failed. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── Post-reauth new PIN flow ──────────────────────────────────────────
    if (step === 'reset-input') {
      if (pin.length !== 6) { setError('PIN must be 6 digits'); return; }
      setStep('reset-confirm');
      setConfirmPin('');
      return;
    }
    if (step === 'reset-confirm') {
      if (pin !== confirmPin) { setError('PINs do not match'); return; }
      setLoading(true);
      try {
        const res = await setAppLockPin(pin);
        if (res.success) {
          onSuccess(pin);
        } else {
          setError(res.error || 'Failed to set PIN');
        }
      } catch (err) {
        setError('Failed to set PIN');
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── Setup / Change flow ───────────────────────────────────────────────
    if (mode === 'change' && step === 'verify-current') {
      if (pin.length !== 6) {
        setError('PIN must be 6 digits');
        return;
      }
      setLoading(true);
      try {
        const res = await verifyAppLockPin(pin);
        if (res.success && res.data?.isValid) {
          setStep('input');
          setPin('');
          setError(null);
        } else {
          setError('Incorrect current PIN');
          setPin('');
        }
      } catch (err) {
        setError('Verification failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'setup' || mode === 'reset' || (mode === 'change' && step !== 'verify-current')) {
      if (step === 'input') {
        if (pin.length !== 6) {
          setError('PIN must be 6 digits');
          return;
        }
        setStep('confirm');
        setConfirmPin('');
        return;
      }
      if (step === 'confirm') {
        if (pin !== confirmPin) {
          setError('PINs do not match');
          return;
        }
        setLoading(true);
        try {
          const res = await setAppLockPin(pin);
          if (res.success) {
            onSuccess(pin);
          } else {
            setError(res.error || 'Failed to set PIN');
          }
        } catch (err) {
          setError('Failed to set PIN');
        } finally {
          setLoading(false);
        }
        return;
      }
    }

    // ── Verify flow ───────────────────────────────────────────────────────
    if (mode === 'verify') {
      if (pin.length !== 6) {
        setError('PIN must be 6 digits');
        return;
      }
      setLoading(true);
      try {
        const res = await verifyAppLockPin(pin);
        if (res.success && res.data?.isValid) {
          onSuccess(pin);
        } else {
          setError('Incorrect PIN');
          setPin('');
        }
      } catch (err) {
        setError('Verification failed');
      } finally {
        setLoading(false);
      }
      return;
    }
  };

  const handleForgotPin = async () => {
    setLoading(true);
    setError(null);
    try {
      const success = await reauthenticate();
      if (success) {
        setStep('reset-input');
        setPin('');
        setError(null);
        setMessage('Identity verified. Please set a new PIN.');
      } else {
        setStep('reauth-password');
        setError(null);
      }
    } catch (err) {
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (step === 'reauth-password') return 'Verify Your Password';
    if (step === 'reset-input') return 'Set New App Lock PIN';
    if (step === 'reset-confirm') return 'Confirm New PIN';
    if (step === 'forgot') return 'Reset Your PIN';
    if (mode === 'setup' || (mode === 'change' && step !== 'verify-current')) {
      if (step === 'input') return 'Set New App Lock PIN';
      if (step === 'confirm') return 'Confirm New PIN';
    }
    if (mode === 'setup') return step === 'confirm' ? 'Confirm PIN' : 'Set App Lock PIN';
    return 'Enter PIN';
  };

  const getButtonText = () => {
    if (loading) return 'Processing...';
    if (step === 'input' && (mode === 'setup' || mode === 'change' || mode === 'reset')) return 'Next';
    if (step === 'reset-input') return 'Next';
    if (step === 'verify-current' || step === 'reauth-password') return 'Continue';
    if (step === 'forgot') return 'Verify Identity';
    return 'Confirm';
  };

  const getAltText = () => {
    if (step === 'verify-current') return 'Enter your current 6-digit PIN to proceed.';
    if (step === 'reauth-password') return 'Enter your account password to verify your identity.';
    if (step === 'reset-input') return 'Enter a new 6-digit PIN.';
    if (step === 'reset-confirm') return 'Re-enter your new PIN to confirm.';
    if (step === 'confirm') return 'Re-enter your 6-digit PIN to confirm.';
    if (mode === 'setup') return 'Set a 6-digit PIN to protect your app.';
    if ((mode === 'change' || mode === 'reset') && step === 'input') return 'Enter your new 6-digit PIN.';
    return 'Enter your 6-digit PIN to unlock the app.';
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={iconBoxStyle}>
              <Lock size={18} style={{ color: '#fff' }} />
            </div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {getTitle()}
            </h3>
          </div>
          <button onClick={onCancel} style={closeBtnStyle}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={bodyStyle}>
          {step === 'forgot' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ ...iconBoxStyle, width: 56, height: 56, margin: '0 auto 16px' }}>
                <Key size={28} style={{ color: '#fff' }} />
              </div>
              <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                To reset your PIN, we'll ask you to quickly re-authenticate with your login provider.
              </p>
              <button 
                type="button" 
                onClick={handleForgotPin} 
                className="premium-pin-btn"
                disabled={loading}
                style={premiumBtnStyle}
              >
                {getButtonText()}
              </button>
            </div>
          ) : (
            <>
              <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', lineHeight: 1.6 }}>
                {getAltText()}
              </p>

              {step === 'reauth-password' && (
                <div style={inputGroupStyle}>
                  <label style={labelStyle}>Your Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(null); }}
                      placeholder="Enter your password"
                      style={{ ...pinInputStyle, fontSize: 16, letterSpacing: 'normal', textAlign: 'left' }}
                      required
                    />
                  </div>
                </div>
              )}

              {step !== 'reauth-password' && (
                <div style={inputGroupStyle}>
                  <label style={labelStyle}>
                    {(step === 'confirm' || step === 'reset-confirm') ? 'Confirm PIN' : (step === 'verify-current' ? 'Current PIN' : '6-Digit PIN')}
                  </label>
                  <input
                    ref={inputRef}
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={(step === 'confirm' || step === 'reset-confirm') ? confirmPin : pin}
                    onChange={(e) => (step === 'confirm' || step === 'reset-confirm') ? handleConfirmChange(e.target.value) : handlePinChange(e.target.value)}
                    placeholder="••••••"
                    style={pinInputStyle}
                    required
                  />
                </div>
              )}

              {error && (
                <div style={errorStyle}>
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              {message && (
                <div style={successStyle}>
                  <CheckCircle2 size={14} />
                  <span>{message}</span>
                </div>
              )}

              <button 
                type="submit" 
                className="premium-pin-btn"
                disabled={loading || (step === 'reauth-password' ? !password : ((step === 'confirm' || step === 'reset-confirm') ? confirmPin.length !== 6 : pin.length !== 6))}
                style={{ 
                  ...premiumBtnStyle, 
                  marginTop: 12,
                  opacity: loading || (step === 'reauth-password' ? !password : ((step === 'confirm' || step === 'reset-confirm') ? confirmPin.length !== 6 : pin.length !== 6)) ? 0.6 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {getButtonText()}
              </button>

              {((mode === 'verify' && step === 'input') || (mode === 'change' && step === 'verify-current')) && (
                <button 
                  type="button" 
                  onClick={() => setStep('forgot')}
                  style={forgotBtnStyle}
                >
                  Forgot PIN?
                </button>
              )}
            </>
          )}
        </form>
      </div>
      <style>{`
        .premium-pin-btn {
          width: 100%;
          padding: 12px;
          borderRadius: 10px;
          border: none;
          background: linear-gradient(135deg, var(--accent) 0%, #818cf8 100%);
          color: white;
          fontWeight: 700;
          fontSize: 15px;
          cursor: pointer;
          transition: all 0.2s ease;
          boxShadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }
        .premium-pin-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          boxShadow: 0 6px 16px rgba(99, 102, 241, 0.4);
          filter: brightness(1.05);
        }
        .premium-pin-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .premium-pin-btn:disabled {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          boxShadow: none;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

// Styles (same as PinModal)
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  backdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-primary)',
  borderRadius: 16,
  maxWidth: 420,
  width: '90%',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '20px 24px',
  borderBottom: '1px solid var(--border)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  borderRadius: 6,
  transition: 'all 0.2s ease',
};

const bodyStyle: React.CSSProperties = {
  padding: '24px',
};

const iconBoxStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
};

const inputGroupStyle: React.CSSProperties = {
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-primary)',
  letterSpacing: '0.01em',
};

const pinInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: '2px solid var(--border)',
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 20,
  fontWeight: 600,
  textAlign: 'center',
  letterSpacing: '0.5em',
  outline: 'none',
  transition: 'border-color 0.2s ease',
};

const premiumBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
  color: 'white',
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
};

const forgotBtnStyle: React.CSSProperties = {
  width: '100%',
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '12px 0',
  marginTop: 8,
  transition: 'opacity 0.2s ease',
};

const errorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderRadius: 8,
  backgroundColor: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  color: '#f87171',
  fontSize: 13,
  marginBottom: 12,
};

const successStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderRadius: 8,
  backgroundColor: 'rgba(34, 197, 94, 0.1)',
  border: '1px solid rgba(34, 197, 94, 0.3)',
  color: '#4ade80',
  fontSize: 13,
  marginBottom: 12,
};

export default AppLockPinModal;
