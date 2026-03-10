// ============================================================
// Application Configuration Constants
// ============================================================

export const APP_CONFIG = {
  APP_NAME: 'TeleDesk',
  APP_VERSION: '1.0.0',
  MAX_FILE_SIZE_MB: 100,
  MAX_MESSAGE_LENGTH: 4096,
  TYPING_TIMEOUT_MS: 3000,
  HEARTBEAT_INTERVAL_MS: 30000,
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY_MS: 2000,
  MESSAGE_PAGE_SIZE: 50,
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  SUPPORTED_VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/ogg'],
  SUPPORTED_AUDIO_TYPES: ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg'],
  SUPPORTED_DOC_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'text/plain',
  ],
} as const;

export const ENCRYPTION_CONFIG = {
  ALGORITHM: 'AES',
  KEY_SIZE: 256,
  KEY_STORAGE_PREFIX: 'chat_key_',
} as const;

// Helper function to get ICE servers from environment or defaults
const getIceServers = () => {
  const servers = [
    // STUN servers for NAT discovery
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  // Add TURN servers from environment variables if available
  const turnUrl = process.env.VITE_TURN_URL || 'turn:openrelay.metered.ca:80';
  const turnUsername = process.env.VITE_TURN_USERNAME || 'openrelayproject';
  const turnCredential = process.env.VITE_TURN_CREDENTIAL || 'openrelayproject';

  if (turnUrl && turnUsername && turnCredential) {
    servers.push(
      { 
        urls: turnUrl,
        username: turnUsername,
        credential: turnCredential
      },
      { 
        urls: turnUrl.replace(':80', ':443'),
        username: turnUsername,
        credential: turnCredential
      },
      { 
        urls: turnUrl.replace(':80', ':443') + '?transport=tcp',
        username: turnUsername,
        credential: turnCredential
      }
    );
  }

  return servers;
};

export const WEBRTC_CONFIG = {
  ICE_SERVERS: getIceServers(),
} as const;
