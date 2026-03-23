# Account Switch Token Expiry Fix

## Problem
When switching accounts, if the stored token was expired (>1 hour old), the error modal wasn't showing. Instead, users saw a blank screen with console errors showing 401 Unauthorized.

## Root Cause
The account switching flow was calling `logout(true)` BEFORE checking if the token was valid. This caused:
1. Firebase signout cleared the auth state
2. Component potentially unmounted or lost state
3. Error modal state was set but component couldn't render it
4. User saw blank screen instead of error message

## Solution
Reordered the account switching flow to check token validity FIRST:

### New Flow
1. Call `switchToAccount(account)` which validates the token via API call
2. **If token is expired**: 
   - Catch error
   - Show error modal (component still mounted)
   - User clicks "Continue to Login"
   - Redirect to login page
3. **If token is valid**:
   - Logout from Firebase to clear session
   - Set active account
   - Reload page with new account

### Changes Made

#### `desktop-client/src/components/AccountSwitcher.tsx`
- Moved `switchToAccount()` call BEFORE `logout()`
- Token validation happens first, preserving component state
- Only logout if token is valid and we're proceeding with switch
- Added debug logging to track error modal state

#### `desktop-client/src/components/modals/ErrorModal.tsx`
- Added debug logging to track when modal renders
- Helps verify modal is being called correctly

## Expected Behavior

### When Token is Valid
```
User clicks switch → Token validated → Firebase logout → Account switched → Page reloads
```

### When Token is Expired
```
User clicks switch → Token validation fails → Error modal shows → User clicks Continue → Redirects to login
```

## Testing
1. Login with Account A
2. Wait >1 hour (or manually expire token in storage)
3. Try to switch to Account B
4. Should see error modal: "Your session for this account has expired. You will be redirected to log in again."
5. Click "Continue to Login"
6. Should redirect to login page with account info preserved

## Technical Details

### Token Expiry
- Firebase custom tokens expire after 1 hour (security feature)
- This is expected behavior, not a bug
- Users must re-authenticate when tokens expire (like Gmail, etc.)

### Error Modal Z-Index
- Modal has `z-index: 9999` to appear above all content
- Backdrop has blur effect for better visibility
- Modal is rendered at root level of AccountSwitcher component

## Files Modified
- `desktop-client/src/components/AccountSwitcher.tsx`
- `desktop-client/src/components/modals/ErrorModal.tsx`
