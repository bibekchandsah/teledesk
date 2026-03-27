/**
 * WebRTC Configuration for Frontend
 * Dynamically loaded from environment variables
 */

// Define the fallback servers if environment variable is missing or invalid
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const getIceServers = (): RTCIceServer[] => {
  // Try to load from JSON environment variable first
  const iceServersJson = import.meta.env.VITE_ICE_SERVERS_JSON;
  
  if (iceServersJson) {
    try {
      // Clean up the string (remove potential backslashes or trailing commas if possible)
      // Note: JSON.parse is strict, so we don't do blind regexes that might break credentials
      const parsedServers = JSON.parse(iceServersJson);
      
      if (Array.isArray(parsedServers) && parsedServers.length > 0) {
        if (import.meta.env.DEV) {
          console.log('[WebRTC Config] Successfully loaded ICE servers from environment.');
        }
        return parsedServers;
      }
    } catch (error) {
      console.error('[WebRTC Config] ERROR: Failed to parse VITE_ICE_SERVERS_JSON.');
      console.error('[WebRTC Config] Check your .env file for missing commas or quotes.');
      console.error('[WebRTC Config] Raw value:', iceServersJson);
      console.error('[WebRTC Config] Parse error:', error);
    }
  }

  // Fallback if JSON is missing or invalid
  return DEFAULT_ICE_SERVERS;
};

export const WEBRTC_CONFIG = {
  ICE_SERVERS: getIceServers(),
  // 'relay' forces the use of TURN servers, bypassing unreliable P2P paths
  ICE_TRANSPORT_POLICY: 'relay' as RTCIceTransportPolicy,
  BUNDLE_POLICY: 'max-bundle' as RTCBundlePolicy,
  RTCP_MUX_POLICY: 'require' as RTCRtcpMuxPolicy,
  // Keep pool at 0 to prevent interface binding errors (701)
  ICE_CANDIDATE_POOL_SIZE: 0,
} as const;

if (import.meta.env.DEV) {
  console.log('[WebRTC Config] Active ICE servers:', WEBRTC_CONFIG.ICE_SERVERS.length);
}