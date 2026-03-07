import React from 'react';
import { Mic, MicOff, Video, VideoOff, Phone } from 'lucide-react';

interface CallControlsProps {
  isMuted: boolean;
  isVideoOff: boolean;
  callType: 'video' | 'voice';
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
}

const CallControls: React.FC<CallControlsProps> = ({
  isMuted,
  isVideoOff,
  callType,
  onToggleMute,
  onToggleVideo,
  onEndCall,
}) => {
  return (
    <div
      className="call-controls"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
        padding: '16px 32px',
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 50,
      }}
    >
      <button
        onClick={onToggleMute}
        className={`control-btn ${isMuted ? 'active' : ''}`}
        title={isMuted ? 'Unmute' : 'Mute'}
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          fontSize: 22,
          backgroundColor: isMuted ? '#ef4444' : 'rgba(255,255,255,0.15)',
          color: '#fff',
          transition: 'background-color 0.2s',
        }}
      >
        {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
      </button>

      {callType === 'video' && (
        <button
          onClick={onToggleVideo}
          className={`control-btn ${isVideoOff ? 'active' : ''}`}
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isVideoOff ? '#ef4444' : 'rgba(255,255,255,0.15)',
            color: '#fff',
            transition: 'background-color 0.2s',
          }}
        >
          {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
        </button>
      )}

      <button
        onClick={onEndCall}
        title="End call"
        style={{
          width: 60,
          height: 60,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          fontSize: 24,
          backgroundColor: '#ef4444',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s',
        }}
      >
        <Phone size={24} style={{ transform: 'rotate(135deg)' }} />
      </button>
    </div>
  );
};

export default CallControls;
