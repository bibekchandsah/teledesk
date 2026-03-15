# Outgoing Call Issues - Additional Fixes

## Issues Addressed

### 1. ✅ **Outgoing Calls Still Opening in Popup When Blocked**
**Problem:** Even when popup is blocked by browser, outgoing calls were still trying to use popup window instead of falling back to in-app modal.

**Root Cause:** Insufficient popup blocking detection and missing delayed validation.

**Fixes Applied:**
- Enhanced `openCallPopup()` with comprehensive blocking detection
- Added immediate checks for `null`, `closed`, and `about:blank` states
- Added delayed validation (500ms) to catch popups that close after initial creation
- Added extensive logging to track popup creation and blocking
- Added fallback logic when delayed popup blocking is detected

### 2. ✅ **Improved Popup Blocking Detection**
**Problem:** Browser popup blocking wasn't being detected reliably, causing calls to get stuck in popup mode.

**Root Cause:** Basic popup validation wasn't comprehensive enough for different browser blocking methods.

**Fixes Applied:**
```typescript
// Enhanced popup validation
if (!popup) {
  console.warn('[Call] window.open returned null - popup blocked');
  return null;
}

if (popup.closed) {
  console.warn('[Call] Popup was closed immediately - likely blocked');
  return null;
}

// Check popup location (some browsers set to about:blank when blocked)
try {
  if (!popup.location || popup.location.href === 'about:blank') {
    console.warn('[Call] Popup location is about:blank - may be blocked');
  }
} catch (e) {
  // Cross-origin error is expected and normal
}
```

### 3. ✅ **Fixed Delayed Popup Blocking Detection**
**Problem:** Some browsers allow popup creation but close it immediately, which wasn't being detected.

**Root Cause:** No delayed validation to catch popups that are blocked after initial creation.

**Fixes Applied:**
- Added 500ms delayed check in `startCall()` function
- If popup is found to be closed after delay, automatically switch to in-app modal
- Capture media stream for delayed fallback scenario
- Proper state management for delayed popup blocking

### 4. ✅ **Enhanced Ringtone Audio Loading**
**Problem:** `AbortError: The play() request was interrupted by a call to pause()` was occurring due to rapid start/stop of ringtones.

**Root Cause:** Ringtone was being played before audio was fully loaded, causing interruptions.

**Fixes Applied:**
```typescript
// Wait for audio to be ready before playing
if (this.incomingRingtone.readyState >= 2) {
  // Audio is loaded enough to play
  this.incomingRingtone.play().then(() => {
    this.isIncomingPlaying = true;
  });
} else {
  // Wait for audio to load
  const playWhenReady = () => {
    this.incomingRingtone!.play().then(() => {
      this.isIncomingPlaying = true;
    });
  };
  this.incomingRingtone.addEventListener('canplay', playWhenReady);
}
```

### 5. ✅ **Added Comprehensive Debug Logging**
**Problem:** Difficult to track why outgoing calls weren't falling back to in-app modal.

**Root Cause:** Insufficient logging to understand call flow and state changes.

**Fixes Applied:**
- Added logging in `startCall()` for popup creation attempts
- Added logging in `openCallPopup()` for all blocking detection scenarios
- Added logging in `App.tsx` to track when CallScreen should render
- Added logging for media capture success/failure in fallback scenarios

## Technical Implementation

### Enhanced Popup Blocking Detection Flow
```
1. Call startCall() → Log "Attempting to open popup"
2. Call openCallPopup() → Log "Opening popup window"
3. Check immediate blocking → Log if blocked
4. Return popup or null
5. If popup returned:
   - Set isCallInPopup = true
   - Start 500ms delayed check
   - If popup closed after delay → Switch to in-app modal
6. If null returned:
   - Set isCallInPopup = false immediately
   - Capture media for in-app modal
   - CallScreen should render
```

### Call State Management
```
isCallInPopup = true  → CallScreen will NOT render (popup handles call)
isCallInPopup = false → CallScreen WILL render (in-app modal)
```

### Expected Log Flow for Blocked Popup
```
[Call] Attempting to open popup for outgoing call
[Call] Opening popup window: /call-window?d=...
[Call] window.open returned null - popup blocked
[Call] Popup blocked immediately, using in-app modal
[Call] Media captured for in-app modal fallback
[App] ActiveCall state changed: { willShowCallScreen: true }
```

## Browser-Specific Behavior

### Chrome/Chromium
- Usually returns `null` immediately when blocked
- Shows popup blocker icon in address bar
- Our immediate detection catches this

### Firefox
- May return popup object but close it immediately
- Our delayed detection (500ms) catches this
- May set popup.location to `about:blank`

### Safari
- Similar to Firefox, may return object then close
- Delayed detection handles this case
- May have different timing requirements

### Edge
- Behaves similarly to Chrome
- Good immediate detection support

## Testing Scenarios

1. **Allow Popups:** Should open in popup window with audio
2. **Block Popups (Immediate):** Should fallback to CallScreen immediately
3. **Block Popups (Delayed):** Should start in popup, then switch to CallScreen after 500ms
4. **Popup Closed by User:** Should detect closure and cleanup properly

## Expected Results

After these fixes:
- ✅ Outgoing calls will properly detect popup blocking
- ✅ Fallback to in-app CallScreen will work reliably
- ✅ Audio will work in both popup and in-app scenarios
- ✅ No more ringtone interruption errors
- ✅ Better debugging information for troubleshooting
- ✅ Consistent behavior across all browsers

The key insight is that popup blocking detection needs to be multi-layered:
1. **Immediate detection** - catches most cases
2. **Delayed detection** - catches browsers that allow creation but close immediately
3. **Proper fallback** - ensures in-app modal works when popup fails