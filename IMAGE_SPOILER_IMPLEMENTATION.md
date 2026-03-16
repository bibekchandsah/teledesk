# Image/Video Spoiler Feature - Complete Implementation

## Overview
Fully functional image and video spoiler feature with toggle reveal/hide behavior, premium particle effects, and seamless integration across the application.

## Features Implemented

### ✅ Toggle Behavior
- Click to reveal spoiler (removes blur and particles)
- Click again to hide spoiler (restores blur and particles)
- Works exactly like text spoilers
- "Click to hide" badge appears when revealed

### ✅ Premium Visual Effects
- Animated particles with glow effect
- Pulsating animation
- Shimmer effect overlay
- Blur and dark overlay
- Smooth reveal/hide transitions
- Hover effects on labels

### ✅ Integration Points

#### Single Images/Videos (MessageBubble)
- Images: Wrapped with ImageSpoiler when `message.isSpoiler === true`
- Videos: Wrapped with ImageSpoiler when `message.isSpoiler === true`
- Supports preview modal when revealed

#### Grid Layout (ChatWindow MediaGroupBubble)
- Multiple images in grid all support spoiler effect
- Each image can be revealed/hidden independently
- Maintains grid layout integrity

#### Upload Preview
- Checkbox: "Mark as spoiler" (only shows for images/videos)
- Checkbox state persists until send or cancel
- Works with single and multiple file uploads
- Works with captions

### ✅ Backend Support
- `isSpoiler` field added to message payload
- Socket event handler updated
- Database migration file created

### ✅ Bug Fixes
- Fixed DOM nesting warning by changing `<p>` tags to `<div>` tags in MessageBubble
- Fixed text spoiler to support toggle behavior
- Fixed image spoiler to support toggle behavior
- Separated click handlers for reveal/hide vs preview modal

## User Experience Flow

### Sending Spoiler Media
1. User clicks attachment button
2. Selects image(s) or video(s)
3. Upload preview appears with "Mark as spoiler" checkbox
4. User checks the checkbox
5. Optionally adds caption
6. Clicks send
7. Media appears with spoiler effect for recipient

### Receiving Spoiler Media
1. Message arrives with blurred media and "SPOILER - Click to reveal" label
2. User clicks anywhere on the spoiler
3. Blur and particles fade away, revealing the media
4. "Click to hide" badge appears in top-right corner
5. User can click again to hide the spoiler
6. If revealed, clicking the image opens preview modal (if available)

### Text Spoilers (Updated)
1. Text wrapped in `||spoiler||` syntax
2. Click to reveal text
3. Click again to hide text
4. Works inline with other formatting

## Technical Details

### Components Modified
- `desktop-client/src/components/ImageSpoiler.tsx` - Main spoiler component
- `desktop-client/src/components/SpoilerText.tsx` - Updated for toggle behavior
- `desktop-client/src/components/MessageBubble.tsx` - Integrated spoilers for single media
- `desktop-client/src/pages/ChatWindow.tsx` - Integrated spoilers in grid layout

### Backend Modified
- `backend-server/src/sockets/socketManager.ts` - Added isSpoiler to payload

### Database Migration
- `backend-server/spoiler-migration.sql` - Adds is_spoiler column
- `backend-server/SPOILER_MIGRATION_INSTRUCTIONS.md` - Migration guide

### Type Definitions
- `shared/types/index.ts` - Added `isSpoiler?: boolean` to Message interface

## Click Behavior Logic

### When Spoiler is Hidden
- Click anywhere → Reveal spoiler
- Shows particles, blur, dark overlay, and "SPOILER" label

### When Spoiler is Revealed
- Click on container → Hide spoiler (restore effects)
- Click on image (if onClick provided) → Open preview modal
- Shows "Click to hide" badge in top-right

## Testing Checklist

### Database Setup
- [ ] Run `spoiler-migration.sql` in Supabase SQL editor
- [ ] Verify `is_spoiler` column exists in messages table
- [ ] Restart backend server

### Single Image Spoiler
- [ ] Send image with spoiler checkbox checked
- [ ] Verify blur and particles appear
- [ ] Click to reveal
- [ ] Verify "Click to hide" badge appears
- [ ] Click to hide
- [ ] Verify spoiler effect returns
- [ ] Click to reveal again
- [ ] Click image to open preview modal

### Grid Layout Spoiler
- [ ] Send 2-10 images with spoiler checkbox checked
- [ ] Verify all images show spoiler effect
- [ ] Click each image to reveal independently
- [ ] Verify each can be hidden independently
- [ ] Test with mixed spoiler/non-spoiler images

### Video Spoiler
- [ ] Send video with spoiler checkbox checked
- [ ] Verify spoiler effect on video thumbnail
- [ ] Click to reveal
- [ ] Click to hide
- [ ] Click revealed video to open preview

### Text Spoiler (Updated)
- [ ] Send message with `||spoiler text||`
- [ ] Click to reveal
- [ ] Click to hide
- [ ] Verify toggle works multiple times

### Cross-Device Sync
- [ ] Send spoiler from device A
- [ ] Open on device B
- [ ] Verify spoiler effect is preserved
- [ ] Reveal on device B
- [ ] Note: Reveal state is per-device (by design)

### Edge Cases
- [ ] Spoiler with caption
- [ ] Multiple spoilers in grid
- [ ] Spoiler in forwarded message
- [ ] Spoiler in reply
- [ ] Spoiler with search highlighting

## Known Behavior

### Per-Device Reveal State
- Reveal/hide state is stored in component state (not synced)
- Each device maintains its own reveal state
- This is intentional - spoilers should be revealed per-viewer

### Preview Modal
- When spoiler is revealed, clicking the image opens preview modal
- When spoiler is hidden, clicking anywhere reveals it
- This provides intuitive two-step interaction

### Performance
- Particle animation uses requestAnimationFrame for smooth 60fps
- Canvas is only rendered when spoiler is hidden
- Cleanup on unmount prevents memory leaks

## Future Enhancements (Optional)
- [ ] Add sound effect on reveal
- [ ] Add haptic feedback on mobile
- [ ] Sync reveal state across devices (if requested)
- [ ] Add spoiler to stickers
- [ ] Add spoiler to GIFs with special handling
- [ ] Add "Reveal all spoilers" button in chat
- [ ] Add setting to auto-reveal spoilers
- [ ] Add spoiler statistics (how many times revealed)

## Rollback Instructions
If needed, revert changes:
```sql
-- Remove database column
ALTER TABLE public.messages DROP COLUMN IF EXISTS is_spoiler;
DROP INDEX IF EXISTS messages_is_spoiler_idx;
```

Then revert the following files to previous versions:
- `desktop-client/src/components/ImageSpoiler.tsx`
- `desktop-client/src/components/SpoilerText.tsx`
- `desktop-client/src/components/MessageBubble.tsx`
- `desktop-client/src/pages/ChatWindow.tsx`
- `backend-server/src/sockets/socketManager.ts`
- `shared/types/index.ts`
