# Multi-Account Feature - Troubleshooting Guide

## Issue: Clicking + icon logs back into same account

### Problem
When clicking the + icon to add another account, the user is redirected to the login page but automatically logs back into the same account instead of allowing them to add a different account.

### Root Cause
Firebase keeps the user authenticated in the browser. When redirecting to the login page without logging out first, Firebase's `onAuthStateChanged` listener detects the existing session and automatically logs the user back in.

### Solution ✅ FIXED
The `handleAddAccount` function now logs out the current user before redirecting to the login page:

```typescript
const handleAddAccount = async () => {
  if (addingAccount) return; // Prevent multiple clicks
  
  setAddingAccount(true);
  try {
    // Log out current user first so they can add a different account
    await logout(true); // true = switching account, keeps account list
    
    // Navigate to login page with add account flag
    window.location.href = '/login?add=true';
  } catch (error) {
    console.error('Failed to logout for adding account:', error);
    setAddingAccount(false);
    // Still redirect even if logout fails
    window.location.href = '/login?add=true';
  }
};
```

### What Changed
1. ✅ Added `await logout(true)` before redirecting
2. ✅ Added `addingAccount` state to prevent multiple clicks
3. ✅ Added loading state (opacity 0.6) while logging out
4. ✅ Disabled button during logout process

### How It Works Now
1. User clicks + icon
2. Button becomes disabled and slightly transparent
3. Current user is logged out (but account list is preserved)
4. User is redirected to login page
5. User can now login with a different account
6. New account is added to the list

## Other Common Issues

### Issue: Accounts not persisting after refresh
**Solution**: Check browser localStorage for `multi-account-storage` key. If it's missing, the zustand persist middleware might not be working.

### Issue: Can't switch between accounts
**Solution**: Make sure the `logout` function in AuthContext accepts a `switchingAccount` parameter and doesn't clear the multi-account store when it's true.

### Issue: Dropdown not appearing
**Solution**: 
- Check that you have at least 2 accounts added
- Verify the ^ icon is showing (not + icon)
- Check browser console for errors

### Issue: Icon not showing on profile
**Solution**: 
- Verify AccountSwitcher is imported in App.tsx
- Check that it's placed inside the profile NavLink with `position: 'relative'`
- Verify the profile NavLink has `position: 'relative'` style

### Issue: Same account appears multiple times
**Solution**: The `addAccount` function in multiAccountStore checks for duplicates by UID. If you see duplicates, check that the UID is being set correctly.

## Testing Checklist

After the fix, test these scenarios:

### Test 1: Add Second Account
- [ ] Login with first account
- [ ] See + icon on profile
- [ ] Click + icon
- [ ] Verify you're logged out
- [ ] Verify login page appears
- [ ] Login with DIFFERENT credentials
- [ ] Verify second account is added
- [ ] Verify ^ icon replaces +

### Test 2: Add Third Account
- [ ] Click ^ icon
- [ ] Click "Add account" in dropdown
- [ ] Verify you're logged out
- [ ] Login with third account
- [ ] Verify all three accounts appear in dropdown

### Test 3: Switch Between Accounts
- [ ] Click ^ icon
- [ ] Click on different account
- [ ] Verify logout happens
- [ ] Login with that account's credentials
- [ ] Verify switched successfully

## Debug Mode

To debug account switching issues, add this to your browser console:

```javascript
// Check stored accounts
console.log(localStorage.getItem('multi-account-storage'));

// Check current auth state
console.log(firebase.auth().currentUser);

// Watch for auth state changes
firebase.auth().onAuthStateChanged(user => {
  console.log('Auth state changed:', user?.email || 'logged out');
});
```

## Need More Help?

1. Check browser console for errors
2. Verify Firebase auth is configured correctly
3. Check that all files are saved
4. Try clearing browser cache and localStorage
5. Test in incognito mode to rule out cache issues

## Contact

If issues persist, check:
- `desktop-client/src/components/AccountSwitcher.tsx` - Main component
- `desktop-client/src/context/AuthContext.tsx` - Auth logic
- `desktop-client/src/store/multiAccountStore.ts` - State management
