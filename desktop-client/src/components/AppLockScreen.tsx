import React, { useState, useRef, useEffect } from 'react';
import { Lock, AlertCircle, Key } from 'lucide-react';
import { verifyAppLockPin } from '../services/apiService';
import { reauthenticate, reauthenticateWithPassword } from '../services/firebaseService';
import { useAuthStore } from '../store/authStore';

interface AppLockScreenProps {
  onUnlock: () => void;
}

const AppLockScreen: React.FC<AppLockScreenProps> = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotFlow, setShowForgotFlow] = useState(false);
  const [showPasswordAuth, setShowPasswordAuth] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { currentUser } = useAuthStore();

  useEffect(() => {
    inputRef.current?.focus();
  }, [showForgotFlow, showPasswordAuth]);

  const handlePinChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setPin(digits);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (pin.length !== 6) {
      setError('PIN must be 6 digits');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyAppLockPin(pin);
      if (res.success && res.data?.isValid) {
        onUnlock();
      } else {
        setError('Incorrect PIN');
        setPin('');
      }
    } catch (err) {
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPin = async () => {
    setLoading(true);
    setError(null);
    try {
      const success = await reauthenticate();
      if (success) {
        // Successfully re-authenticated, unlock the app
        onUnlock();
      } else {
        // OAuth popup dismissed/failed — try password re-auth
        setShowPasswordAuth(true);
        setShowForgotFlow(false);
        setError(null);
      }
    } catch (err) {
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your password');
      return;
    }
    setLoading(true);
    try {
      const success = await reauthenticateWithPassword(password);
      if (success) {
        onUnlock();
      } else {
        setError('Incorrect password. Please try again.');
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (showPasswordAuth) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={iconBoxStyle}>
            <Key size={32} style={{ color: '#fff' }} />
          </div>
          <h2 style={{ margin: '20px 0 8px', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
            Verify Your Password
          </h2>
          <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center' }}>
            Enter your account password to unlock the app
          </p>
          <form onSubmit={handlePasswordAuth} style={{ width: '100%' }}>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Enter your password"
              style={inputStyle}
              required
            />
            {error && (
              <div style={errorStyle}>
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
            <button type="submit" disabled={loading || !password} style={buttonStyle}>
              {loading ? 'Verifying...' : 'Unlock'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPasswordAuth(false);
                setShowForgotFlow(false);
                setPassword('');
                setError(null);
              }}
              style={secondaryButtonStyle}
            >
              Back to PIN
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (showForgotFlow) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={iconBoxStyle}>
            <Key size={32} style={{ color: '#fff' }} />
          </div>
          <h2 style={{ margin: '20px 0 8px', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
            Reset App Lock PIN
          </h2>
          <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', lineHeight: 1.6 }}>
            To reset your PIN, we'll ask you to quickly re-authenticate with your login provider.
          </p>
          <button onClick={handleForgotPin} disabled={loading} style={buttonStyle}>
            {loading ? 'Verifying...' : 'Verify Identity'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowForgotFlow(false);
              setError(null);
            }}
            style={secondaryButtonStyle}
          >
            Back to PIN
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={iconBoxStyle}>
          <Lock size={32} style={{ color: '#fff' }} />
        </div>
        <h2 style={{ margin: '20px 0 8px', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
          App Locked
        </h2>
        <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center' }}>
          Enter your 6-digit PIN to unlock
        </p>
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => handlePinChange(e.target.value)}
            placeholder="••••••"
            style={pinInputStyle}
            required
          />
          {error && (
            <div style={errorStyle}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
          <button type="submit" disabled={loading || pin.length !== 6} style={buttonStyle}>
            {loading ? 'Verifying...' : 'Unlock'}
          </button>
          <button
            type="button"
            onClick={() => setShowForgotFlow(true)}
            style={forgotButtonStyle}
          >
            Forgot PIN?
          </button>
        </form>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.85)',
  backdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-primary)',
  borderRadius: 16,
  padding: 32,
  maxWidth: 400,
  width: '90%',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const iconBoxStyle: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 16,
  background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
};

const pinInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 20px',
  borderRadius: 10,
  border: '2px solid var(--border)',
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 24,
  fontWeight: 600,
  textAlign: 'center',
  letterSpacing: '0.5em',
  outline: 'none',
  marginBottom: 12,
  transition: 'border-color 0.2s ease',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: '2px solid var(--border)',
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 16,
  outline: 'none',
  marginBottom: 12,
  transition: 'border-color 0.2s ease',
};

const buttonStyle: React.CSSProperties = {
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
  marginBottom: 12,
};

const secondaryButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'none',
  color: 'var(--text-primary)',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

const forgotButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '8px 0',
  marginTop: 4,
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

export default AppLockScreen;
