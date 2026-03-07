import React from 'react';
import { useCallStore } from '../store/callStore';
import { useCallContext } from '../context/CallContext';
import { useAuthStore } from '../store/authStore';
import VideoStream from '../components/VideoStream';
import CallControls from '../components/CallControls';
import UserAvatar from '../components/UserAvatar';
import { formatDuration } from '../utils/formatters';
import { toggleAudio, toggleVideo } from '../services/webrtcService';

const CallScreen: React.FC = () => {
  const { activeCall, localStream, remoteStream, isMuted, isVideoOff, callDuration, setMuted, setVideoOff } =
    useCallStore();
  const { endActiveCall } = useCallContext();
  const { currentUser } = useAuthStore();

  if (!activeCall) return null;

  const isVideo = activeCall.type === 'video';
  const peerName =
    activeCall.callerId === currentUser?.uid
      ? (activeCall.receiverName || activeCall.receiverId)
      : activeCall.callerName;

  const handleToggleMute = () => {
    const newMuted = !isMuted;
    setMuted(newMuted);
    toggleAudio(!newMuted);
  };

  const handleToggleVideo = () => {
    const newOff = !isVideoOff;
    setVideoOff(newOff);
    toggleVideo(!newOff);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        backgroundColor: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Remote Video */}
      {isVideo ? (
        <VideoStream
          stream={remoteStream}
          label={peerName}
          style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
        />
      ) : (
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <UserAvatar name={peerName} size={100} />
          <h2 style={{ marginTop: 16, fontSize: 24 }}>{peerName}</h2>
          <p style={{ color: '#94a3b8', fontSize: 16 }}>
            {activeCall.status === 'ringing' ? 'Calling...' : formatDuration(callDuration)}
          </p>
        </div>
      )}

      {/* Local Video (PiP) */}
      {isVideo && localStream && (
        <div
          className="call-pip"
          style={{
            position: 'absolute',
            bottom: 100,
            right: 20,
            width: 180,
            height: 120,
            zIndex: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            border: '2px solid rgba(255,255,255,0.2)',
            borderRadius: 12,
          }}
        >
          <VideoStream
            stream={localStream}
            muted
            mirror
            label="You"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}

      {/* Duration (video calls) */}
      {isVideo && activeCall.status === 'active' && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0,0,0,0.5)',
            color: '#fff',
            padding: '4px 12px',
            borderRadius: 20,
            fontSize: 14,
          }}
        >
          {formatDuration(callDuration)}
        </div>
      )}

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 24 }}>
        <CallControls
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          callType={activeCall.type}
          onToggleMute={handleToggleMute}
          onToggleVideo={handleToggleVideo}
          onEndCall={endActiveCall}
        />
      </div>
    </div>
  );
};

export default CallScreen;
