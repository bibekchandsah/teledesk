import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAuthStore } from '../store/authStore';
import { useMultiAccountStore } from '../store/multiAccountStore';
import { QuickAccountPicker } from '../components/QuickAccountPicker';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import { MessageCircle, Eye, EyeOff, Loader2, Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

const LoginPage: React.FC = () => {
  const { loginWithGoogle, loginWithGithub, loginWithEmail, registerWithEmail } = useAuth();
  const { isLoading, error } = useAuthStore();
  const { accounts } = useMultiAccountStore();

  const { canInstall, install } = usePWAInstall();
  const [installDismissed, setInstallDismissed] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [showRevokedModal, setShowRevokedModal] = useState(false);
  const [revokedMessage, setRevokedMessage] = useState('');

  // Check URL parameters for account switching
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const switchEmail = params.get('switch');
    const addAccount = params.get('add');
    const logout = params.get('logout');
    const revoked = params.get('revoked');
    const msg = params.get('message');

    if (revoked === 'true' && msg) {
      setRevokedMessage(decodeURIComponent(msg));
      setShowRevokedModal(true);
      // Clean up URL so refresh doesn't pop it again
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (logout === 'true') {
      // User explicitly logged out, don't show picker
      setShowAccountPicker(false);
    } else if (switchEmail) {
      // Pre-fill email when switching accounts
      setEmail(decodeURIComponent(switchEmail));
      setShowAccountPicker(false);
    } else if (addAccount) {
      // Adding new account, don't show picker
      setShowAccountPicker(false);
    } else if (accounts.length > 0) {
      // Show account picker if we have saved accounts
      setShowAccountPicker(true);
    }
  }, [accounts.length]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (mode === 'forgot') {
      // Handle password reset
      setResetError(null);
      setResetEmailSent(false);
      
      const { sendPasswordReset } = await import('../services/firebaseService');
      const result = await sendPasswordReset(email);
      
      if (result.success) {
        setResetEmailSent(true);
      } else {
        setResetError(result.error || 'Failed to send reset email');
      }
      return;
    }
    
    if (mode === 'signin') {
      await loginWithEmail(email, password);
    } else {
      await registerWithEmail(email, password, name.trim() || 'User');
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  const oauthBtnStyle = (bg: string, color: string): React.CSSProperties => ({
    width: '100%',
    padding: '12px 20px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    backgroundColor: bg,
    color,
    fontSize: 15,
    fontWeight: 600,
    cursor: isLoading ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    opacity: isLoading ? 0.7 : 1,
    transition: 'opacity 0.2s, transform 0.1s',
  });

  const primaryBtnStyle: React.CSSProperties = {
    width: '100%',
    padding: '13px 20px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: isLoading ? 'not-allowed' : 'pointer',
    opacity: isLoading ? 0.7 : 1,
    transition: 'opacity 0.2s',
  };

  return (
    <div
      className="login-page"
      style={{
        minHeight: '100vh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch' as any,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.15) 0%, transparent 60%)',
        padding: '24px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="login-card"
        style={{
          padding: 'clamp(20px, 5vw, 40px) clamp(16px, 5vw, 44px)',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 24,
          boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
          width: '100%',
          maxWidth: 420,
          flexShrink: 0,
        }}
      >
        {/* Show Account Picker or Login Form */}
        {showAccountPicker ? (
          <>
            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: 'clamp(12px, 3vw, 28px)' }}>
              <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
                <MessageCircle size={42} color="var(--accent)" />
              </div>
              <h1
                style={{
                  margin: '0 0 6px',
                  fontSize: 28,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                TeleDesk
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
                Choose an account to continue
              </p>
            </div>

            {/* Quick Account Picker */}
            <QuickAccountPicker
              onSelectAccount={(selectedEmail) => {
                setEmail(selectedEmail);
                setShowAccountPicker(false);
                setMode('signin');
              }}
              onAddNewAccount={() => setShowAccountPicker(false)}
            />
          </>
        ) : (
          <>
            {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 'clamp(12px, 3vw, 28px)' }}>
          <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
            <MessageCircle size={42} color="var(--accent)" />
          </div>
          <h1
            style={{
              margin: '0 0 6px',
              fontSize: 28,
              fontWeight: 800,
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            TeleDesk
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
            {mode === 'signin' ? 'Sign in to continue' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
          </p>
        </div>

        {/* Mode Toggle - only show for signin/signup */}
        {mode !== 'forgot' && (
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: 10,
              padding: 3,
              marginBottom: 24,
            }}
          >
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: mode === m ? 'var(--accent)' : 'transparent',
                  color: mode === m ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {(error || resetError) && (
          <div
            style={{
              backgroundColor: 'rgba(239,68,68,0.1)',
              border: '1px solid #ef4444',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 18,
              color: '#ef4444',
              fontSize: 13,
            }}
          >
            {error || resetError}
          </div>
        )}

        {/* Success message for password reset */}
        {resetEmailSent && (
          <div
            style={{
              backgroundColor: 'rgba(34,197,94,0.1)',
              border: '1px solid #22c55e',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 18,
              color: '#22c55e',
              fontSize: 13,
            }}
          >
            Password reset email sent! Check your inbox.
          </div>
        )}

        {/* Email Form */}
        <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          {mode !== 'forgot' && (
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={{ ...inputStyle, paddingRight: 44 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  fontSize: 16,
                  padding: 0,
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )}
          <button type="submit" disabled={isLoading} style={primaryBtnStyle}>
            {isLoading
              ? <><Loader2 size={16} style={{ marginRight: 6, animation: 'spin 1s linear infinite', display: 'inline-block' }} />Please wait...</>
              : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Email'}
          </button>
        </form>

        {/* Forgot Password Link */}
        {mode === 'signin' && (
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <button
              onClick={() => {
                setMode('forgot');
                setResetError(null);
                setResetEmailSent(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Forgot password?
            </button>
          </div>
        )}

        {/* Back to Sign In from Forgot Password */}
        {mode === 'forgot' && (
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <button
              onClick={() => {
                setMode('signin');
                setResetError(null);
                setResetEmailSent(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ← Back to Sign In
            </button>
          </div>
        )}

        {/* Divider - only show for signin/signup */}
        {mode !== 'forgot' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>or continue with</span>
            <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
          </div>
        )}

        {/* OAuth Buttons - only show for signin/signup */}
        {mode !== 'forgot' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={loginWithGoogle}
              disabled={isLoading}
              style={oauthBtnStyle('#fff', '#1f2937')}
              onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <button
              onClick={loginWithGithub}
              disabled={isLoading}
              style={oauthBtnStyle('#24292e', '#fff')}
              onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Continue with GitHub
            </button>
          </div>
        )}

        <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 20, textAlign: 'center' }}>
          By continuing, you agree to TeleDesk's Terms of Service and Privacy Policy.
        </p>

        {/* PWA Install Banner */}
        {canInstall && !installDismissed && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.12))',
              border: '1px solid rgba(99,102,241,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              animation: 'fadeIn 0.4s ease both',
            }}
          >
            <img src="/PWA-icon.png" alt="TeleDesk" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Install TeleDesk</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>Get the full app experience</div>
            </div>
            <button
              onClick={install}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Download size={13} />
              Install
            </button>
            <button
              onClick={() => setInstallDismissed(true)}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px 4px', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
              title="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* Back to Account Picker */}
        {accounts.length > 0 && !showAccountPicker && (
          <button
            onClick={() => setShowAccountPicker(true)}
            style={{
              width: '100%',
              marginTop: 12,
              padding: '10px',
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              borderRadius: 8,
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ← Back to account selection
          </button>
        )}
      </>
        )}
      </div>

      <ConfirmationModal
        isOpen={showRevokedModal}
        title="Session Revoked"
        message={revokedMessage}
        confirmText="OK"
        onConfirm={() => setShowRevokedModal(false)}
        onCancel={() => setShowRevokedModal(false)}
        hideCancel={true}
        isDestructive={true}
      />
    </div>
  );
};

export default LoginPage;
