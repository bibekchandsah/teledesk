import React, { useEffect, useState } from 'react';
import { useUIStore } from '../store/uiStore';
import { Wifi, WifiOff, X } from 'lucide-react';

const ToastProvider: React.FC = () => {
  const { toast, setToast } = useUIStore();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (toast) {
      setIsVisible(true);
      if (!toast.sticky) {
        const timer = setTimeout(() => {
          setIsVisible(false);
          // Small delay for exit animation
          setTimeout(() => setToast(null), 300);
        }, 3000);
        return () => clearTimeout(timer);
      }
    } else {
      setIsVisible(false);
    }
  }, [toast, setToast]);

  if (!toast) return null;

  const getIcon = () => {
    switch (toast.type) {
      case 'online': return <Wifi size={18} color="#4ade80" />;
      case 'offline': return <WifiOff size={18} color="#f87171" />;
      default: return null;
    }
  };

  const getBgColor = () => {
    switch (toast.type) {
      case 'online': return 'rgba(22, 101, 52, 0.95)';
      case 'offline': return 'rgba(153, 27, 27, 0.95)';
      default: return 'rgba(30, 41, 59, 0.95)';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        left: '50%',
        transform: `translateX(-50%) translateY(${isVisible ? '0' : '-100px'})`,
        opacity: isVisible ? 1 : 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 20px',
        backgroundColor: getBgColor(),
        color: '#fff',
        borderRadius: '12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease',
        cursor: 'default',
        pointerEvents: isVisible ? 'auto' : 'none',
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {getIcon()}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: '0.01em' }}>
        {toast.message}
      </div>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(() => setToast(null), 300);
        }}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.6)',
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.color = '#fff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default ToastProvider;
