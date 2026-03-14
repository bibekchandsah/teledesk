# Draft Message Sync - Setup Instructions

## Issue Summary
The draft message sync feature is implemented but requires a database migration to create the `drafts` table. Currently, the backend is returning errors because:
1. The `drafts` table doesn't exist in the database
2. There's an authentication issue causing `req.user` to be undefined

## Fixes Applied
1. Added better error handling in the draft controller to check if `req.user` exists before accessing it
2. Fixed the fallback response when the table doesn't exist to handle undefined `req.user`

## Steps to Enable Draft Sync

### 1. Run the Database Migration

You need to run the migration to create the `drafts` table in your Supabase database:

```bash
# Option 1: Using psql command line
psql -U your_username -d your_database -f backend-server/drafts-migration.sql

# Option 2: Using Supabase Dashboard
# 1. Go to your Supabase project dashboard
# 2. Navigate to SQL Editor
# 3. Copy the contents of backend-server/drafts-migration.sql
# 4. Paste and execute the SQL
```

### 2. Restart the Backend Server

After running the migration, restart your backend server:

```bash
cd backend-server
npm run dev
```

### 3. Test the Feature

1. Open the app in two different windows/devices
2. Log in with the same account on both
3. Open the same chat on both windows
4. Start typing in one window
5. After 1 second, the draft should appear in the other window

## How It Works

1. **Local Storage**: When you type, the draft is immediately saved to local Zustand store
2. **Backend Sync**: After 1 second of inactivity, the draft is saved to the backend
3. **Socket Broadcast**: The backend broadcasts the draft update to all other devices logged in with the same account
4. **Real-time Update**: Other devices receive the socket event and update their input field

## Troubleshooting

### If drafts still don't sync:

1. **Check Backend Logs**: Look for any errors in `backend-server/logs/error.log`
2. **Check Console**: Open browser console and look for `[Draft]` prefixed messages
3. **Verify Authentication**: Make sure you're logged in and the token is valid
4. **Check Socket Connection**: Look for `[Socket] Connected:` message in console

### Common Issues:

- **401 Unauthorized**: Your authentication token might be expired. Try logging out and back in.
- **Table doesn't exist**: You haven't run the migration yet.
- **Socket not connected**: Check if the backend server is running and accessible.

## Migration File Location

The migration file is located at: `backend-server/drafts-migration.sql`

## Related Files

- Backend Controller: `backend-server/src/controllers/draftController.ts`
- Backend Service: `backend-server/src/services/draftService.ts`
- Backend Routes: `backend-server/src/routes/draftRoutes.ts`
- Frontend Store: `desktop-client/src/store/draftStore.ts`
- Frontend API: `desktop-client/src/services/apiService.ts`
- Socket Handler: `desktop-client/src/context/SocketContext.tsx`
- Chat Window: `desktop-client/src/pages/ChatWindow.tsx`
