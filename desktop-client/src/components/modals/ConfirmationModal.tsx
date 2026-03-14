import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  icon?: React.ReactNode;
  isDestructive?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  icon,
  isDestructive = false,
}) => {
  if (!isOpen) return null;

  return (
    <div style={overlayStyle} onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }}>
      <div 
        style={modalStyle} 
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              ...iconBoxStyle,
              background: isDestructive 
                ? 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)' 
                : 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
            }}>
              {icon || <AlertTriangle size={18} color="#fff" />}
            </div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {title}
            </h3>
          </div>
          <button type="button" onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }} style={closeBtnStyle}>
            <X size={20} />
          </button>
        </div>

        <div style={bodyStyle}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {message}
          </p>
        </div>

        <div style={footerStyle}>
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }} 
            style={cancelBtnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {cancelText}
          </button>
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onConfirm();
            }} 
            className="premium-confirm-btn"
            style={{
              ...confirmBtnStyle,
              background: isDestructive 
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                : 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
              boxShadow: isDestructive 
                ? '0 4px 12px rgba(239, 68, 68, 0.25)' 
                : '0 4px 12px rgba(99, 102, 241, 0.25)',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: translateY(10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .premium-confirm-btn {
          transition: all 0.2s ease;
        }
        .premium-confirm-btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.1);
        }
        .premium-confirm-btn:active {
          transform: translateY(0);
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
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 20,
  width: '100%',
  maxWidth: 400,
  boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
  overflow: 'hidden',
  animation: 'modalFadeIn 0.3s ease-out',
};

const headerStyle: React.CSSProperties = {
  padding: '20px 24px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const iconBoxStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  transition: 'all 0.2s',
};

const bodyStyle: React.CSSProperties = {
  padding: '24px',
};

const footerStyle: React.CSSProperties = {
  padding: '16px 24px 24px',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 12,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  backgroundColor: 'transparent',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const confirmBtnStyle: React.CSSProperties = {
  padding: '10px 24px',
  borderRadius: 10,
  border: 'none',
  color: '#fff',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

export default ConfirmationModal;
