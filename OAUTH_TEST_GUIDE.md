# Google OAuth Testing Guide

## Quick Test Steps

### 1. Start Backend
```bash
cd backend-server
npm run dev
```

Expected output:
```
[Server] Running on http://localhost:3001
```

### 2. Start Desktop Client
```bash
cd desktop-client
npx tsc -p tsconfig.electron.json ; npm run electron:dev
```

### 3. Test OAuth Flow

1. Click "Continue with Google" button
2. **Watch the console** - you should see:
   ```
   [Auth] Setting up deep link listener for external OAuth tokens
   ```

3. System browser opens with Google OAuth page
4. Sign in with your Google account
5. **Watch the console** - you should see:
   ```
   [DeepLink] Received URL: teledesk://auth?token=...
   [DeepLink] Token found: yes (XXX chars)
   [DeepLink] Sending token to renderer via IPC
   [Auth] Received external auth token via deep link
   [Auth] Token length: XXX
   [Auth] Firebase sign-in finished in XXXms
   ```

6. App should automatically log you in

### Expected Behavior

✅ **Success**: 
- Browser opens
- You authenticate
- Browser shows "Authentication Successful!"
- App automatically logs you in
- You see the main chat interface

❌ **Failure Scenarios**:

**Scenario 1: Stuck on loading**
- Console shows: `[Auth] Google OAuth timeout - clearing loading state`
- Possible causes:
  - Backend not running
  - Deep link not registered
  - Token not being sent

**Scenario 2: Browser opens but nothing happens**
- Check backend logs for errors
- Verify OAuth callback URL is correct
- Check if deep link is being triggered

**Scenario 3: Token received but login fails**
- Console shows: `[Auth] External token login failed:`
- Check Firebase configuration
- Verify custom token is valid

## Debug Checklist

If OAuth doesn't work, check these in order:

### 1. Backend Health
```bash
curl http://localhost:3001/api/auth/desktop/google
```
Should redirect to Google OAuth page.

### 2. Environment Variables
Check `backend-server/.env.development`:
```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
BACKEND_URL=http://localhost:3001
```

### 3. Deep Link Registration
The app should automatically register `teledesk://` protocol.
On Windows, check registry:
```
HKEY_CLASSES_ROOT\teledesk
```

### 4. Console Logs
Enable all console logs and look for:
- `[DeepLink]` messages in main process
- `[Auth]` messages in renderer process
- Any error messages

### 5. Backend Logs
Check `backend-server/logs/combined.log` for OAuth errors.

## Production Testing

### Build the App
```bash
cd desktop-client
npm run build
```

### Test the EXE
1. Run the compiled `.exe` file
2. Try Google OAuth login
3. Check if it works in production mode

### Common Production Issues

1. **Deep link not working**: 
   - Reinstall the app (protocol registration happens on install)
   - Check Windows registry for `teledesk://` protocol

2. **Backend URL wrong**:
   - Check `.env.production` has correct `VITE_BACKEND_URL`
   - Rebuild the app after changing env vars

3. **CORS errors**:
   - Verify backend CORS settings allow your production domain
   - Check `backend-server/src/config/corsConfig.ts`

## Manual Deep Link Test

You can manually test the deep link by:

1. Start the app
2. Open browser
3. Navigate to: `teledesk://auth?token=test123`
4. Check console for:
   ```
   [DeepLink] Received URL: teledesk://auth?token=test123
   [DeepLink] Token found: yes (7 chars)
   ```

This verifies the deep link protocol is working (even though the token is invalid).

## Timeout Test

To test the 60-second timeout:

1. Click "Continue with Google"
2. Don't complete the authentication
3. Wait 60 seconds
4. Console should show:
   ```
   [Auth] Google OAuth timeout - clearing loading state
   ```
5. Loading spinner should disappear
6. Error message should appear

## Success Criteria

✅ OAuth flow completes in under 10 seconds
✅ No stuck loading states
✅ Clear error messages if something fails
✅ Works in both dev and production
✅ Works with multiple app instances
✅ Timeout mechanism prevents infinite loading

## Need Help?

Check these files for implementation details:
- `desktop-client/src/context/AuthContext.tsx` - OAuth logic
- `desktop-client/electron/main.ts` - Deep link handling
- `backend-server/src/controllers/desktopAuthController.ts` - OAuth callback
- `GOOGLE_OAUTH_FIX.md` - Detailed technical explanation
