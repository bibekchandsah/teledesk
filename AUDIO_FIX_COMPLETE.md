# Audio Fix - COMPLETE SOLUTION

## Root Causes Identified

### 1. Duplicate Peer Connections
**Problem**: `handleCallAccepted` was being called 4 times, creating 4 separate WebRTC peer connections
**Evidence**: Console showed `[Call] Creating initiator peer for accepted call` 4 times
**Impact**: Multiple connections fighting for the same audio stream

### 2. Audio Element Being Destroyed
**Problem**: Every time the remote stream updated (which happens during renegotiation), the useEffect cleanup would destroy the audio element
**Evidence**: Console showed `[CallScreen] Remote audio playing successfully` followed immediately by `[CallScreen] Cleaning up remote audio`
**Impact**: Audio would start playing but get immediately interrupted

## Solutions Implemented

### Fix 1: Prevent Duplicate Peer Creation
**File**: `desktop-client/src/context/CallContext.tsx`

Added guard check using `hasPeer()` before creating initiator peer:
```typescript
if (hasPeer()) {
  console.log('[Call] Peer already exists, skipping creation');
  return;
}
```

This ensures only ONE peer connection is created per call, even if `handleCallAccepted` is triggered multiple times.

### Fix 2: Persist Audio Element Across Stream Updates
**File**: `desktop-client/src/pages/CallScreen.tsx`

Changed the audio element lifecycle:
- **Before**: Audio element was destroyed and recreated on every `remoteStream` change
- **After**: Audio element is created once and only `srcObject` is updated
- **Cleanup**: Only happens when component unmounts, not on every stream update

This prevents audio interruption when the stream is renegotiated (e.g., when switching between voice and video).

## Expected Behavior Now

1. **Call starts**: 
   - Peer connection created ONCE
   - Audio element created ONCE
   - `[CallScreen] Remote audio playing successfully`

2. **Switch to video**:
   - Remote stream updates with video track
   - Audio element updates srcObject (no recreation)
   - Audio continues playing without interruption

3. **Switch back to audio**:
   - Remote stream updates (video track removed)
   - Audio element updates srcObject (no recreation)
   - Audio continues playing without interruption

## Console Output (Expected)

```
[Call] Using in-app CallScreen for outgoing call
[Call] Media captured for in-app outgoing call
[CallStore] Starting call timer
[Call] Creating initiator peer for accepted call, peer: <userId>
[Call] Remote stream received: {hasAudio: true, hasVideo: false}
[CallScreen] Setting up remote audio playback: {hasAudio: true, hasVideo: false, ...}
[CallScreen] Created new Audio element
[CallScreen] Remote audio playing successfully
```

When switching modes, you should see:
```
[Call] Remote stream received: {hasAudio: true, hasVideo: true}
[CallScreen] Setting up remote audio playback: {hasAudio: true, hasVideo: true, ...}
[CallScreen] Remote audio playing successfully
```

**NO MORE**: `[CallScreen] Cleaning up remote audio` (except on unmount)
**NO MORE**: Multiple `[Call] Creating initiator peer` messages

## Test Now

1. Make a voice call from web to desktop
2. Audio should work immediately
3. Switch to video - audio should continue
4. Switch back to voice - audio should continue
5. Check console - should see only ONE peer creation and NO cleanup messages during the call
