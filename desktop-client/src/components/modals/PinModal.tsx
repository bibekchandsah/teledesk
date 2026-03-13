import React, { useState, useEffect, useRef } from 'react';
import { X, Lock, Key, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { setLockPin, verifyLockPin, forgotLockPin, resetLockPin } from '../../services/apiService';
import { useAuthStore } from '../../store/authStore';

interface PinModalProps {
  mode: 'setup' | 'verify' | 'reset' | 'change';
  onSuccess: (pin?: string) => void;
  onCancel: () => void;
}

const PinModal: React.FC<PinModalProps> = ({ mode, onSuccess, onCancel }) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [step, setStep] = useState<'input' | 'confirm' | 'forgot' | 'reset-code' | 'verify-current'>('input');
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

  const handleCodeChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setResetCode(digits);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (mode === 'change' && step === 'verify-current') {
      if (pin.length !== 6) {
        setError('PIN must be 6 digits');
        return;
      }
      setLoading(true);
      try {
        const res = await verifyLockPin(pin);
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

    if (mode === 'setup' || (mode === 'change' && step !== 'verify-current')) {
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
          const res = await setLockPin(pin);
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
      }
    }

    if (mode === 'verify') {
      if (pin.length !== 6) {
        setError('PIN must be 6 digits');
        return;
      }
      setLoading(true);
      try {
        const res = await verifyLockPin(pin);
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
    }

    if (step === 'reset-code') {
      if (resetCode.length !== 6) {
        setError('Code must be 6 digits');
        return;
      }
      if (pin.length !== 6) {
        setError('New PIN must be 6 digits');
        return;
      }
      setLoading(true);
      try {
        const res = await resetLockPin(resetCode, pin);
        if (res.success) {
          onSuccess(pin);
        } else {
          setError(res.error || 'Invalid code');
        }
      } catch (err) {
        setError('Reset failed');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleForgotPin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await forgotLockPin();
      if (res.success) {
        setStep('reset-code');
        setMessage('A reset code has been sent to your email.');
      } else {
        setError(res.error || 'Failed to send reset code');
      }
    } catch (err) {
      setError('Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (mode === 'change') {
      if (step === 'verify-current') return 'Verify Current PIN';
      if (step === 'input') return 'Set New PIN';
      if (step === 'confirm') return 'Confirm New PIN';
    }
    if (mode === 'setup') return step === 'confirm' ? 'Confirm PIN' : 'Set Chat Lock PIN';
    if (step === 'reset-code') return 'Reset PIN';
    if (step === 'forgot') return 'Forgot PIN';
    return 'Enter PIN';
  };

  const getButtonText = () => {
    if (loading) return 'Processing...';
    if (step === 'input' && (mode === 'setup' || mode === 'change')) return 'Next';
    if (step === 'verify-current') return 'Continue';
    if (step === 'forgot') return 'Send Reset Code';
    return 'Confirm';
  };

  const getAltText = () => {
    if (step === 'verify-current') return 'Enter your current 6-digit PIN to proceed.';
    if (step === 'confirm') return 'Re-enter your 6-digit PIN to confirm.';
    if (step === 'reset-code') return 'Enter the code from your email and your new PIN.';
    if (mode === 'setup') return 'Set a 6-digit PIN to protect your locked chats.';
    if (mode === 'change' && step === 'input') return 'Enter your new 6-digit PIN.';
    return 'Enter your 6-digit PIN to access locked chats.';
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
                <Mail size={28} style={{ color: '#fff' }} />
              </div>
              <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                We will send a 6-digit code to <strong>{currentUser?.email}</strong> to reset your PIN.
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

              {step === 'reset-code' && (
                <div style={inputGroupStyle}>
                  <label style={labelStyle}>6-Digit Reset Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    placeholder="000000"
                    style={pinInputStyle}
                    required
                  />
                </div>
              )}

              <div style={inputGroupStyle}>
                <label style={labelStyle}>
                  {step === 'reset-code' ? 'New PIN' : (step === 'confirm' ? 'Confirm PIN' : (step === 'verify-current' ? 'Current PIN' : '6-Digit PIN'))}
                </label>
                <input
                  ref={inputRef}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={step === 'confirm' ? confirmPin : pin}
                  onChange={(e) => step === 'confirm' ? handleConfirmChange(e.target.value) : handlePinChange(e.target.value)}
                  placeholder="••••••"
                  style={pinInputStyle}
                  required
                />
              </div>

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
                disabled={loading || (step === 'reset-code' ? resetCode.length !== 6 || pin.length !== 6 : (step === 'confirm' ? confirmPin.length !== 6 : pin.length !== 6))}
                style={{ 
                  ...premiumBtnStyle, 
                  marginTop: 12,
                  opacity: loading || (step === 'reset-code' ? resetCode.length !== 6 || pin.length !== 6 : (step === 'confirm' ? confirmPin.length !== 6 : pin.length !== 6)) ? 0.6 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {getButtonText()}
              </button>

              {mode === 'verify' && step === 'input' && (
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
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, var(--accent) 0%, #818cf8 100%);
          color: white;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }
        .premium-pin-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
          filter: brightness(1.05);
        }
        .premium-pin-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .premium-pin-btn:disabled {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          box-shadow: none;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 3000,
  backgroundColor: 'rgba(15, 23, 42, 0.8)',
  backdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 24,
  width: '100%',
  maxWidth: 380,
  boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
  overflow: 'hidden',
  animation: 'fadeIn 0.3s ease-out',
};

const iconBoxStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 10px rgba(99, 102, 241, 0.2)',
};

const headerStyle: React.CSSProperties = {
  padding: '20px 24px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const bodyStyle: React.CSSProperties = {
  padding: '28px 32px',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: 6,
  borderRadius: '50%',
  transition: 'all 0.2s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const inputGroupStyle: React.CSSProperties = {
  marginBottom: 20,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
};

const pinInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  fontSize: 26,
  textAlign: 'center',
  letterSpacing: '0.5em',
  borderRadius: 12,
  border: '2px solid var(--border)',
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
  fontWeight: 700,
};

const errorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: '#ef4444',
  fontSize: 13,
  marginTop: 10,
  backgroundColor: 'rgba(239, 68, 68, 0.1)',
  padding: '8px 12px',
  borderRadius: 8,
};

const successStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: '#22c55e',
  fontSize: 13,
  marginTop: 10,
  backgroundColor: 'rgba(34, 197, 94, 0.1)',
  padding: '8px 12px',
  borderRadius: 8,
};

const forgotBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  fontSize: 13,
  fontWeight: 600,
  marginTop: 20,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'center',
  transition: 'color 0.2s',
};

const premiumBtnStyle: React.CSSProperties = {
  // Most styles are in the <style> tag, this is for dynamic parts
};

export default PinModal;
