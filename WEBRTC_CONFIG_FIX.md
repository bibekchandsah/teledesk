# WebRTC Configuration Fix - Firefox ICE Connection Issue

## Problem Summary
Firefox was showing "Using five or more STUN/TURN servers slows down discovery" warning and ICE connections were failing after 5 seconds. The issue was caused by:

1. Too many ICE servers (6 total: 3 STUN + 3 TURN from shared config)
2. CallWindowPage.tsx importing from wrong config file (shared config instead of optimized desktop config)

## Root Cause
- `CallWindowPage.tsx` was importing `WEBRTC_CONFIG` from `@shared/constants/config` which only has basic STUN servers
- It was trying to access properties (`ICE_TRANSPORT_POLICY`, `BUNDLE_POLICY`, `RTCP_MUX_POLICY`) that don't exist in shared config
- This caused TypeScript errors on lines 44-48

## Fixes Applied

### 1. Fixed Import in CallWindowPage.tsx
**File**: `desktop-client/src/pages/CallWindowPage.tsx`

**Changed line 6 from:**
```typescript
import { WEBRTC_CONFIG } from '@shared/constants/config';
```

**To:**
```typescript
import { WEBRTC_CONFIG } from '../config/webrtc';
```

### 2. Optimized WebRTC Config (Already Done)
**File**: `desktop-client/src/config/webrtc.ts`

The optimized config now uses only 3 ICE servers:
- 1 STUN server (Google's primary: `stun:stun.l.google.com:19302`)
- 2 TURN servers (openrelay.metered.ca on ports 80 and 443)

This reduces ICE discovery time and prevents Firefox timeout warnings.

### 3. Config Properties
The optimized config includes:
```typescript
{
  ICE_SERVERS: [...],
  ICE_TRANSPORT_POLICY: 'all',
  BUNDLE_POLICY: 'max-bundle',
  RTCP_MUX_POLICY: 'require',
}
```

## Files Using Optimized Config
✅ `desktop-client/src/services/webrtcService.ts` - createInitiatorPeer & createReceiverPeer
✅ `desktop-client/src/pages/CallWindowPage.tsx` - PEER_CONFIG constant
✅ `desktop-client/src/config/webrtc.ts` - centralized config

## Testing Instructions

### Test 1: Same PC with Two Browsers (Chrome + Edge/Firefox)
1. Open the app in Chrome (User A)
2. Open the app in Edge or Firefox (User B)
3. Use headphones or mute one side to prevent audio feedback
4. Start a voice call from User A to User B
5. Accept the call on User B
6. **Expected**: Audio should work in both directions
7. Check Firefox console - should NOT see "Using five or more STUN/TURN servers" warning
8. ICE connection should establish within 2-3 seconds (not fail after 5 seconds)

### Test 2: Video Call (One Camera at a Time)
1. Only one browser can access the camera at a time on the same PC
2. Test with voice call first, then enable video on one side
3. Or use a virtual camera tool to test video on both sides

### Test 3: Cross-Browser Compatibility
Test these combinations:
- Chrome ↔ Chrome
- Chrome ↔ Edge
- Chrome ↔ Firefox
- Edge ↔ Firefox

### Test 4: Desktop-to-Desktop Calls
1. Open desktop app (Electron) on one account
2. Open desktop app on another account (or same PC with different user)
3. Test voice and video calls
4. **Expected**: Audio and video should work

## Firefox-Specific Checks
Open Firefox Developer Console (F12) and check for:
- ❌ Should NOT see: "Using five or more STUN/TURN servers slows down discovery"
- ❌ Should NOT see: "ICE connection state: failed" after 5 seconds
- ✅ Should see: "ICE connection state: connected" or "completed"
- ✅ Should see: "TURN candidates available: 2"
- ✅ Should see: "STUN candidates: 1"

## Known Limitations

### Free TURN Server
The app uses `openrelay.metered.ca` which is:
- Free but rate-limited
- May be slow or unreliable
- Not suitable for production

**For production**, configure custom TURN servers in `.env`:
```env
VITE_TURN_URL=turn:your-turn-server.com:3478
VITE_TURN_USERNAME=your-username
VITE_TURN_CREDENTIAL=your-password
```

### Same PC Testing
When testing on the same PC:
- Use headphones to prevent audio feedback
- Only one browser can access the camera at a time
- Network conditions are ideal (localhost), so TURN may not be used
- Test on different networks/devices for real-world scenarios

## Next Steps
1. ✅ TypeScript error fixed
2. ✅ Optimized ICE servers (3 instead of 6)
3. ✅ All peer creation uses optimized config
4. 🔄 Test with Firefox to verify ICE connection no longer fails
5. 🔄 Test audio/video streaming in all scenarios
6. 📋 Consider setting up custom TURN servers for production

## Verification Checklist
- [x] TypeScript compiles without errors in CallWindowPage.tsx
- [x] TypeScript compiles without errors in CallHistoryPage.tsx
- [x] Import uses desktop config instead of shared config
- [x] PEER_CONFIG uses all 4 properties (iceServers, iceTransportPolicy, bundlePolicy, rtcpMuxPolicy)
- [x] webrtcService uses optimized config
- [x] Build completes successfully (tsc passes)
- [ ] Firefox no longer shows "too many servers" warning
- [ ] ICE connection establishes successfully
- [ ] Audio works in web-to-web calls
- [ ] Audio works in desktop-to-desktop calls
- [ ] Video works in both scenarios
