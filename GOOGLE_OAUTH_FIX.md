# Google OAuth Login Fix

## Problem
When users clicked "Continue with Google" in the desktop app, the OAuth flow would open the browser but the app wouldn't receive the authentication token, leaving users stuck on the loading screen.

## Root Causes Identified

### 1. Loading State Management
The `loginWithGoogle` function in `AuthContext.tsx` would:
- Set loading state to `true`
- Open the external OAuth URL
- Return immediately without clearing loading state
- The deep link callback would eventually fire, but the loading state remained stuck

### 2. Deep Link Handling on Windows
On Windows, when a deep link (`teledesk://auth?token=...`) is clicked:
- If the app is already running, it should be handled via command line arguments
- The `second-instance` event was disabled to support multiple instances
- Command line arguments weren't being checked on app startup
- This meant the OAuth callback URL was never processed

## Changes Made

### 1. AuthContext.tsx - Loading State Timeout
**File**: `desktop-client/src/context/AuthContext.tsx`

Added timeout mechanism to both `loginWithGoogle` and `loginWithGithub`:
```typescript
// Set a 60-second timeout to clear loading if callback never arrives
setTimeout(() => {
  if (useAuthStore.getState().isLoading && !useAuthStore.getState().currentUser) {
    console.warn('[Auth] Google OAuth timeout - clearing loading state');
    setLoading(false);
    setError('Authentication timed out. Please try again.');
    isManualLoginRef.current = false;
  }
}, 60000);
```

This ensures the UI doesn't stay stuck in loading state if something goes wrong.

### 2. Enhanced Deep Link Logging
**File**: `desktop-client/src/context/AuthContext.tsx`

Added comprehensive logging to the deep link handler:
```typescript
console.log('[Auth] Received external auth token via deep link');
console.log('[Auth] Token length:', token?.length || 0);
console.log('[Auth] Current loading state:', useAuthStore.getState().isLoading);
console.log('[Auth] Current user:', useAuthStore.getState().currentUser?.email || 'none');
```

This helps debug OAuth flow issues by showing exactly when tokens are received.

### 3. Main Process Deep Link Logging
**File**: `desktop-client/electron/main.ts`

Enhanced the `handleDeepLink` function with detailed logging:
```typescript
console.log('[DeepLink] Protocol:', parsedUrl.protocol);
console.log('[DeepLink] Hostname:', parsedUrl.hostname);
console.log('[DeepLink] Token found:', token ? `yes (${token.length} chars)` : 'no');
console.log('[DeepLink] Sending token to renderer via IPC');
```

### 4. Command Line Argument Handling
**File**: `desktop-client/electron/main.ts`

Added deep link handling from command line arguments in `app.whenReady()`:
```typescript
// Handle deep link from command line args (Windows/Linux)
console.log('[DeepLink] Checking command line args:', process.argv);
const deepLinkUrl = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
if (deepLinkUrl) {
  console.log('[DeepLink] Found deep link in command line args:', deepLinkUrl);
  // Wait for window to be ready before handling deep link
  setTimeout(() => handleDeepLink(deepLinkUrl), 1000);
}
```

This ensures that when the OAuth callback opens `teledesk://auth?token=...`, the already-running app will process it.

## How It Works Now

### OAuth Flow
1. User clicks "Continue with Google"
2. App sets loading state and opens system browser with OAuth URL
3. User authenticates with Google
4. Backend receives OAuth callback and generates custom Firebase token
5. Backend redirects to `teledesk://auth?token=<custom_token>`
6. Windows opens the deep link:
   - If app not running: Starts app with URL in `process.argv`
   - If app running: Passes URL via command line args
7. App's `handleDeepLink` function:
   - Parses the URL
   - Extracts the token
   - Sends token to renderer via IPC
   - Shows and focuses the window
8. Renderer's deep link handler:
   - Receives token via IPC
   - Calls `signInWithCustomToken(token)`
   - Firebase auth state changes
   - `onAuthChange` handler completes login
   - Loading state cleared, user logged in

### Timeout Safety
- If the deep link callback doesn't arrive within 60 seconds:
  - Loading state is automatically cleared
  - Error message shown: "Authentication timed out. Please try again."
  - User can retry the login

## Testing Instructions

### Development Testing
1. Start the backend server:
   ```bash
   cd backend-server
   npm run dev
   ```

2. Start the desktop client:
   ```bash
   cd desktop-client
   npx tsc -p tsconfig.electron.json ; npm run electron:dev
   ```

3. Click "Continue with Google"
4. Check console logs for deep link messages
5. Complete Google authentication in browser
6. Verify app receives token and logs in

### Production Testing
1. Build the app:
   ```bash
   cd desktop-client
   npm run build
   ```

2. Run the compiled exe
3. Test Google OAuth login
4. Check if authentication completes successfully

### What to Look For in Logs

**Successful Flow:**
```
[Auth] Setting up deep link listener for external OAuth tokens
[DeepLink] Checking command line args: [...]
[DeepLink] Received URL: teledesk://auth?token=...
[DeepLink] Protocol: teledesk:
[DeepLink] Hostname: auth
[DeepLink] Token found: yes (XXX chars)
[DeepLink] Sending token to renderer via IPC
[Auth] Received external auth token via deep link
[Auth] Token length: XXX
[Auth] Firebase sign-in finished in XXXms
[Firebase] Auth state changed: User logged in
```

**Failed Flow (timeout):**
```
[Auth] Google OAuth timeout - clearing loading state
```

## Backend Requirements

The backend OAuth callback must redirect to the deep link URL:
```typescript
const redirectUrl = `teledesk://auth?token=${customToken}`;
res.send(`
  <script>
    window.location.href = "${redirectUrl}";
  </script>
`);
```

This is already implemented in `backend-server/src/controllers/desktopAuthController.ts`.

## Known Limitations

1. **60-second timeout**: If the OAuth flow takes longer than 60 seconds, the loading state will clear. Users can retry.

2. **Multiple instances**: Each instance handles its own deep links. The OAuth callback will open in whichever instance the OS chooses (usually the most recently focused one).

3. **Browser dependency**: The OAuth flow requires the system default browser to be functional.

## Troubleshooting

### Issue: "Authentication timed out"
- Check if backend is running and accessible
- Verify backend OAuth routes are working
- Check if deep link protocol is registered (should happen automatically)
- Look for errors in backend logs

### Issue: Browser opens but nothing happens
- Check backend logs for OAuth callback errors
- Verify the redirect URL is correct: `teledesk://auth?token=...`
- Check if Windows is opening the deep link (should see in app logs)

### Issue: Token received but login fails
- Check Firebase configuration in backend
- Verify custom token generation is working
- Look for Firebase errors in app console

## Files Modified
- `desktop-client/src/context/AuthContext.tsx` - Added timeout and enhanced logging
- `desktop-client/electron/main.ts` - Added command line arg handling and enhanced logging
