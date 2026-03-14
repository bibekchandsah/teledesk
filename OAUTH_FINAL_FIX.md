# OAuth Final Fix - Force Account Selection

## Changes Made

### 1. Force Account Selection (firebaseService.ts)
```typescript
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
```
This prevents Firebase from auto-logging into the previous account and forces the account picker to show.

### 2. Disable Web Security for Auth Popups (main.ts)
```typescript
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: false,        // Disable sandbox for auth
  webSecurity: false,    // Disable CORS restrictions
  partition: 'persist:auth', // Separate session
}
```
This bypasses CORS restrictions that were blocking the popup.

### 3. Configure Auth Session (main.ts)
Added CORS header removal for both default and auth sessions to strip restrictive headers.

## How to Test

1. Rebuild the app:
   ```bash
   cd desktop-client
   npm run build
   ```

2. Run the app

3. Click "Continue with Google"

4. You should see:
   - Popup opens
   - Google account selection screen appears
   - Select an account
   - Popup closes
   - You're logged in

## Expected Behavior

- ✅ Popup opens within Electron
- ✅ Shows account selection screen (not auto-login)
- ✅ No CORS errors in console
- ✅ Popup closes after selection
- ✅ User is logged into the app

## If It Still Doesn't Work

If you still see issues, try:

1. **Clear all caches**:
   - Delete `%APPDATA%/TeleDesk` (Windows)
   - Delete `~/Library/Application Support/TeleDesk` (Mac)

2. **Sign out of Google in your browser** to test with a fresh state

3. **Check if you're in dev mode**: The fix works best in production build. In dev mode with Vite, some CORS restrictions may still apply.

4. **Try production build**:
   ```bash
   npm run build
   npm run electron:build
   ```

## Why This Works

- `prompt: 'select_account'` forces Google to show the account picker
- `webSecurity: false` disables CORS checks in the auth popup
- `partition: 'persist:auth'` isolates auth cookies from main session
- Header removal strips COOP/COEP headers that block window.close()

## Files Modified

- `desktop-client/src/services/firebaseService.ts` - Added prompt parameter
- `desktop-client/electron/main.ts` - Disabled web security for auth popups, added auth session configuration
