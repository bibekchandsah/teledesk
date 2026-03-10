# WebRTC Voice/Video Call Troubleshooting Guide

## Common Issues When Users Are on Different Networks

### Problem: Calls fail to connect when users are on different networks/locations

This is typically caused by **NAT (Network Address Translation) traversal issues**. Here's how to fix it:

## Solutions

### 1. TURN Server Configuration (Recommended)

The app now includes TURN server support. Configure these environment variables:

**Desktop Client (.env.local):**
```env
# Free TURN server (limited bandwidth)
VITE_TURN_URL=turn:openrelay.metered.ca:80
VITE_TURN_USERNAME=openrelayproject
VITE_TURN_CREDENTIAL=openrelayproject
```

### 2. Production TURN Servers

For production use, consider these services:

#### Option A: Twilio STUN/TURN
```env
VITE_TURN_URL=turn:global.turn.twilio.com:3478
VITE_TURN_USERNAME=your-twilio-username
VITE_TURN_CREDENTIAL=your-twilio-credential
```

#### Option B: Agora
```env
VITE_TURN_URL=turn:webrtc-turn-1.agora.io:3478
VITE_TURN_USERNAME=your-agora-username
VITE_TURN_CREDENTIAL=your-agora-credential
```

#### Option C: Self-hosted coturn
```env
VITE_TURN_URL=turn:your-server.com:3478
VITE_TURN_USERNAME=your-username
VITE_TURN_CREDENTIAL=your-password
```

### 3. Network Requirements

Ensure these ports are open:

- **UDP 3478**: STUN/TURN signaling
- **UDP 49152-65535**: RTP media (can be restricted to smaller range)
- **TCP 443**: TURN over TLS (fallback)
- **WebSocket**: Your backend server port (default 3001)

### 4. Firewall Configuration

For corporate networks, whitelist:
- `stun.l.google.com:19302`
- `openrelay.metered.ca:80,443` (if using free TURN)
- Your backend server domain/IP

## Debugging

### Check Browser Console

The app now logs detailed WebRTC diagnostics:

```
[WebRTC] Connection state changed: connecting
[WebRTC] ICE connection state: checking
[WebRTC] ICE candidate: {type: "host", protocol: "udp", address: "192.168.1.100"}
[WebRTC] ICE candidate: {type: "srflx", protocol: "udp", address: "203.0.113.1"}
[WebRTC] ICE candidate: {type: "relay", protocol: "udp", address: "198.51.100.1"}
```

### Connection States

- **`host` candidates**: Direct connection (same network)
- **`srflx` candidates**: STUN working (public IP discovered)
- **`relay` candidates**: TURN working (can relay through server)

### Test Connectivity

Add this to your app for testing:

```typescript
import { testConnectivity } from './services/webrtcService';

const testConnection = async () => {
  const result = await testConnectivity();
  console.log('STUN working:', result.stunWorking);
  console.log('TURN working:', result.turnWorking);
  console.log('Public IP:', result.publicIP);
};
```

## Common Error Messages

### "Connection failed - network connectivity issue"
- **Cause**: No path found between peers
- **Solution**: Add TURN servers

### "ICE connection failed - TURN server may be needed"
- **Cause**: STUN alone insufficient for NAT traversal
- **Solution**: Configure TURN servers

### "Failed to get user media"
- **Cause**: Camera/microphone permissions denied
- **Solution**: Check browser permissions

## Network Topology Issues

### Symmetric NAT
- **Problem**: Most restrictive NAT type
- **Solution**: TURN server required

### Firewall Blocking UDP
- **Problem**: Corporate firewalls block UDP traffic
- **Solution**: Use TURN over TCP (port 443)

### Double NAT
- **Problem**: Router behind another router
- **Solution**: TURN server or port forwarding

## Testing Checklist

1. ✅ TURN servers configured
2. ✅ Environment variables set
3. ✅ Firewall ports open
4. ✅ Browser permissions granted
5. ✅ Console shows relay candidates
6. ✅ Connection state reaches "connected"

## Production Recommendations

1. **Use dedicated TURN servers** (not free ones)
2. **Monitor connection success rates**
3. **Implement fallback mechanisms**
4. **Log connection diagnostics**
5. **Test from different network types**

## Cost Considerations

- **Free TURN**: Limited bandwidth, shared resources
- **Paid TURN**: ~$0.40-2.00 per GB of relayed traffic
- **Self-hosted**: Server costs + maintenance

Most calls use direct connection (free), TURN only needed when direct fails (~10-20% of calls).