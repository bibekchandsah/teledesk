# Call System Bug Fixes

This document summarizes the fixes applied to resolve the reported call system issues.

## Issues Fixed

### 1. ✅ Workbox Navigation Route Error
**Problem:** `workbox The navigation route /call-window?d=... is not being used, since the URL being navigated to doesn't match the allowlist`

**Root Cause:** Vite PWA plugin's Workbox configuration didn't include navigation route handlers for call windows.

**Fix Applied:**
- Added `navigateFallback: '/index.html'` to Workbox config
- Added `navigateFallbackAllowlist: [/^\/call-window/, /^\/incoming-call-window/, /^(?!\/__).*/]` to allow call window routes
- **File:** `vite.config.ts`

### 2. ✅ WebRTC InvalidStateError in Renegotiation
**Problem:** 
- `processRenegotiationOffer failed: InvalidStateError: Failed to execute 'setLocalDescription' on 'RTCPeerConnection': Failed to set local answer sdp: Called in wrong state: stable`
- `processRenegotiationAnswer failed: InvalidStateError: Failed to execute 'setRemoteDescription' on 'RTCPeerConnection': Failed to set remote answer sdp: Called in wrong state: stable`

**Root Cause:** Race condition between simple-peer's automatic negotiationneeded handler and manual renegotiation attempts.

**Fixes Applied:**
- Added signaling state validation before processing offers/answers
- Temporarily suppress simple-peer's negotiationneeded handler during manual renegotiation
- Added proper error handling and handler restoration
- **File:** `src/services/webrtcService.ts`

### 3. ✅ Call Window Not Closing Properly
**Problem:** When web user ends call, ringing window still shows to web user after call window closed.

**Root Cause:** Incomplete cleanup paths and timing issues in popup close detection.

**Fixes Applied:**
- Improved web popup close detection frequency (500ms instead of 1000ms)
- Enhanced cleanup logic to handle both `activeCall` and `incomingCall` states
- Added proper END_CALL socket emission when popup closes
- Ensured ringtones stop in all cleanup scenarios
- **File:** `src/context/CallContext.tsx`

### 4. ✅ Media Stream Synchronization Issues
**Problem:** No audio/video between web and desktop users during calls.

**Root Cause:** Media capture timing issues and improper stream handling.

**Fixes Applied:**
- Added pre-capture of media for incoming calls to reduce delay
- Fixed peer creation order in `handleAcceptCall`
- Improved media stream fallback handling
- **File:** `src/pages/CallWindowPage.tsx`

## Technical Details

### WebRTC State Management
The WebRTC peer connection has specific signaling states:
- `stable` - No ongoing negotiation
- `have-local-offer` - Local offer set, waiting for remote answer
- `have-remote-offer` - Remote offer set, waiting to send answer

The fixes ensure we only process renegotiation when in valid states and prevent race conditions.

### Media Stream Handling
- **Outgoing calls:** Media captured immediately when call window opens
- **Incoming calls:** Media pre-captured to reduce accept delay, with fallback if pre-capture fails
- **Peer creation:** Proper ordering ensures media is available before WebRTC negotiation

### Call Cleanup
Multiple cleanup paths now properly synchronized:
1. **Hangup button:** User-initiated cleanup
2. **Window close:** OS-initiated cleanup (X button)
3. **Popup close:** Browser popup closure detection
4. **Call timeout:** Automatic cleanup after 30 seconds
5. **Remote hangup:** Cleanup when other party ends call

All paths now:
- Stop ringtones immediately
- Send proper socket events
- Clean up media streams
- Reset call state
- Close windows appropriately

## Testing Recommendations

### Test Scenarios
1. **Web to Desktop calls:**
   - Initiate call from web → Should hear outgoing ringtone
   - Desktop receives → Should hear incoming ringtone
   - Accept call → Both ringtones stop, media flows
   - End call from web → Both windows close properly

2. **Desktop to Web calls:**
   - Initiate call from desktop → Should hear outgoing ringtone
   - Web receives → Should hear incoming ringtone
   - Accept call → Both ringtones stop, media flows
   - End call from desktop → Both windows close properly

3. **Edge cases:**
   - Close call window with OS X button → Should cleanup properly
   - Call timeout (30s) → Should stop ringtones and cleanup
   - Network disconnection → Should handle gracefully

### Expected Behavior
- ✅ No Workbox errors in console
- ✅ No WebRTC InvalidStateError messages
- ✅ Audio/video flows between all client types
- ✅ Call windows close properly from both sides
- ✅ Ringtones play and stop appropriately
- ✅ No memory leaks or orphaned call states

## Performance Impact
- **Minimal:** Pre-capturing media for incoming calls uses slightly more resources but significantly improves user experience
- **Positive:** Reduced popup polling interval (500ms) provides better responsiveness
- **Neutral:** WebRTC state validation adds minimal overhead but prevents crashes

## Browser Compatibility
All fixes maintain compatibility with:
- Chrome/Chromium (including Electron)
- Firefox
- Safari
- Edge

The Workbox navigation fix specifically improves PWA behavior in all modern browsers.