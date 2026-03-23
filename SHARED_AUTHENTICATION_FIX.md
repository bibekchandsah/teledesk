# Shared Authentication Fix for Multiple Instances ✅

## Problem

When running multiple instances of the desktop app, each instance required separate login even though they should share authentication state. The first instance would be logged in, but the second instance would show the login screen.

## Root Cause

The previous approach using Electron session partitions (`persist:shared`) didn't actually share localStorage/sessionStorage data between instances. Each instance still had isolated authentication storage, causing the authentication state to not persist across instances.

## Solution

Implemented a **file-based shared authentication system** using IPC communication between the main process and renderer processes:

### 1. Shared Authentication Service
Created `sharedAuthService.ts` that:
- Communicates with main process via IPC
- Listens for auth updates from other instances
- Provides methods to save/load/clear shared auth data

### 2. Main Process IPC Handlers
Added IPC handlers in `main.ts` that:
- Store auth data in `shared/shared-auth.json` file
- Broadcast auth updates to all instances
- Handle auth data persistence across app restarts

### 3. AuthContext Integration
Updated `AuthContext.tsx` to:
- Load shared auth data on startup
- Save auth data to shared storage on login
- Listen for auth updates from other instances
- Clear shared storage on logout

## Technical Implementation

### File Structure
```
AppData/Roaming/teledesk-desktop/
├── shared/
│   ├── shared-auth.json        # Authentication data (shared)
│   └── window-state.json       # Window settings (shared)
└── instances/
    ├── abc123/                 # Instance 1 cache (isolated)
    ├── def456/                 # Instance 2 cache (isolated)
    └── ghi789/                 # Instance 3 cache (isolated)
```

### Shared Auth Data Format
```typescript
interface SharedAuthData {
  firebaseUser: {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string;
    accessToken: string;
  } | null;
  currentUser: User | null;
  isAuthenticated: boolean;
  lastUpdated: string;
}
```

### IPC Communication Flow

#### Login Process
1. User logs in on Instance A
2. AuthContext calls `sharedAuthService.saveAuthData()`
3. Service sends IPC message to main process
4. Main process saves to `shared/shared-auth.json`
5. Main process broadcasts update to all other instances
6. Instance B receives update and automatically logs in

#### Startup Process
1. Instance starts up
2. AuthContext calls `sharedAuthService.loadAuthData()`
3. Service requests data from main process via IPC
4. Main process reads `shared/shared-auth.json`
5. Instance receives auth data and automatically logs in

#### Logout Process
1. User logs out on Instance A
2. AuthContext calls `sharedAuthService.clearAuthData()`
3. Service sends IPC message to main process
4. Main process deletes `shared/shared-auth.json`
5. Main process broadcasts logout to all other instances
6. All instances automatically log out

## Code Changes

### 1. New Files
- `src/services/sharedAuthService.ts` - Shared auth service
- `shared/shared-auth.json` - Auth data storage (created at runtime)

### 2. Modified Files
- `electron/main.ts` - Added IPC handlers for shared auth
- `electron/preload.ts` - Exposed shared auth IPC methods
- `src/context/AuthContext.tsx` - Integrated shared auth service
- `src/services/firebaseService.ts` - Added Firebase persistence
- `src/store/authStore.ts` - Added Zustand persistence

### 3. IPC Methods Added
```typescript
// Preload API
window.electronAPI.saveSharedAuth(authData)
window.electronAPI.loadSharedAuth()
window.electronAPI.clearSharedAuth()
window.electronAPI.onSharedAuthUpdate(callback)

// Main Process Handlers
ipcMain.handle('save-shared-auth', ...)
ipcMain.handle('load-shared-auth', ...)
ipcMain.handle('clear-shared-auth', ...)
// Broadcasts: 'shared-auth-update'
```

## User Experience

### Before Fix
1. ❌ Login on Instance 1
2. ❌ Start Instance 2 → Shows login screen
3. ❌ Must login again on Instance 2
4. ❌ Logout on Instance 1 → Instance 2 stays logged in

### After Fix
1. ✅ Login on Instance 1
2. ✅ Start Instance 2 → **Automatically logged in**
3. ✅ Both instances share same authentication
4. ✅ Logout on Instance 1 → **Instance 2 automatically logs out**
5. ✅ Restart any instance → **Still logged in**

## Multiple Instance Scenarios

### Scenario 1: Login Sharing
- Instance A: User logs in with Google
- Instance B: Automatically receives auth and shows chats
- Instance C: Also automatically logged in

### Scenario 2: Account Switching
- Instance A: Switch to different account
- Instance B & C: Automatically switch to same account
- All instances stay synchronized

### Scenario 3: Logout Propagation
- Instance A: User logs out
- Instance B & C: Automatically log out
- All instances show login screen

### Scenario 4: App Restart
- Close all instances
- Start any instance → Automatically logged in
- Authentication persists across restarts

## Benefits

✅ **Seamless multi-instance experience**: Login once, use everywhere
✅ **Real-time synchronization**: Auth changes propagate instantly
✅ **Persistent authentication**: Login survives app restarts
✅ **Account switching support**: Switch accounts across all instances
✅ **Proper logout handling**: Logout affects all instances
✅ **No cache conflicts**: Each instance still has isolated cache
✅ **Backward compatibility**: Single instance usage unchanged

## Testing

### Test Authentication Sharing
1. Start Instance 1: `npm run electron:dev`
2. Login with credentials
3. Start Instance 2: `npm run electron:dev` (new terminal)
4. ✅ Instance 2 should automatically show chats (logged in)

### Test Account Switching
1. Have multiple accounts in account switcher
2. Switch account in Instance 1
3. ✅ Instance 2 should automatically switch to same account

### Test Logout Propagation
1. Have both instances logged in
2. Logout from Instance 1
3. ✅ Instance 2 should automatically show login screen

### Test Persistence
1. Login to any instance
2. Close all instances
3. Start any instance
4. ✅ Should automatically be logged in

## File Locations

### Shared Data (Synchronized)
```
%APPDATA%\teledesk-desktop\shared\
├── shared-auth.json           # Authentication tokens & user data
└── window-state.json          # Window position & settings
```

### Instance Data (Isolated)
```
%APPDATA%\teledesk-desktop\instances\
├── {instanceId1}\             # Instance 1 cache & temp files
├── {instanceId2}\             # Instance 2 cache & temp files
└── {instanceId3}\             # Instance 3 cache & temp files
```

## Troubleshooting

### Authentication not sharing between instances?
1. Check console for shared auth messages:
   ```
   [SharedAuth] Restoring authentication from shared storage
   [SharedAuth] Received auth update from another instance
   ```
2. Verify shared auth file exists:
   ```
   %APPDATA%\teledesk-desktop\shared\shared-auth.json
   ```
3. Check file permissions on shared directory

### Instance not receiving auth updates?
1. Verify IPC communication in console
2. Check if main process is broadcasting updates
3. Restart both instances to reset IPC connections

### Auth data corrupted?
1. Delete shared auth file:
   ```
   del "%APPDATA%\teledesk-desktop\shared\shared-auth.json"
   ```
2. Restart instances and login fresh

### Still showing login screen after restart?
1. Check if shared auth file contains valid data
2. Verify Firebase persistence is working
3. Check console for auth loading errors

## Security Considerations

### File Permissions
- Shared auth file is stored in user's AppData directory
- Only accessible by the current user account
- No additional encryption needed (same security as localStorage)

### Token Management
- Firebase access tokens are stored (short-lived, auto-refresh)
- No long-term secrets stored in shared file
- Tokens expire and refresh automatically

### Multi-User Systems
- Each Windows user gets their own shared auth file
- No cross-user authentication sharing
- Maintains user isolation on shared computers

## Summary

The shared authentication system provides a seamless multi-instance experience while maintaining security and performance. Users can now:

- **Login once, use everywhere** - Authentication automatically shared
- **Switch accounts globally** - Account changes sync across instances  
- **Logout from anywhere** - Logout affects all instances
- **Restart without re-login** - Authentication persists across sessions
- **Run unlimited instances** - Each with shared auth but isolated cache

This creates a professional multi-instance experience similar to VS Code or modern browsers, where authentication is shared but each window operates independently.

**Result**: Perfect multi-instance authentication sharing! ✅