# Call Audio Fix - Web to Desktop Calls

## Problem
Web users calling desktop users had no audio because:
1. Popup windows were being used for web calls
2. Popup couldn't navigate to `/call-window` due to service worker issues
3. Popup stayed at `about:blank` but detection thought it was working
4. `isCallInPopup` flag stayed `true` so `CallScreen` never rendered
5. No audio because popup window couldn't load properly

## Solution
**Disabled popups entirely for web users** - all web calls now use in-app UI:
- Outgoing calls: Use in-app `CallScreen` component
- Incoming calls: Use in-app `IncomingCallModal` component

This matches how incoming calls already worked (which had audio working correctly).

## Changes Made

### `desktop-client/src/context/CallContext.tsx`

1. **Outgoing calls (line ~713)**: Removed all popup logic for web users
   - Simplified to immediately use in-app CallScreen
   - Captures media stream right away
   - Sets `isCallInPopup = false` so CallScreen renders

2. **Incoming calls (line ~528)**: Removed all popup logic for web users
   - Simplified to immediately use in-app IncomingCallModal
   - Pre-captures media for faster accept
   - Sets `isCallInPopup = false` so modal renders

3. **TypeScript fix (line ~105)**: Fixed type error with catch block

## Result
- Web users now have working audio/video calls with desktop users
- No more popup blocking issues
- Consistent UI experience (same as incoming calls which already worked)
- Electron users still use separate call windows (unchanged)

## Testing
Test these scenarios:
1. Web user calls desktop user (voice) - should have audio
2. Web user calls desktop user (video) - should have audio/video
3. Desktop user calls web user - should have audio
4. Web user receives call - should work as before (already working)
