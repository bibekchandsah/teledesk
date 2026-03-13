import React, { useState, useEffect, useRef } from 'react';
import { X, Lock, Key, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { setLockPin, verifyLockPin, forgotLockPin, resetLockPin } from '../../services/apiService';
import { useAuthStore } from '../../store/authStore';

interface PinModalProps {
  mode: 'setup' | 'verify' | 'reset';
  onSuccess: (pin?: string) => void;
  onCancel: () => void;
}

const PinModal: React.FC<PinModalProps> = ({ mode, onSuccess, onCancel }) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [step, setStep] = useState<'input' | 'confirm' | 'forgot' | 'reset-code'>('input');
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

    if (mode === 'setup') {
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

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Lock size={20} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              {mode === 'setup' ? (step === 'confirm' ? 'Confirm PIN' : 'Set Chat Lock PIN') : 
               step === 'reset-code' ? 'Reset PIN' : 'Enter PIN'}
            </h3>
          </div>
          <button onClick={onCancel} style={closeBtnStyle}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={bodyStyle}>
          {step === 'forgot' ? (
            <div style={{ textAlign: 'center' }}>
              <Mail size={40} style={{ color: 'var(--accent)', marginBottom: 16 }} />
              <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: 14 }}>
                We will send a 6-digit code to <strong>{currentUser?.email}</strong> to reset your PIN.
              </p>
              <button 
                type="button" 
                onClick={handleForgotPin} 
                className="primary-btn"
                disabled={loading}
                style={{ width: '100%', marginBottom: 12 }}
              >
                {loading ? 'Sending...' : 'Send Reset Code'}
              </button>
            </div>
          ) : (
            <>
              <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center' }}>
                {step === 'confirm' ? 'Re-enter your 6-digit PIN to confirm.' : 
                 step === 'reset-code' ? 'Enter the code from your email and your new PIN.' :
                 'Enter your 6-digit PIN to access locked chats.'}
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
                  {step === 'reset-code' ? 'New PIN' : (step === 'confirm' ? 'Confirm PIN' : '6-Digit PIN')}
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
                className="primary-btn"
                disabled={loading || (step === 'reset-code' ? resetCode.length !== 6 || pin.length !== 6 : (step === 'confirm' ? confirmPin.length !== 6 : pin.length !== 6))}
                style={{ width: '100%', marginTop: 12 }}
              >
                {loading ? 'Processing...' : (step === 'input' && mode === 'setup' ? 'Next' : 'Confirm')}
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
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 3000,
  backgroundColor: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  width: '100%',
  maxWidth: 360,
  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const bodyStyle: React.CSSProperties = {
  padding: '24px 28px',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: 4,
  borderRadius: '50%',
  transition: 'background 0.2s',
};

const inputGroupStyle: React.CSSProperties = {
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const pinInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  fontSize: 24,
  textAlign: 'center',
  letterSpacing: '0.4em',
  borderRadius: 8,
  border: '1px solid var(--border)',
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};

const errorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: '#e74c3c',
  fontSize: 13,
  marginTop: 8,
};

const successStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: '#2ecc71',
  fontSize: 13,
  marginTop: 8,
};

const forgotBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  fontSize: 13,
  marginTop: 16,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'center',
  textDecoration: 'underline',
};

export default PinModal;
