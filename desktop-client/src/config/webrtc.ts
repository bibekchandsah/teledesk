/**
 * WebRTC Configuration for Frontend
 * Includes multiple TURN fallback servers for maximum reliability
 */

const getIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [];

  // 1. Primary STUN servers
  servers.push(
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.turnix.io:3478' }
  );

  // 2. TURN servers - High Priority (Turnix - valid until 2028)
  servers.push({
    urls: [
      "turn:eu-central.turnix.io:3478?transport=udp",
      "turn:eu-central.turnix.io:3478?transport=tcp",
      "turns:eu-central.turnix.io:443?transport=udp",
      "turns:eu-central.turnix.io:443?transport=tcp"
    ],
    username: "98826885-d2c5-4c2e-940b-d4491d20eeb4",
    credential: "712cea9e21bee1018b80dffa397ff924"
  });

  // 3. TURN servers - Medium Priority (ExpressTurn)
  servers.push({
    urls: 'turn:free.expressturn.com:3478',
    username: '000000002089881963',
    credential: 'lcodSjMIrHW1RIENl/n5SMMSFVY='
  });

  // 4. TURN servers - Fallback (OpenRelay Metered - might be over quota)
  servers.push(
    { 
      urls: 'turns:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayprojectsecret'
    }
  );

  // 5. TURN servers - Last Resort (Low Bandwidth fallback)
  servers.push({
    urls: 'turn:freestun.net:3478',
    username: 'free',
    credential: 'free'
  });

  return servers;
};

export const WEBRTC_CONFIG = {
  ICE_SERVERS: getIceServers(),
  ICE_TRANSPORT_POLICY: 'all' as RTCIceTransportPolicy,
  BUNDLE_POLICY: 'max-bundle' as RTCBundlePolicy,
  RTCP_MUX_POLICY: 'require' as RTCRtcpMuxPolicy,
  // Keep pool at 0 or small value if previous 701 errors occurred
  ICE_CANDIDATE_POOL_SIZE: 0,
} as const;

if (import.meta.env.DEV) {
  console.log('[WebRTC Config] Multi-Server ICE Config Loaded. Total servers:', WEBRTC_CONFIG.ICE_SERVERS.length);
}