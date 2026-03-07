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

export const WEBRTC_CONFIG = {
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
} as const;
