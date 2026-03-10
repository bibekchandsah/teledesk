/**
 * WebRTC Configuration for Frontend
 * Includes TURN server configuration from environment variables
 */

// Helper function to get ICE servers from environment or defaults
const getIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [
    // STUN servers for NAT discovery
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  // Add TURN servers from environment variables if available
  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  // Use default free TURN servers if no custom ones are configured
  const finalTurnUrl = turnUrl || 'turn:openrelay.metered.ca:80';
  const finalTurnUsername = turnUsername || 'openrelayproject';
  const finalTurnCredential = turnCredential || 'openrelayproject';

  if (finalTurnUrl && finalTurnUsername && finalTurnCredential) {
    // Add TURN servers with different transports and ports
    servers.push(
      { 
        urls: finalTurnUrl,
        username: finalTurnUsername,
        credential: finalTurnCredential
      },
      { 
        urls: finalTurnUrl.replace(':80', ':443'),
        username: finalTurnUsername,
        credential: finalTurnCredential
      },
      { 
        urls: finalTurnUrl.replace(':80', ':443') + '?transport=tcp',
        username: finalTurnUsername,
        credential: finalTurnCredential
      }
    );
  }

  return servers;
};

export const WEBRTC_CONFIG = {
  ICE_SERVERS: getIceServers(),
} as const;

// Log the configuration for debugging (only in development)
if (import.meta.env.DEV) {
  console.log('[WebRTC Config] ICE Servers:', WEBRTC_CONFIG.ICE_SERVERS);
}