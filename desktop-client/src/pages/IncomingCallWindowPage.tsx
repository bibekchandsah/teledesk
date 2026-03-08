import React, { useState } from 'react';
import { Phone, Video } from 'lucide-react';
import UserAvatar from '../components/UserAvatar';

interface IncomingCallData {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  callType: 'video' | 'voice';
}

// Parse init data from URL query param (passed by Electron main process)
function parseIncomingCallData(): IncomingCallData | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('d');
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw)) as IncomingCallData;
  } catch {
    return null;
  }
}

// WebkitAppRegion is an Electron-specific vendor CSS property not in React's types
const dragRegion = { WebkitAppRegion: 'drag' } as unknown as React.CSSProperties;
const noDragRegion = { WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties;

const IncomingCallWindowPage: React.FC = () => {
  // callData is available synchronously from URL params — no IPC wait, no loading state
  const [callData] = useState<IncomingCallData | null>(() => parseIncomingCallData());

  const handleAccept = () => {
    window.electronAPI?.acceptIncomingCallFromWindow?.();
  };

  const handleReject = () => {
    window.electronAPI?.rejectIncomingCallFromWindow?.();
  };

  if (!callData) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a2e',
          color: '#888',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        Connecting…
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none',
        ...dragRegion,
      }}
    >
      {/* Pulsing rings */}
      <div style={{ position: 'relative', marginBottom: 28 }}>
        <div
          style={{
            position: 'absolute',
            width: 120,
            height: 120,
            borderRadius: '50%',
            border: '2px solid #6366f1',
            opacity: 0.4,
            animation: 'pulseRing 1.5s ease-out infinite',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 144,
            height: 144,
            borderRadius: '50%',
            border: '2px solid #6366f1',
            opacity: 0.2,
            animation: 'pulseRing 1.5s ease-out infinite 0.4s',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        <UserAvatar
          name={callData.callerName}
          avatar={callData.callerAvatar}
          size={96}
        />
      </div>

      <h2
        style={{
          margin: '0 0 8px',
          fontSize: 22,
          fontWeight: 700,
          color: '#f1f5f9',
          textAlign: 'center',
        }}
      >
        {callData.callerName}
      </h2>

      <p
        style={{
          margin: '0 0 40px',
          fontSize: 14,
          color: '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {callData.callType === 'video' ? (
          <Video size={16} />
        ) : (
          <Phone size={16} />
        )}
        Incoming {callData.callType} call…
      </p>

      {/* Accept / Reject buttons */}
      <div
        style={{
          display: 'flex',
          gap: 32,
          ...noDragRegion,
        }}
      >
        {/* Reject */}
        <button
          onClick={handleReject}
          title="Decline"
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#ef4444',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.15s, background-color 0.15s',
            boxShadow: '0 4px 20px rgba(239,68,68,0.4)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#dc2626';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#ef4444';
          }}
        >
          <Phone size={24} style={{ transform: 'rotate(135deg)' }} />
        </button>

        {/* Accept */}
        <button
          onClick={handleAccept}
          title="Accept"
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#22c55e',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.15s, background-color 0.15s',
            boxShadow: '0 4px 20px rgba(34,197,94,0.4)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#16a34a';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#22c55e';
          }}
        >
          {callData.callType === 'video' ? <Video size={24} /> : <Phone size={24} />}
        </button>
      </div>

      <style>{`
        @keyframes pulseRing {
          0%   { transform: translate(-50%, -50%) scale(0.85); opacity: 0.6; }
          70%  { transform: translate(-50%, -50%) scale(1.15); opacity: 0; }
          100% { transform: translate(-50%, -50%) scale(1.15); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default IncomingCallWindowPage;
