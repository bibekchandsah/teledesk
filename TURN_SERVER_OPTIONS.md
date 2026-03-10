# TURN Server Configuration Options

## Current Issue
Your TURN server isn't generating relay candidates, which means calls will fail between users on different networks.

## Option 1: Free Public TURN Server (Recommended for Testing)
```env
VITE_TURN_URL=turn:openrelay.metered.ca:80
VITE_TURN_USERNAME=openrelayproject
VITE_TURN_CREDENTIAL=openrelayproject
```

## Option 2: Your Custom Metered.ca Server
If you have a Metered.ca account, get your credentials from the dashboard:
```env
VITE_TURN_URL=turn:global.relay.metered.ca:80
VITE_TURN_USERNAME=your-metered-username
VITE_TURN_CREDENTIAL=your-metered-credential
```

## Option 3: Alternative Free TURN Servers

### Twilio STUN/TURN (Free Tier)
```env
VITE_TURN_URL=turn:global.turn.twilio.com:3478
VITE_TURN_USERNAME=your-twilio-username
VITE_TURN_CREDENTIAL=your-twilio-credential
```

### ExpressTURN (1000GB/month free)
```env
VITE_TURN_URL=turn:turn.expressturn.com:3478
VITE_TURN_USERNAME=your-expressturn-username
VITE_TURN_CREDENTIAL=your-expressturn-credential
```

## Testing Your Configuration

1. **Update your `.env.local`** with one of the above configurations
2. **Restart your development server**
3. **Use the ConnectionTest component** to verify TURN is working
4. **Look for relay candidates** in the console logs

## What to Look For

### ✅ Working TURN Server
```
[WebRTC] ICE candidate: {type: 'relay', protocol: 'udp', address: '198.51.100.1', port: 12345}
```

### ❌ Not Working TURN Server
```
[WebRTC] ICE candidate: {type: 'host', protocol: 'tcp', address: '10.5.234.63', port: 9}
[WebRTC] ICE candidate: {type: 'srflx', protocol: 'udp', address: '103.106.200.58', port: 41560}
```
(No relay candidates = TURN not working)

## Quick Fix for Your Current Issue

1. **Replace your current TURN configuration** with the free public server:
   ```env
   VITE_TURN_URL=turn:openrelay.metered.ca:80
   VITE_TURN_USERNAME=openrelayproject
   VITE_TURN_CREDENTIAL=openrelayproject
   ```

2. **Restart your app** and test a call

3. **Check console logs** - you should see relay candidates

## Production Recommendations

- **Don't use free public TURN servers** in production (shared bandwidth)
- **Get dedicated TURN servers** from Twilio, Agora, or Metered.ca
- **Monitor TURN usage** to avoid unexpected costs
- **Implement fallback mechanisms** for when TURN servers fail