/**
 * WebRTC Configuration for Frontend
 * Includes TURN server configuration from environment variables
 */

// Helper function to get ICE servers from environment or defaults
const getIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [];

  // Add TURN servers from environment variables if available
  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    // Custom TURN server configured - use it with both UDP and TCP
    servers.push(
      { 
        urls: turnUrl,
        username: turnUsername,
        credential: turnCredential
      },
      { 
        urls: turnUrl.replace(':80', ':443') + '?transport=tcp',
        username: turnUsername,
        credential: turnCredential
      }
    );
  } else {
    // No custom TURN - use free public TURN servers (limited but works for testing)
    servers.push(
      { 
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      { 
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    );
  }

  // Add ONE reliable STUN server (Google's primary)
  // STUN is only needed for discovering public IP, one server is enough
  servers.push({ urls: 'stun:stun.l.google.com:19302' });

  return servers;
};

export const WEBRTC_CONFIG = {
  ICE_SERVERS: getIceServers(),
  // ICE transport policy - 'all' allows both STUN and TURN
  ICE_TRANSPORT_POLICY: 'all' as RTCIceTransportPolicy,
  // Bundle policy - max-bundle is most efficient
  BUNDLE_POLICY: 'max-bundle' as RTCBundlePolicy,
  // RTCP mux policy - require for better performance
  RTCP_MUX_POLICY: 'require' as RTCRtcpMuxPolicy,
} as const;

// Log the configuration for debugging (only in development)
if (import.meta.env.DEV) {
  console.log('[WebRTC Config] ICE Servers:', WEBRTC_CONFIG.ICE_SERVERS);
  console.log('[WebRTC Config] Total servers:', WEBRTC_CONFIG.ICE_SERVERS.length);
}