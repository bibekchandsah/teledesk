import React, { useEffect, useRef } from 'react';
import { useCallStore } from '../store/callStore';
import { useCallContext } from '../context/CallContext';
import { useChatStore } from '../store/chatStore';
import UserAvatar from '../components/UserAvatar';
import { getLocalStream } from '../services/webrtcService';
import { Phone } from 'lucide-react';
import callAudioService from '../services/callAudioService';

const IncomingCallModal: React.FC = () => {
  const { incomingCall, remoteStream } = useCallStore();
  const { acceptIncomingCall, rejectIncomingCall } = useCallContext();
  const { nicknames } = useChatStore();
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Play incoming ringtone when modal appears
  useEffect(() => {
    if (incomingCall) {
      callAudioService.playIncomingRingtone();
    }

    // Cleanup: stop ringtone when component unmounts or call changes
    return () => {
      callAudioService.stopIncomingRingtone();
    };
  }, [incomingCall]);

  // Handle remote audio playback for voice calls
  useEffect(() => {
    if (!remoteStream) return;
    
    if (!remoteAudioRef.current) {
      const audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current = audio;
    }
    
    remoteAudioRef.current.srcObject = remoteStream;
    remoteAudioRef.current.play().catch((err) => {
      console.warn('[IncomingCallModal] Failed to play remote audio:', err);
    });

    return () => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null;
      }
    };
  }, [remoteStream]);

  if (!incomingCall) return null;

  const displayName = nicknames[incomingCall.callerId] || incomingCall.callerName;

  const handleAccept = async () => {
    // Stop ringtone immediately when accepting
    callAudioService.stopIncomingRingtone();
    
    try {
      const stream = await getLocalStream(incomingCall.type);
      console.log('[IncomingCallModal] Captured stream for accept:', {
        hasAudio: stream.getAudioTracks().length > 0,
        hasVideo: stream.getVideoTracks().length > 0,
        callType: incomingCall.type
      });
      acceptIncomingCall(stream);
    } catch (error) {
      console.error('[IncomingCallModal] Failed to get local stream:', error);
      // Fallback with empty stream
      acceptIncomingCall(new MediaStream());
    }
  };

  const handleReject = () => {
    // Stop ringtone immediately when rejecting
    callAudioService.stopIncomingRingtone();
    rejectIncomingCall();
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
        <div style={{
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'center',
          position: 'relative',
        }}>
          {/* Pulsing ring */}
          <div style={{
            position: 'absolute',
            width: 104, height: 104,
            borderRadius: '50%',
            border: '2px solid var(--accent)',
            opacity: 0.5,
            animation: 'pulse 1.5s ease-out infinite',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
          }} />
          <div style={{
            position: 'absolute',
            width: 120, height: 120,
            borderRadius: '50%',
            border: '2px solid var(--accent)',
            opacity: 0.25,
            animation: 'pulse 1.5s ease-out infinite 0.4s',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
          }} />
          <UserAvatar
            name={displayName}
            avatar={incomingCall.callerAvatar}
            size={90}
          />
        </div>
        <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 20 }}>
          {displayName}
        </h3>
        <p style={{ margin: '0 0 28px', color: 'var(--text-secondary)', fontSize: 14 }}>
          Incoming {incomingCall.type} call...
        </p>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <button
            onClick={handleReject}
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
