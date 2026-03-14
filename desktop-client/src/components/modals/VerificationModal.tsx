import React, { useState, useEffect } from 'react';
import { Mail, ShieldCheck, X, RefreshCw, AlertCircle } from 'lucide-react';
import { VerificationAction, requestEmailVerification, verifyEmailOtp } from '../../services/apiService';

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (otp: string) => void;
  action: VerificationAction;
  title?: string;
  description?: string;
  shouldVerify?: boolean;
  isExternalLoading?: boolean;
  externalError?: string | null;
}

const VerificationModal: React.FC<VerificationModalProps> = ({
  isOpen,
  onClose,
  onVerified,
  action,
  title = "Email Verification",
  description = "Please enter the verification code sent to your email.",
  shouldVerify = true,
  isExternalLoading = false,
  externalError = null
}) => {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;
    
    setIsResending(true);
    setError(null);
    try {
      const res = await requestEmailVerification(action);
      if (res.success) {
        setResendCooldown(60);
      } else {
        setError(res.error || 'Failed to resend code');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6 || isVerifying || isExternalLoading) return;

    if (!shouldVerify) {
      onVerified(otp);
      return;
    }

    setIsVerifying(true);
    setError(null);
    try {
      const res = await verifyEmailOtp(otp, action);
      if (res.success) {
        onVerified(otp);
      } else {
        setError(res.error || 'Invalid verification code');
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div 
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={headerStyle}>
          <button 
            onClick={onClose}
            style={closeBtnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={20} />
          </button>
          
          <div style={iconContainerStyle}>
            <Mail size={32} />
          </div>
          
          <h2 style={titleStyle}>{title}</h2>
          <p style={descriptionStyle}>{description}</p>
        </div>

        {/* Content */}
        <form onSubmit={handleVerify} style={formStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <div style={otpContainerStyle}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} style={otpInputWrapperStyle}>
                    <input
                      type="text"
                      maxLength={1}
                      value={otp[i] || ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        if (val || e.target.value === '') {
                          const newOtp = otp.split('');
                          newOtp[i] = val;
                          const finalOtp = newOtp.join('');
                          setOtp(finalOtp);
                          
                          // Auto-focus next
                          if (val && i < 5) {
                            const next = e.currentTarget.parentElement?.nextElementSibling?.querySelector('input');
                            next?.focus();
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !otp[i] && i > 0) {
                          const prev = e.currentTarget.parentElement?.previousElementSibling?.querySelector('input');
                          prev?.focus();
                        }
                      }}
                      style={otpInputStyle}
                      autoFocus={i === 0}
                    />
                  </div>
                ))}
              </div>

              {(error || externalError) && (
                <div style={errorStyle}>
                  <AlertCircle size={16} />
                  <span>{error || externalError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={otp.length !== 6 || isVerifying || isExternalLoading}
                style={{
                  ...submitBtnStyle,
                  opacity: otp.length !== 6 || isVerifying || isExternalLoading ? 0.6 : 1,
                  cursor: otp.length !== 6 || isVerifying || isExternalLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {isVerifying || isExternalLoading ? (
                  <RefreshCw className="animate-spin" size={20} />
                ) : (
                  <>
                    <ShieldCheck size={20} />
                    Verify & Continue
                  </>
                )}
              </button>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || isResending}
                style={{
                  ...resendBtnStyle,
                  opacity: resendCooldown > 0 || isResending ? 0.5 : 1
                }}
              >
                {resendCooldown > 0 
                  ? `Resend code in ${resendCooldown}s` 
                  : isResending ? 'Sending...' : "Didn't receive a code? Resend"}
              </button>
            </div>
          </div>
        </form>
      </div>
      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: translateY(10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  backgroundColor: 'rgba(15, 23, 42, 0.7)',
  backdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

const modalStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 400,
  backgroundColor: 'var(--bg-secondary)',
  borderRadius: 24,
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
  border: '1px solid var(--border)',
  overflow: 'hidden',
  animation: 'modalFadeIn 0.3s ease-out',
};

const headerStyle: React.CSSProperties = {
  padding: '32px 24px 24px',
  textAlign: 'center',
  borderBottom: '1px solid var(--border)',
};

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 16,
  right: 16,
  padding: 8,
  backgroundColor: 'transparent',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  borderRadius: '50%',
  transition: 'all 0.2s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const iconContainerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 64,
  height: 64,
  marginBottom: 20,
  borderRadius: '50%',
  backgroundColor: 'rgba(59, 130, 246, 0.1)',
  color: '#3b82f6',
};

const titleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  color: 'var(--text-primary)',
  marginBottom: 8,
  margin: 0,
};

const descriptionStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  margin: 0,
};

const formStyle: React.CSSProperties = {
  padding: 32,
};

const otpContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: 8,
  marginBottom: 24,
  flexDirection: 'row', // CRITICAL: Force horizontal
};

const otpInputWrapperStyle: React.CSSProperties = {
  width: 48,
  height: 56,
  backgroundColor: 'var(--bg-tertiary)',
  border: '2px solid transparent',
  borderRadius: 12,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.2s',
};

const otpInputStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  textAlign: 'center',
  fontSize: 24,
  fontWeight: 700,
  backgroundColor: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text-primary)',
};

const errorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: 12,
  fontSize: 13,
  color: '#ef4444',
  backgroundColor: 'rgba(239, 68, 68, 0.1)',
  borderRadius: 12,
  marginBottom: 24,
};

const submitBtnStyle: React.CSSProperties = {
  width: '100%',
  height: 48,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  backgroundColor: '#3b82f6',
  color: '#fff',
  fontWeight: 700,
  border: 'none',
  borderRadius: 12,
  transition: 'all 0.2s',
  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
};

const resendBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
  color: '#3b82f6',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

export default VerificationModal;
