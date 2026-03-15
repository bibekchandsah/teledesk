import React from 'react';
import { AlertTriangle, Phone, Video } from 'lucide-react';

interface PopupBlockedNotificationProps {
  callType: 'voice' | 'video';
  targetName: string;
  onUseInApp: () => void;
  onDismiss: () => void;
}

const PopupBlockedNotification: React.FC<PopupBlockedNotificationProps> = ({
  callType,
  targetName,
  onUseInApp,
  onDismiss,
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 1001,
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        maxWidth: 320,
        animation: 'slideInRight 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <AlertTriangle size={20} style={{ color: '#f59e0b', marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Popup Blocked
          </h4>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Your browser blocked the call window. You can allow popups for this site or use the in-app call interface.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onUseInApp}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {callType === 'video' ? <Video size={14} /> : <Phone size={14} />}
              Use In-App Call
            </button>
            <button
              onClick={onDismiss}
              style={{
                padding: '6px 12px',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PopupBlockedNotification;