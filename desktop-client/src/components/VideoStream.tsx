import React, { useRef, useEffect } from 'react';
import { UserRound } from 'lucide-react';

interface VideoStreamProps {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  label?: string;
  style?: React.CSSProperties;
  objectFit?: 'cover' | 'contain';
}

const VideoStream: React.FC<VideoStreamProps> = ({
  stream,
  muted = false,
  mirror = false,
  label,
  style,
  objectFit = 'cover',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      style={{
        position: 'relative',
        backgroundColor: '#000',
        borderRadius: 12,
        overflow: 'hidden',
        ...style,
      }}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          style={{
            width: '100%',
            height: '100%',
            objectFit: objectFit,
            transform: mirror ? 'scaleX(-1)' : 'none',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: 48,
          }}
        >
          <UserRound size={64} color="#555" />
        </div>
      )}
      {label && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            backgroundColor: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

export default VideoStream;
