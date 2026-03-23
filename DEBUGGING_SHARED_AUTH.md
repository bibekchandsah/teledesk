# Debugging Shared Authentication

## How to Test and Debug

### 1. Test Single Instance Persistence
1. Start app: `npx tsc -p tsconfig.electron.json; npm run electron:dev`
2. Login with your credentials
3. **Open Developer Tools** (F12 or Ctrl+Shift+I)
4. Check console for these messages:
   ```
   [SharedAuthService] Initializing service...
   [SharedAuthService] electronAPI available, setting up IPC listeners...
   [Auth] Saving shared auth data: {firebaseUser: {...}, currentUser: {...}}
   [SharedAuthService] Saving auth data: {...}
   [SharedAuthService] Save result: true
   ```
5. Close the app completely
6. Restart: `npx tsc -p tsconfig.electron.json; npm run electron:dev`
7. **Check console immediately** for:
   ```
   [SharedAuth] Initializing shared auth service...
   [SharedAuthService] Loading auth data...
   [SharedAuthService] Load result: {firebaseUser: {...}, currentUser: {...}}
   [SharedAuth] Restoring authentication from shared storage
   ```

### 2. Test Multiple Instance Sharing
1. Start first instance: `npx tsc -p tsconfig.electron.json; npm run electron:dev`
2. Login and check console for save messages
3. **In a NEW terminal**, start second instance: `npx tsc -p tsconfig.electron.json; npm run electron:dev`
4. **Check second instance console** for:
   ```
   [SharedAuth] Initializing shared auth service...
   [SharedAuthService] Loading auth data...
   [SharedAuthService] Load result: {firebaseUser: {...}, currentUser: {...}}
   [SharedAuth] Restoring authentication from shared storage
   ```

### 3. Check File System
The shared auth file should be created at:
```
%APPDATA%\teledesk-desktop\shared\shared-auth.json
```

You can check if it exists:
```bash
# Windows Command Prompt
dir "%APPDATA%\teledesk-desktop\shared\"

# Windows PowerShell  
ls "$env:APPDATA\teledesk-desktop\shared\"
```

### 4. Common Issues to Look For

#### Issue 1: electronAPI not available
**Console shows:**
```
[SharedAuthService] electronAPI not available after waiting - running in web mode?
```
**Solution:** Make sure you're running the Electron app, not the web version

#### Issue 2: IPC handlers not working
**Console shows:**
```
[SharedAuthService] Save result: false
```
**Solution:** Check main process console for IPC errors

#### Issue 3: Shared auth file not created
**No shared-auth.json file exists**
**Solution:** Check file permissions and main process errors

#### Issue 4: Auth data not loading
**Console shows:**
```
[SharedAuthService] Load result: null
```
**Solution:** Check if file exists and contains valid JSON

### 5. Manual File Check
If the automatic system isn't working, you can manually check the shared auth file:

1. Navigate to: `%APPDATA%\teledesk-desktop\shared\`
2. Open `shared-auth.json` in a text editor
3. It should contain something like:
   ```json
   {
     "firebaseUser": {
       "uid": "...",
       "email": "...",
       "displayName": "...",
       "accessToken": "..."
     },
     "currentUser": {
       "uid": "...",
       "name": "...",
       "email": "...",
       "avatar": "..."
     },
     "isAuthenticated": true,
     "lastUpdated": "2024-03-23T..."
   }
   ```

### 6. Reset Everything
If nothing works, reset all data:

1. Close all instances
2. Delete the entire folder:
   ```bash
   rmdir /s /q "%APPDATA%\teledesk-desktop"
   ```
3. Start fresh and check console logs

### 7. What to Report
When reporting issues, please include:

1. **Console logs** from both instances (copy the full console output)
2. **File system check** - does the shared-auth.json file exist?
3. **File contents** - what's in the shared-auth.json file?
4. **Steps taken** - exactly what you did to reproduce the issue

### 8. Expected Behavior

#### First Login:
- Console shows auth data being saved
- File `shared-auth.json` is created
- App shows chats/dashboard

#### App Restart:
- Console shows auth data being loaded
- App automatically shows chats/dashboard (no login screen)

#### Second Instance:
- Console shows auth data being loaded
- App automatically shows chats/dashboard (no login screen)
- Both instances show same user

#### Logout:
- Console shows auth data being cleared
- File `shared-auth.json` is deleted
- All instances show login screen

## Quick Debug Commands

Open Developer Tools in the app and run these in the console:

```javascript
// Check if electronAPI is available
console.log('electronAPI available:', !!window.electronAPI);

// Manually load shared auth
window.electronAPI?.loadSharedAuth().then(data => console.log('Shared auth:', data));

// Check auth store state
console.log('Auth store state:', window.useAuthStore?.getState());
```

Let me know what you see in the console logs and I can help debug further!