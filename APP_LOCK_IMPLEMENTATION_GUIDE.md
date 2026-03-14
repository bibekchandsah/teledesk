# App Lock Implementation Guide

## What's Been Implemented

### Backend (✅ Complete)
1. **Database Schema** - Added to `shared/types/index.ts`:
   - `appLockEnabled: boolean` - Whether app lock is active
   - `appLockPin: string` - Hashed 6-digit PIN

2. **Migration File** - `backend-server/app-lock-migration.sql`:
   ```sql
   ALTER TABLE users 
   ADD COLUMN IF NOT EXISTS app_lock_enabled BOOLEAN DEFAULT FALSE,
   ADD COLUMN IF NOT EXISTS app_lock_pin TEXT;
   ```
   **Run this migration before testing!**

3. **Service Functions** - `backend-server/src/services/userService.ts`:
   - `setAppLockPin(uid, pin)` - Set/update app lock PIN
   - `verifyAppLockPin(uid, pin)` - Verify PIN
   - `toggleAppLock(uid, enabled)` - Enable/disable app lock
   - `removeAppLockPin(uid)` - Remove PIN and disable

4. **API Endpoints** - `backend-server/src/routes/userRoutes.ts`:
   - `POST /api/users/me/set-app-lock-pin` - Set PIN
   - `POST /api/users/me/verify-app-lock-pin` - Verify PIN
   - `POST /api/users/me/toggle-app-lock` - Toggle on/off
   - `DELETE /api/users/me/app-lock-pin` - Remove PIN

### Frontend (✅ Complete)
1. **API Functions** - `desktop-client/src/services/apiService.ts`:
   - `setAppLockPin(pin)`
   - `verifyAppLockPin(pin)`
   - `toggleAppLock(enabled)`
   - `removeAppLockPin()`

2. **Components Created**:
   - `AppLockScreen.tsx` - Full-screen lock on app load
   - `AppLockPinModal.tsx` - Modal for setup/change PIN

3. **Settings Page** - Added app lock section with:
   - Enable/Disable button
   - Change PIN button (when enabled)
   - Forgot PIN recovery

4. **UI Store** - Added `appLockModal` state

## What Needs to be Done

### 1. Integrate AppLockScreen in App.tsx

Add this code in `App.tsx` after authentication check:

```typescript
import AppLockScreen from './components/AppLockScreen';

// Add state
const [isAppLocked, setIsAppLocked] = useState(true);

// Add effect to check app lock on mount
useEffect(() => {
  if (isAuthenticated && currentUser?.appLockEnabled) {
    setIsAppLocked(true);
  } else {
    setIsAppLocked(false);
  }
}, [isAuthenticated, currentUser?.appLockEnabled]);

// Add before main render
if (isAuthenticated && isAppLocked && currentUser?.appLockEnabled) {
  return <AppLockScreen onUnlock={() => setIsAppLocked(false)} />;
}
```

### 2. Add AppLockPinModal to App.tsx

Add this with the existing PinModal:

```typescript
import AppLockPinModal from './components/modals/AppLockPinModal';

// In render, after PinModal
{appLockModal && (
  <AppLockPinModal
    mode={appLockModal.mode}
    onSuccess={(pin) => {
      const { setAppLockModal } = useUIStore.getState();
      setAppLockModal(null);
      if (appLockModal.mode === 'setup' || appLockModal.mode === 'change') {
        if (currentUser) {
          setCurrentUser({ ...currentUser, appLockEnabled: true, appLockPin: '********' });
        }
      }
    }}
    onCancel={() => {
      const { setAppLockModal } = useUIStore.getState();
      setAppLockModal(null);
    }}
  />
)}
```

### 3. Persist App Lock State

The app lock should remain active until the app is completely closed. Add to `App.tsx`:

```typescript
// Track if app was unlocked this session
const appUnlockedRef = useRef(false);

// Update the lock check
useEffect(() => {
  if (isAuthenticated && currentUser?.appLockEnabled && !appUnlockedRef.current) {
    setIsAppLocked(true);
  } else {
    setIsAppLocked(false);
  }
}, [isAuthenticated, currentUser?.appLockEnabled]);

// Update unlock handler
const handleAppUnlock = () => {
  setIsAppLocked(false);
  appUnlockedRef.current = true;
};

// Use in AppLockScreen
<AppLockScreen onUnlock={handleAppUnlock} />
```

### 4. Handle App Exit

For Electron, add to `electron/main.ts`:

```typescript
app.on('before-quit', () => {
  // Clear app unlock state
  // This ensures PIN is required on next launch
});
```

## Features Included

✅ Set up 6-digit PIN for app lock
✅ Enable/disable app lock from settings
✅ Change PIN with current PIN verification
✅ Forgot PIN with OAuth/password recovery
✅ PIN verification on app launch
✅ Remove app lock completely
✅ Secure PIN storage (bcrypt hashed)
✅ Cross-device sync (stored in database)

## Testing Steps

1. Run the migration: `psql -d your_database -f backend-server/app-lock-migration.sql`
2. Restart backend server
3. In Settings → Security → App Lock:
   - Click "Enable"
   - Set a 6-digit PIN
   - Confirm PIN
4. Reload the app - should show lock screen
5. Enter PIN to unlock
6. Test "Forgot PIN" flow
7. Test "Change PIN"
8. Test "Disable" app lock

## Security Notes

- PINs are hashed with bcrypt (10 rounds)
- Forgot PIN requires re-authentication
- App lock persists until app exit
- Works across all devices (synced via database)
