/**
 * WebRTC Configuration for Frontend
 * Includes TURN server configuration from environment variables or defaults
 */

// Helper function to get ICE servers from environment or defaults
const getIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [];

  // Add STUN servers (discovery) first as they are fastest and almost always needed
  servers.push(
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' }
  );

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
    // Primary: User-provided Metered.ca Global Relay with credentials
    const meteredUsername = "a3eb2fae2839009d29924329";
    const meteredSecret = "D+d8oMz/ZjBWc+eV";
    
    servers.push(
      { 
        urls: 'turn:global.relay.metered.ca:80',
        username: meteredUsername,
        credential: meteredSecret
      },
      { 
        urls: 'turn:global.relay.metered.ca:80?transport=tcp',
        username: meteredUsername,
        credential: meteredSecret
      },
      { 
        urls: 'turns:global.relay.metered.ca:443',
        username: meteredUsername,
        credential: meteredSecret
      },
      { 
        urls: 'turns:global.relay.metered.ca:443?transport=tcp',
        username: meteredUsername,
        credential: meteredSecret
      }
    );

    // Fallback: Public OpenRelay (shared credentials)
    servers.push(
      { 
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      { 
        urls: 'turns:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    );
  }

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
  // ICE candidate pool size - pre-gathers candidates for faster connection
  ICE_CANDIDATE_POOL_SIZE: 10,
} as const;

// Log the configuration for debugging (only in development)
if (import.meta.env.DEV) {
  console.log('[WebRTC Config] ICE Servers:', WEBRTC_CONFIG.ICE_SERVERS);
  console.log('[WebRTC Config] Total servers:', WEBRTC_CONFIG.ICE_SERVERS.length);
}