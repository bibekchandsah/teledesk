# OAuth CORS Fix for Electron

## Problem
When clicking "Continue with Google" in the Electron app, the OAuth popup was showing this error:
```
Cross-Origin-Opener-Policy policy would block the window.close call
```

This prevented the popup from closing automatically after authentication, causing the app to reload and log back into the previous account.

## Root Cause
Firebase's OAuth pages set restrictive CORS headers (`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`) that prevent the popup window from communicating with the parent window and closing itself.

## Solution
Added a webRequest interceptor in Electron's main process to remove these restrictive headers:

```typescript
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  const responseHeaders = { ...details.responseHeaders };
  
  // Remove restrictive COOP/COEP headers that block OAuth popups
  delete responseHeaders['cross-origin-opener-policy'];
  delete responseHeaders['cross-origin-embedder-policy'];
  
  callback({ responseHeaders });
});
```

## How It Works Now

1. Click "Continue with Google"
2. A popup window opens within Electron
3. Select your Google account and authorize
4. The popup closes automatically
5. You're logged into the app

## Files Modified

- `desktop-client/electron/main.ts`:
  - Added CORS header removal in `app.whenReady()`
  - Added GitHub URL to auth popup whitelist
  - Enabled sandbox and webSecurity for auth popups

## Testing

1. Rebuild the Electron app: `npm run build` (in desktop-client folder)
2. Run the app
3. Click "Continue with Google"
4. The popup should open, let you select an account, and close automatically
5. You should be logged in

## Why Not System Browser?

While VS Code does use the system browser for OAuth, it requires:
- Custom protocol handlers (`vscode://`)
- OAuth client credentials separate from Firebase
- Complex token exchange flow
- Platform-specific implementations

The popup approach is:
- Simpler and more reliable
- Works with Firebase out of the box
- Standard for most Electron apps
- Secure (stays within the app's controlled environment)

## Alternative: If Popup Still Doesn't Work

If the popup approach still has issues, you can implement system browser OAuth, but it requires:

1. Register a custom protocol (e.g., `teledesk://`)
2. Get OAuth client credentials from Google/GitHub
3. Implement a local HTTP server to capture callbacks
4. Handle the OAuth code exchange
5. Sign in with the resulting tokens

This is significantly more complex and requires additional setup in Google Cloud Console and GitHub OAuth Apps.

## Troubleshooting

If OAuth still doesn't work:

1. **Clear Electron cache**: Delete `%APPDATA%/TeleDesk` (Windows) or `~/Library/Application Support/TeleDesk` (Mac)
2. **Check console**: Look for any Firebase errors
3. **Verify Firebase config**: Ensure API keys are correct in `.env`
4. **Try incognito**: Test with a fresh Google account
5. **Check network**: Ensure you can reach `accounts.google.com`

## Console Logs

After the fix, you should see:
- No CORS errors
- Popup opens and closes smoothly
- User is logged in successfully

Before the fix, you saw:
- `Cross-Origin-Opener-Policy policy would block the window.close call`
- Popup stayed open
- App reloaded to previous account
