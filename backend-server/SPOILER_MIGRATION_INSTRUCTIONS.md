# Image/Video Spoiler Feature - Database Migration

## Overview
This migration adds support for marking images and videos as "spoilers" with a premium blur effect and particle animation. When users send media files, they can check a "Mark as spoiler" option, and the media will be hidden until the recipient clicks to reveal it.

## Features
- ✅ Spoiler checkbox in file upload preview (only for images/videos)
- ✅ Premium particle animation with blur effect
- ✅ Works in both single image messages and grid layouts
- ✅ Backend support for storing spoiler flag
- ✅ Cross-device synchronization

## Migration Steps

### 1. Run the SQL Migration
Open your Supabase project dashboard:
1. Go to **SQL Editor**
2. Create a new query
3. Copy and paste the contents of `spoiler-migration.sql`
4. Click **Run**

### 2. Verify the Migration
Run this query to confirm the column was added:
```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'messages' 
AND column_name = 'is_spoiler';
```

Expected result:
```
column_name | data_type | column_default
is_spoiler  | boolean   | false
```

### 3. Restart Backend Server
After running the migration, restart your backend server to ensure the changes are picked up:
```bash
cd backend-server
npm run dev
```

### 4. Test the Feature

#### Test Single Image Spoiler:
1. Open a chat
2. Click the attachment button and select an image
3. Check the "Mark as spoiler" checkbox
4. Add an optional caption
5. Send the message
6. Verify the image appears with blur effect and "SPOILER - Click to reveal" label
7. Click the spoiler to reveal the image

#### Test Grid Layout Spoiler:
1. Select multiple images (2-10 images)
2. Check the "Mark as spoiler" checkbox
3. Send the messages
4. Verify all images in the grid show the spoiler effect
5. Click each image to reveal individually

#### Test Video Spoiler:
1. Select a video file
2. Check the "Mark as spoiler" checkbox
3. Send the message
4. Verify the video thumbnail shows the spoiler effect
5. Click to reveal and play the video

#### Test Cross-Device Sync:
1. Send a spoiler image from desktop
2. Open the same chat on another device
3. Verify the spoiler effect is preserved
4. Reveal on one device
5. Note: Reveal state is per-device (by design)

## Technical Details

### Database Schema
```sql
-- Added to messages table
is_spoiler boolean default false
```

### Backend Changes
- `backend-server/src/sockets/socketManager.ts`: Added `isSpoiler` to message payload

### Frontend Changes
- `desktop-client/src/components/ImageSpoiler.tsx`: New component with premium effects
- `desktop-client/src/pages/ChatWindow.tsx`: 
  - Added spoiler checkbox in upload preview
  - Integrated ImageSpoiler in grid layout
  - Pass isSpoiler flag to backend
- `desktop-client/src/components/MessageBubble.tsx`: 
  - Integrated ImageSpoiler for single images/videos
- `shared/types/index.ts`: Added `isSpoiler?: boolean` to Message interface

### Premium Effects
- Animated particles with glow effect
- Pulsating animation
- Shimmer effect
- Blur and dark overlay
- Smooth reveal transition
- Hover effects

## Rollback (if needed)
If you need to remove this feature:
```sql
-- Remove the column
ALTER TABLE public.messages DROP COLUMN IF EXISTS is_spoiler;

-- Remove the index
DROP INDEX IF EXISTS messages_is_spoiler_idx;
```

## Notes
- Spoiler state is stored per-message, not per-user
- Revealing a spoiler is a client-side action (not synced across devices)
- Only images and videos can be marked as spoilers
- The checkbox only appears when uploading media files
- Works seamlessly with existing features (captions, grid layouts, etc.)
