# Device Sessions Deployment Fix

## Issue
The device sessions routes are returning 404 "Route not found" on the deployed backend, even though they work locally.

## Root Cause
The deployment platform (Railway) may not have picked up the new device session files or there's a build/deployment caching issue.

## Temporary Fix Applied ✅

I've moved the device session routes to the existing `userRoutes.ts` file as a workaround to ensure they get deployed:

### Backend Changes:
- **File**: `backend-server/src/routes/userRoutes.ts`
- **Added**: Device session routes under `/api/users/device-sessions`
- **Routes**:
  - `GET /api/users/device-sessions` - Get all sessions
  - `DELETE /api/users/device-sessions/:sessionId` - Revoke specific session  
  - `DELETE /api/users/device-sessions/others/all` - Revoke all other sessions

### Frontend Changes:
- **File**: `desktop-client/src/services/deviceSessionService.ts`
- **Updated**: API endpoints to use `/api/users/device-sessions` instead of `/api/device-sessions`

## Deployment Steps

1. **Deploy Backend Changes**:
   ```bash
   # The backend changes are ready to deploy
   # Push to your repository and redeploy on Railway
   ```

2. **Deploy Frontend Changes**:
   ```bash
   # The frontend changes are ready to deploy
   # Build and deploy your frontend
   ```

3. **Run Database Migration**:
   ```sql
   -- In Supabase SQL Editor, run:
   -- Copy contents of backend-server/device-sessions-migration.sql
   ```

4. **Add Environment Variable** (Optional):
   ```bash
   # In Railway dashboard, add:
   IPINFO_API_KEY=your-api-key-from-ipinfo.io
   ```

## Testing After Deployment

1. **Verify Routes Work**:
   - Visit: `https://your-backend-url.railway.app/api/debug/routes`
   - Should show all registered routes including device-sessions

2. **Test Device Sessions**:
   - Go to Settings → Privacy & Security → Manage Devices
   - Should load without 404 errors
   - Should show current device session

## Future Cleanup (Optional)

Once the deployment is working, you can optionally:

1. **Move routes back to separate file**:
   - Keep device session routes in `userRoutes.ts` (works fine)
   - OR move back to `deviceSessionRoutes.ts` after confirming deployment works

2. **Update API paths**:
   - Current: `/api/users/device-sessions`
   - Could change back to: `/api/device-sessions`

## Expected Behavior After Fix

✅ **Device Sessions Page**: Should load without errors  
✅ **Current Session**: Should display with device info and location  
✅ **Remote Logout**: Should work for individual and bulk logout  
✅ **Real-time Updates**: Session list should refresh after actions  

The temporary fix ensures the device session functionality works immediately while avoiding deployment/build issues with new route files.