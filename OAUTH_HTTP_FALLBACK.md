# OAuth HTTP Fallback Solution

## Problem
The `teledesk://` deep link protocol doesn't work reliably in development mode because Windows doesn't recognize the Electron executable as a proper application.

## Solution
Added a local HTTP server fallback that runs on `http://localhost:48292/auth/callback`.

## How It Works

### Flow
1. User clicks "Continue with Google"
2. Browser opens Google OAuth
3. User authenticates
4. Backend redirects to success page
5. Success page tries TWO methods:
   - **Method 1 (Production)**: `teledesk://auth?token=...` (deep link)
   - **Method 2 (Dev Fallback)**: `http://localhost:48292/auth/callback?token=...` (HTTP)
6. Whichever works first will authenticate the user

### In Development
- Deep link usually fails (protocol not registered)
- HTTP callback succeeds (local server running)
- User gets authenticated via HTTP

### In Production
- Deep link succeeds (protocol registered during install)
- HTTP callback not needed
- User gets authenticated via deep link

## Testing

### 1. Restart Backend
```bash
cd backend-server
npm run dev
```

You should see:
```
[Backend] Environment: development
TeleDesk backend server running on port 3001
```

### 2. Restart Desktop App
```bash
cd desktop-client
npx tsc -p tsconfig.electron.json ; npm run electron:dev
```

You should see:
```
[Main] Protocol registered (dev mode)
[Main] Is default protocol client for teledesk: false
[Main] WARNING: Protocol not registered! Deep links will not work.
[OAuth Server] Listening on http://localhost:48292/auth/callback
```

The warning is expected in dev mode. The HTTP fallback will handle it.

### 3. Test OAuth
1. Click "Continue with Google"
2. Authenticate with Google
3. Browser shows "Authentication Successful! Redirecting to TeleDesk..."
4. After 1 second, browser makes HTTP request to localhost:48292
5. App receives token and logs you in
6. Browser shows "✓ Authentication Successful! You can close this tab."

### 4. Check Logs

**Terminal should show:**
```
[OAuth Server] Received token via HTTP callback
[DeepLink] Sending token to renderer via IPC
```

**App console should show:**
```
[Auth] Received external auth token via deep link
[Auth] Token length: XXX
[Auth] Firebase sign-in finished in XXXms
```

## Advantages

1. **Works in dev mode** without needing protocol registration
2. **Works in production** via deep link (preferred method)
3. **Automatic fallback** - tries deep link first, then HTTP
4. **No user action needed** - completely automatic
5. **Multiple instances supported** - each instance runs its own HTTP server on the same port (first one wins)

## Port Conflict Handling

If port 48292 is already in use:
- The server will fail to start
- Deep link will still work in production
- In dev, you'll need to change the port in both:
  - `desktop-client/electron/main.ts` (OAUTH_CALLBACK_PORT)
  - `backend-server/src/controllers/desktopAuthController.ts` (httpCallbackUrl)

## Security

The HTTP server:
- Only listens on `localhost` (not accessible from network)
- Only accepts GET requests to `/auth/callback`
- Only runs while the app is running
- Automatically stops when app closes
- Token is only valid for a few seconds (Firebase custom token)

## Production Build

In production:
- Deep link protocol is registered during installation
- Deep link works immediately
- HTTP fallback is not needed but still available
- No security concerns (localhost only)

## Troubleshooting

### Issue: "Address already in use"
Another instance is using port 48292. This is fine - the OAuth will go to that instance.

### Issue: HTTP callback fails
Check if the app is running and the server started:
```
[OAuth Server] Listening on http://localhost:48292/auth/callback
```

### Issue: Both methods fail
- Check if backend is running
- Check if token is being generated
- Check backend logs for errors
- Verify Firebase configuration

## Next Steps

Try the OAuth flow now. It should work via the HTTP fallback!
