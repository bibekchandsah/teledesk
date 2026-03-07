import React from 'react';
import { useCallStore } from '../store/callStore';
import { useCallContext } from '../context/CallContext';
import UserAvatar from '../components/UserAvatar';
import { getLocalStream } from '../services/webrtcService';
import { Phone, Video } from 'lucide-react';

const IncomingCallModal: React.FC = () => {
  const { incomingCall } = useCallStore();
  const { acceptIncomingCall, rejectIncomingCall } = useCallContext();

  if (!incomingCall) return null;

  const handleAccept = async () => {
    const stream = await getLocalStream(incomingCall.type).catch(() => new MediaStream());
    acceptIncomingCall(stream);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        className="incoming-call-card"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 20,
          padding: 32,
          textAlign: 'center',
          minWidth: 300,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <UserAvatar
            name={incomingCall.callerName}
            avatar={incomingCall.callerAvatar}
            size={80}
          />
        </div>
        <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 20 }}>
          {incomingCall.callerName}
        </h3>
        <p style={{ margin: '0 0 28px', color: 'var(--text-secondary)', fontSize: 14 }}>
          Incoming {incomingCall.type} call...
        </p>

        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center', animation: 'pulse 1.5s infinite' }}>
          {incomingCall.type === 'video' ? <Video size={36} color="var(--accent)" /> : <Phone size={36} color="var(--accent)" />}
        </div>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <button
            onClick={rejectIncomingCall}
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              border: 'none',
              backgroundColor: '#ef4444',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Decline"
          >
            <Phone size={22} style={{ transform: 'rotate(135deg)' }} />
          </button>
          <button
            onClick={handleAccept}
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              border: 'none',
              backgroundColor: '#22c55e',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Accept"
          >
            <Phone size={22} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
