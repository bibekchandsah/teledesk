# Deep Link Test Instructions

## Step 1: Start the App
```bash
cd desktop-client
npx tsc -p tsconfig.electron.json ; npm run electron:dev
```

## Step 2: Test Deep Link Manually

While the app is running, open your browser and navigate to:
```
teledesk://auth?token=test123
```

### What Should Happen:
1. Windows should ask which app to open the link with (first time only)
2. Select TeleDesk
3. The app should come to focus
4. Check the console - you should see:
```
[DeepLink] Received URL: teledesk://auth?token=test123
[DeepLink] Protocol: teledesk:
[DeepLink] Hostname: auth
[DeepLink] Token found: yes (7 chars)
[DeepLink] Sending token to renderer via IPC
[Auth] Received external auth token via deep link
[Auth] Token length: 7
```

### If Nothing Happens:
The deep link protocol is not registered. This is the root cause.

## Step 3: Check Protocol Registration

### On Windows:
1. Press Win+R
2. Type `regedit` and press Enter
3. Navigate to: `HKEY_CLASSES_ROOT\teledesk`
4. Check if it exists

### If Not Registered:
The protocol should be registered automatically when the app starts. Check if you see this in the console:
```
[Main] Loaded .env from: ...
```

## Step 4: Try Google OAuth

1. Click "Continue with Google"
2. Watch the console for:
   - `[Auth] Setting up deep link listener`
   - Browser should open
3. Complete Google authentication
4. Browser should show "Authentication Successful!"
5. Browser tries to redirect to `teledesk://auth?token=...`
6. Check console for deep link messages

## Common Issues

### Issue 1: Protocol Not Registered
**Symptom**: Browser shows "This site can't be reached" or "Unknown protocol"
**Solution**: 
- Close the app completely
- Restart it
- The protocol should register on startup

### Issue 2: Deep Link Opens New Instance
**Symptom**: Clicking the deep link opens a new app window
**Solution**: This is expected with multiple instances enabled. The new instance should receive the token.

### Issue 3: No Console Messages
**Symptom**: No `[DeepLink]` messages in console
**Solution**: 
- Check if you're looking at the right console (Electron main process, not renderer)
- In dev mode, the main process logs appear in the terminal where you ran `npm run electron:dev`

### Issue 4: Token Received But Login Fails
**Symptom**: See `[Auth] Received external auth token` but login doesn't complete
**Solution**: 
- Check if Firebase is configured correctly
- Verify the custom token is valid
- Look for Firebase errors in console

## Debug Mode

To see all logs, add this to the top of `main.ts`:
```typescript
console.log('[Main] Starting app...');
console.log('[Main] Process args:', process.argv);
console.log('[Main] Protocol:', PROTOCOL);
```

And in `AuthContext.tsx`, add:
```typescript
console.log('[Auth] electronAPI available:', !!window.electronAPI);
console.log('[Auth] onAuthExternalToken available:', !!window.electronAPI?.onAuthExternalToken);
```
