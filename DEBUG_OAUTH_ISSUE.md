# Debug Google OAuth Issue - Step by Step

## Current Behavior
When you click "Continue with Google", what happens? Please check:
- [ ] Browser opens
- [ ] You can authenticate with Google
- [ ] Browser shows "Authentication Successful!"
- [ ] Browser tries to redirect to `teledesk://auth?token=...`
- [ ] App receives the token and logs in

## Step-by-Step Debugging

### Step 1: Start the App with Logging

```bash
cd desktop-client
npx tsc -p tsconfig.electron.json ; npm run electron:dev
```

**Look for these messages in the terminal (main process):**
```
[Main] Loaded .env from: ...
[DeepLink] Checking command line args: [...]
```

### Step 2: Check Deep Link Setup

In the app console (DevTools), you should see:
```
[Auth] Setting up deep link listener for external OAuth tokens
```

If you DON'T see this, the issue is in the renderer process setup.

### Step 3: Click "Continue with Google"

**Terminal should show:**
```
[IPC] Opening external URL: http://localhost:3001/api/auth/desktop/google
```

**Browser should:**
- Open Google OAuth page
- Let you sign in
- Redirect to backend callback
- Show "Authentication Successful!" page
- Try to redirect to `teledesk://auth?token=...`

### Step 4: What Happens Next?

This is where the issue likely is. One of these should happen:

**Option A: New app instance opens**
- A new TeleDesk window opens
- Terminal shows: `[DeepLink] Checking command line args: [..., 'teledesk://auth?token=...']`
- Terminal shows: `[DeepLink] Found deep link in command line args`
- New instance processes the token and logs in

**Option B: Existing instance receives token** (less likely with current setup)
- Existing window comes to focus
- Terminal shows: `[DeepLink] Received URL: teledesk://auth?token=...`
- Existing instance processes the token

**Option C: Nothing happens** (the problem)
- Browser shows "This site can't be reached"
- OR browser redirects but nothing happens
- No new instance opens
- No deep link messages in terminal

## Diagnostic Questions

Please answer these:

1. **What happens when you click "Continue with Google"?**
   - Does browser open? YES / NO
   - Can you authenticate? YES / NO
   - Do you see "Authentication Successful!"? YES / NO

2. **What does the browser address bar show after authentication?**
   - Copy the exact URL here: _______________

3. **What do you see in the terminal (main process)?**
   - Copy all `[DeepLink]` messages: _______________

4. **What do you see in the app console (DevTools)?**
   - Copy all `[Auth]` messages: _______________

5. **Does a new app window open after authentication?**
   - YES / NO
   - If YES, does it log in? YES / NO

## Manual Deep Link Test

While the app is running, open your browser and go to:
```
teledesk://auth?token=test123
```

**What happens?**
- [ ] Browser says "This site can't be reached"
- [ ] Browser asks which app to open
- [ ] A new TeleDesk window opens
- [ ] Existing TeleDesk window comes to focus
- [ ] Nothing happens

**Check terminal for:**
```
[DeepLink] Checking command line args: [..., 'teledesk://auth?token=test123']
[DeepLink] Found deep link in command line args: teledesk://auth?token=test123
```

## Common Issues and Solutions

### Issue 1: Protocol Not Registered
**Symptom**: Browser says "This site can't be reached" or "Unknown protocol: teledesk"

**Solution**:
The protocol should register automatically. Check if this code is in `main.ts`:
```typescript
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}
```

Try running the app as administrator once to register the protocol.

### Issue 2: Backend Not Sending Deep Link
**Symptom**: Browser shows "Authentication Successful!" but stays on that page

**Check backend logs** (`backend-server/logs/combined.log`):
```
Desktop Google Callback Error: ...
```

**Verify backend is sending the deep link**:
The response should include:
```html
<script>
  window.location.href = "teledesk://auth?token=...";
</script>
```

### Issue 3: Deep Link Opens But Token Not Processed
**Symptom**: New window opens but doesn't log in

**Check terminal for**:
```
[DeepLink] Found deep link in command line args: teledesk://auth?token=...
[DeepLink] Received URL: teledesk://auth?token=...
[DeepLink] Token found: yes (XXX chars)
[DeepLink] Sending token to renderer via IPC
```

**Check app console for**:
```
[Auth] Received external auth token via deep link
[Auth] Token length: XXX
[Auth] Firebase sign-in finished in XXXms
```

If you see the terminal messages but NOT the app console messages, the IPC communication is broken.

### Issue 4: Token Received But Login Fails
**Symptom**: See all the log messages but still not logged in

**Check for Firebase errors**:
```
[Auth] External token login failed: ...
```

This means the custom token is invalid or Firebase is misconfigured.

## Quick Fix Attempts

### Fix 1: Restart Everything
```bash
# Stop backend
# Stop desktop app
# Clear any cached data
cd desktop-client
rm -rf node_modules/.vite
npm run electron:dev
```

### Fix 2: Check Environment Variables
```bash
# In backend-server/.env.development
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
BACKEND_URL=http://localhost:3001

# In desktop-client/.env.development
VITE_BACKEND_URL=http://localhost:3001
VITE_FIREBASE_API_KEY=your_api_key
```

### Fix 3: Test Backend Directly
```bash
# Open browser and go to:
http://localhost:3001/api/auth/desktop/google

# Should redirect to Google OAuth
# After authentication, check what URL it redirects to
```

## Next Steps

Based on your answers to the diagnostic questions above, we can:
1. Fix protocol registration issues
2. Fix backend deep link generation
3. Fix IPC communication
4. Fix Firebase token processing

Please run through these steps and share:
1. Answers to the diagnostic questions
2. All console/terminal output
3. What happens at each step
