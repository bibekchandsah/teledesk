# Multi-Account Feature Implementation

## Overview
This feature allows users to login with multiple accounts and switch between them without fully logging out. Each account maintains its own session, chat history, and settings.

## Architecture

### 1. Account Storage (`multiAccountStore.ts`)
- Uses Zustand with persistence to localStorage
- Stores account metadata: uid, email, name, avatar, lastUsed
- Tracks active account UID
- Provides actions: addAccount, removeAccount, setActiveAccount, updateAccount

### 2. Account Switcher UI (`AccountSwitcher.tsx`)
- Dropdown component showing all logged-in accounts
- Displays current user with avatar and name
- Allows switching between accounts
- Supports removing accounts
- "Add Account" button for adding new accounts

### 3. Quick Account Picker (`QuickAccountPicker.tsx`)
- Shows on login page when multiple accounts exist
- One-click login for previously used accounts
- "Use another account" option for new accounts

### 4. Auth Integration (`AuthContext.tsx`)
- Automatically stores account info when user logs in
- Updates multi-account store with latest profile data
- Supports logout with switching flag (preserves account list)

## User Flow

### Adding First Account
1. User navigates to login page
2. Selects login method (Google, GitHub, Email)
3. Completes authentication
4. Account is automatically added to multi-account store
5. User is logged in and can use the app

### Adding Additional Accounts
1. User clicks "Add Account" in AccountSwitcher dropdown
2. Redirects to login page with `?add=true` parameter
3. User selects login method for new account
4. New account is added to multi-account store
5. User is switched to new account

### Switching Between Accounts
1. User clicks AccountSwitcher dropdown
2. Selects different account from list
3. Current session is logged out (with switching flag)
4. Redirects to login page with `?switch=email` parameter
5. QuickAccountPicker shows, user clicks their account
6. User is logged in with selected account

### Removing an Account
1. User clicks AccountSwitcher dropdown
2. Clicks X button next to account to remove
3. Confirms removal
4. Account is removed from multi-account store
5. If removing active account, user is logged out

## Technical Details

### Session Management
- Each account has its own Firebase auth session
- Device sessions are tracked per account in backend
- Socket connections are re-established when switching accounts
- Chat history, settings, and encryption keys are account-specific

### Data Isolation
- Each account's data is stored separately in Supabase
- localStorage keys are prefixed with account UID where needed
- Zustand stores are cleared and repopulated on account switch
- No data leakage between accounts

### Security Considerations
- Firebase manages refresh tokens internally (not exposed to client)
- Account switching requires re-authentication (no token reuse)
- Device fingerprinting ensures session security
- Each account has independent device session tracking

## Implementation Checklist

### Frontend Components
- [x] `multiAccountStore.ts` - Account storage and management
- [x] `AccountSwitcher.tsx` - Main account switcher UI
- [x] `QuickAccountPicker.tsx` - Login page account picker
- [x] `multiAccountService.ts` - Account switching logic
- [x] Updated `AuthContext.tsx` - Multi-account integration

### Integration Points
- [ ] Add AccountSwitcher to main layout/sidebar
- [ ] Update login page to show QuickAccountPicker
- [ ] Add "Add Account" flow to login page
- [ ] Handle URL parameters (?add=true, ?switch=email)
- [ ] Test account switching with socket reconnection
- [ ] Test data isolation between accounts

### Backend Considerations
- [x] Device session tracking already supports multiple accounts
- [x] Each account has separate device sessions
- [ ] Optional: Add API endpoint to list user's accounts (if needed)
- [ ] Optional: Add account linking feature (link multiple auth providers)

## Usage Example

```tsx
// In your main layout or sidebar
import { AccountSwitcher } from './components/AccountSwitcher';

function Sidebar() {
  return (
    <div className="sidebar">
      <AccountSwitcher />
      {/* other sidebar content */}
    </div>
  );
}
```

```tsx
// In your login page
import { QuickAccountPicker } from './components/QuickAccountPicker';
import { useMultiAccountStore } from './store/multiAccountStore';

function LoginPage() {
  const { accounts } = useMultiAccountStore();
  const [showPicker, setShowPicker] = useState(accounts.length > 0);

  return (
    <div>
      {showPicker ? (
        <QuickAccountPicker
          onSelectAccount={(email) => {
            // Pre-fill email and show login form
            setEmail(email);
            setShowPicker(false);
          }}
          onAddNewAccount={() => setShowPicker(false)}
        />
      ) : (
        <LoginForm />
      )}
    </div>
  );
}
```

## Future Enhancements

1. **Account Linking**: Link multiple auth providers to same account
2. **Account Sync**: Sync account list across devices
3. **Quick Switch Shortcut**: Keyboard shortcut for account switching
4. **Account Notifications**: Show unread counts per account
5. **Account Profiles**: Custom profile pictures per account
6. **Account Groups**: Organize accounts into work/personal groups
7. **Session Persistence**: Remember last active account per device
8. **Biometric Auth**: Use fingerprint/face ID for quick switching

## Testing

### Manual Testing Checklist
- [ ] Login with first account
- [ ] Add second account
- [ ] Switch between accounts
- [ ] Verify data isolation (chats, settings)
- [ ] Remove account
- [ ] Test with all auth providers (Google, GitHub, Email)
- [ ] Test socket reconnection on switch
- [ ] Test device session tracking per account
- [ ] Test logout vs account switch behavior

### Edge Cases
- [ ] Switching while in active call
- [ ] Switching with pending messages
- [ ] Switching with active file uploads
- [ ] Network failure during switch
- [ ] Multiple rapid switches
- [ ] Removing account while switching to it

## Known Limitations

1. **Firebase Limitation**: Firebase doesn't expose refresh tokens directly, so account switching requires re-authentication
2. **No Simultaneous Sessions**: Only one account can be active at a time (by design)
3. **No Cross-Account Features**: Can't send messages between your own accounts
4. **Storage Overhead**: Each account stores its own data locally

## Support

For issues or questions about the multi-account feature:
1. Check this documentation
2. Review the implementation files
3. Test with the manual testing checklist
4. Check browser console for errors
5. Verify Firebase and backend configurations
