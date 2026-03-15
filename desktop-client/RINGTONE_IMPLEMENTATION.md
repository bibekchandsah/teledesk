# Call Ringtone Implementation

This document describes the implementation of ringtones for incoming and outgoing audio/video calls in the TeleDesk desktop client.

## Overview

The ringtone system uses the existing sound files located at:
- `desktop-client/public/assets/sounds/incoming_ring.mp3` - Played for incoming calls
- `desktop-client/public/assets/sounds/outgoing_ring.mp3` - Played for outgoing calls

## Architecture

### CallAudioService (`src/services/callAudioService.ts`)
A singleton service that manages all call-related audio playback:

**Key Features:**
- Preloads audio files for instant playback
- Manages separate incoming and outgoing ringtones
- Prevents multiple ringtones from playing simultaneously
- Automatic cleanup and resource management
- Volume control and muting capabilities

**Main Methods:**
- `playIncomingRingtone()` - Starts incoming call ringtone (loops)
- `stopIncomingRingtone()` - Stops incoming call ringtone
- `playOutgoingRingtone()` - Starts outgoing call ringtone (loops)
- `stopOutgoingRingtone()` - Stops outgoing call ringtone
- `stopAllRingtones()` - Stops all active ringtones
- `setVolume(volume)` - Adjusts ringtone volume (0-1)
- `setMuted(muted)` - Mutes/unmutes ringtones

## Integration Points

### 1. Incoming Calls
**IncomingCallModal** (`src/pages/IncomingCallModal.tsx`):
- Plays incoming ringtone when modal appears
- Stops ringtone when call is accepted or rejected
- Automatic cleanup on component unmount

### 2. Outgoing Calls
**CallScreen** (`src/pages/CallScreen.tsx`):
- Monitors call status for outgoing calls
- Plays outgoing ringtone when `status === 'ringing'` and user is caller
- Stops ringtone when call is accepted, rejected, or ended

### 3. Call Management
**CallContext** (`src/context/CallContext.tsx`):
- Comprehensive ringtone management across all call events
- Handles Electron IPC bridge events
- Manages web popup bridge events
- Ensures ringtones stop on call timeout (30 seconds)

**CallStore** (`src/store/callStore.ts`):
- Integrated ringtone cleanup in `endCallCleanup()`

## Call Flow & Ringtone Behavior

### Outgoing Call Flow:
1. User initiates call → `startCall()` → Play outgoing ringtone
2. Server confirms callee's device is ringing → Continue outgoing ringtone
3. Call accepted → Stop all ringtones, start call timer
4. Call rejected/timeout → Stop all ringtones, cleanup

### Incoming Call Flow:
1. Receive incoming call → `handleIncomingCall()` → Play incoming ringtone
2. User accepts → Stop incoming ringtone, start call
3. User rejects → Stop incoming ringtone, cleanup
4. Caller cancels → Stop incoming ringtone, cleanup

## Error Handling

- Graceful fallback if audio files are missing
- Console warnings for playback failures (e.g., autoplay restrictions)
- Automatic retry mechanisms for audio loading
- Safe cleanup prevents memory leaks

## Browser Compatibility

- Uses standard HTML5 Audio API
- Handles autoplay restrictions gracefully
- Works in both Electron and web browser environments
- Supports all modern browsers

## Volume Settings

- Incoming ringtone: 70% of user-set volume
- Outgoing ringtone: 60% of user-set volume
- Configurable through `setVolume()` method
- Respects system mute settings

## Performance Considerations

- Audio files are preloaded on service initialization
- Singleton pattern prevents multiple instances
- Efficient memory management with proper cleanup
- Minimal CPU usage during playback

## Future Enhancements

Potential improvements that could be added:
1. Custom ringtone selection
2. Different ringtones for video vs voice calls
3. Fade in/out effects
4. Integration with system notification sounds
5. Ringtone preview in settings
6. Per-contact custom ringtones