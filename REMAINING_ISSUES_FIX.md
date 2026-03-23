# Remaining Issues to Fix

## ✅ FIXED: Google OAuth Login
The OAuth login is now working! The HTTP callback server successfully receives the token and authenticates the user.

## 🔧 Issue 1: Profile Picture Not Showing

### Symptoms
- User logs in successfully
- Profile picture doesn't display

### Possible Causes
1. **CORS issue** - Google profile images might be blocked by CORS
2. **Avatar URL not saved** - The avatar URL from Google might not be saved to the database
3. **Image loading error** - The image URL might be invalid or expired

### Debug Steps
1. Open DevTools Console
2. Look for image loading errors
3. Check Network tab for failed image requests
4. Check if avatar URL is in the user object: `console.log(currentUser.avatar)`

### Likely Fix
The avatar URL is probably being saved correctly, but there might be a CORS issue. Check if the image URL starts with `https://lh3.googleusercontent.com/` (Google's CDN).

If it's a CORS issue, we can:
1. Proxy the image through our backend
2. Use a CORS proxy
3. Download and re-upload to our own storage (R2)

## 🔧 Issue 2: Account Switching Redirects to Same Account

### Symptoms
- Click to switch to Account B
- Page reloads
- Still logged into Account A

### Root Cause
After calling `switchToAccount()` and reloading, the AuthContext initialization is not properly reading the `activeAccountUid` from storage. It might be:
1. Reading the old active account
2. Not waiting for storage to update before reload
3. The reload happening too fast before storage is written

### Current Flow
1. User clicks switch account
2. `switchToAccount()` is called
3. Sets active account in storage
4. Sets cached token
5. Calls `window.location.reload()`
6. **Problem**: AuthContext initializes and might not see the updated active account

### Fix Needed
The issue is in `AccountSwitcher.tsx` line 68-70:
```typescript
await switchToAccount(account);
setActiveAccount(uid);
await new Promise(resolve => setTimeout(resolve, 500));
```

The `setActiveAccount(uid)` is setting it in Zustand store, but we need to make sure it's also set in the multi-account storage BEFORE reload.

Let me check if `switchToAccount` is properly setting the active account...

Looking at `multiAccountService.ts`, it calls:
```typescript
await multiAccountAuthService.setActiveAccount(targetAccount.uid);
```

This should work, but the 500ms delay might not be enough. Let's increase it and add verification.

## Fixes to Apply

### Fix 1: Increase delay before reload
In `AccountSwitcher.tsx`, change:
```typescript
await new Promise(resolve => setTimeout(resolve, 500));
```
to:
```typescript
await new Promise(resolve => setTimeout(resolve, 1000));
```

### Fix 2: Verify storage before reload
Add verification that the storage was actually updated:
```typescript
// Verify the active account was set
const verification = await multiAccountAuthService.getActiveAccount();
if (verification?.uid !== uid) {
  throw new Error('Failed to set active account');
}
```

### Fix 3: Add logging to debug
Add console logs to see what's happening:
```typescript
console.log('[AccountSwitcher] Before switch - active:', activeAccountUid);
await switchToAccount(account);
console.log('[AccountSwitcher] After switchToAccount');
setActiveAccount(uid);
console.log('[AccountSwitcher] After setActiveAccount');
await new Promise(resolve => setTimeout(resolve, 1000));
console.log('[AccountSwitcher] About to reload');
```

Then after reload, check AuthContext logs to see which account it's restoring.

## Testing Steps

### Test Profile Picture
1. Log in with Google
2. Open DevTools Console
3. Type: `useAuthStore.getState().currentUser`
4. Check if `avatar` field has a URL
5. Try opening that URL in a new tab
6. If it loads, the issue is CORS
7. If it doesn't load, the URL is invalid

### Test Account Switching
1. Log in with Account A
2. Add Account B
3. Open DevTools Console
4. Before switching, type: `await window.electronAPI.loadMultiAccounts()`
5. Note the `activeAccountUid`
6. Click to switch to Account B
7. Watch console logs
8. After reload, type: `await window.electronAPI.loadMultiAccounts()` again
9. Check if `activeAccountUid` changed

## Quick Workaround

If account switching doesn't work, users can:
1. Click "Add Account" instead
2. Log in with the account they want to switch to
3. The new account will become active

This is not ideal but works as a temporary solution.
