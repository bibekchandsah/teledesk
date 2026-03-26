/**
 * WebRTC Configuration for Frontend
 * Simplified for maximum reliability across restrictive networks
 */

const getIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [];

  // 1. STUN servers (discovery)
  servers.push(
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.relay.metered.ca:80' }
  );

  // 2. Metered.ca TURN (using user-provided credentials)
  // We prioritize TLS (turns:) on 443 as it's the most likely to bypass firewalls
  const meteredUsername = "a3eb2fae2839009d29924329";
  const meteredSecret = "D+d8oMz/ZjBWc+eV";

  servers.push(
    { 
      urls: 'turns:global.relay.metered.ca:443',
      username: meteredUsername,
      credential: meteredSecret
    },
    { 
      urls: 'turn:global.relay.metered.ca:80',
      username: meteredUsername,
      credential: meteredSecret
    }
  );

  // 3. Fallback public TURN
  servers.push(
    { 
      urls: 'turns:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  );

  return servers;
};

export const WEBRTC_CONFIG = {
  ICE_SERVERS: getIceServers(),
  ICE_TRANSPORT_POLICY: 'all' as RTCIceTransportPolicy,
  BUNDLE_POLICY: 'max-bundle' as RTCBundlePolicy,
  RTCP_MUX_POLICY: 'require' as RTCRtcpMuxPolicy,
  // Disable pool for now to prevent interface errors (701) on some devices
  ICE_CANDIDATE_POOL_SIZE: 0,
} as const;

if (import.meta.env.DEV) {
  console.log('[WebRTC Config] Simplified ICE Servers:', WEBRTC_CONFIG.ICE_SERVERS);
}