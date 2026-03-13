# Multi-Account Feature - Integration Guide

## Quick Start

Follow these steps to integrate the multi-account feature into your app:

## Step 1: Add AccountSwitcher to Your Layout

Find where you want to display the account switcher (typically in a sidebar or header) and add:

```tsx
import { AccountSwitcher } from '../components/AccountSwitcher';

// In your layout component
<div className="sidebar">
  <AccountSwitcher />
  {/* rest of your sidebar */}
</div>
```

## Step 2: Update LoginPage.tsx

Add the QuickAccountPicker to show previously logged-in accounts:

```tsx
import { QuickAccountPicker } from '../components/QuickAccountPicker';
import { useMultiAccountStore } from '../store/multiAccountStore';
import { useSearchParams } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const { accounts } = useMultiAccountStore();
  const [searchParams] = useSearchParams();
  const [showAccountPicker, setShowAccountPicker] = useState(
    accounts.length > 0 && !searchParams.get('add')
  );

  // Pre-fill email if switching accounts
  const switchEmail = searchParams.get('switch');
  useEffect(() => {
    if (switchEmail) {
      setEmail(switchEmail);
      setShowAccountPicker(false);
    }
  }, [switchEmail]);

  return (
    <div className="login-container">
      {showAccountPicker ? (
        <QuickAccountPicker
          onSelectAccount={(email) => {
            setEmail(email);
            setShowAccountPicker(false);
          }}
          onAddNewAccount={() => setShowAccountPicker(false)}
        />
      ) : (
        // Your existing login form
        <LoginForm />
      )}
    </div>
  );
};
```

## Step 3: Install Required Dependencies

Make sure you have zustand persistence:

```bash
npm install zustand
```

The `multiAccountStore.ts` already uses `persist` middleware.

## Step 4: Test the Feature

1. **Login with first account**:
   - Go to login page
   - Login with any method (Google, GitHub, Email)
   - Account is automatically saved

2. **Add second account**:
   - Click AccountSwitcher dropdown
   - Click "Add Account"
   - Login with different credentials
   - New account is added to the list

3. **Switch between accounts**:
   - Click AccountSwitcher dropdown
   - Click on a different account
   - You'll be logged out and redirected to login
   - Click the account in QuickAccountPicker
   - Login with that account's credentials

4. **Remove an account**:
   - Click AccountSwitcher dropdown
   - Click X button next to account
   - Confirm removal

## Example: Full LoginPage Integration

```tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAuthStore } from '../store/authStore';
import { useMultiAccountStore } from '../store/multiAccountStore';
import { QuickAccountPicker } from '../components/QuickAccountPicker';
import { useSearchParams } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const { loginWithGoogle, loginWithGithub, loginWithEmail, registerWithEmail } = useAuth();
  const { isLoading, error } = useAuthStore();
  const { accounts } = useMultiAccountStore();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Show account picker if we have accounts and not explicitly adding new one
  const [showAccountPicker, setShowAccountPicker] = useState(
    accounts.length > 0 && !searchParams.get('add')
  );

  // Pre-fill email if switching accounts
  useEffect(() => {
    const switchEmail = searchParams.get('switch');
    if (switchEmail) {
      setEmail(switchEmail);
      setShowAccountPicker(false);
    }
  }, [searchParams]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') {
      await loginWithEmail(email, password);
    } else {
      await registerWithEmail(email, password, name.trim() || 'User');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Logo and Title */}
        <div className="login-header">
          <h1>Welcome Back</h1>
        </div>

        {showAccountPicker ? (
          // Show quick account picker
          <QuickAccountPicker
            onSelectAccount={(selectedEmail) => {
              setEmail(selectedEmail);
              setShowAccountPicker(false);
            }}
            onAddNewAccount={() => setShowAccountPicker(false)}
          />
        ) : (
          // Show login form
          <>
            {/* OAuth Buttons */}
            <div className="oauth-buttons">
              <button onClick={loginWithGoogle} disabled={isLoading}>
                Continue with Google
              </button>
              <button onClick={loginWithGithub} disabled={isLoading}>
                Continue with GitHub
              </button>
            </div>

            {/* Divider */}
            <div className="divider">or</div>

            {/* Email/Password Form */}
            <form onSubmit={handleEmailSubmit}>
              {mode === 'signup' && (
                <input
                  type="text"
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="submit" disabled={isLoading}>
                {mode === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            </form>

            {/* Toggle Mode */}
            <div className="toggle-mode">
              {mode === 'signin' ? (
                <span>
                  Don't have an account?{' '}
                  <button onClick={() => setMode('signup')}>Sign Up</button>
                </span>
              ) : (
                <span>
                  Already have an account?{' '}
                  <button onClick={() => setMode('signin')}>Sign In</button>
                </span>
              )}
            </div>

            {/* Back to Account Picker */}
            {accounts.length > 0 && (
              <button
                onClick={() => setShowAccountPicker(true)}
                className="back-to-picker"
              >
                ← Back to account selection
              </button>
            )}
          </>
        )}

        {/* Error Display */}
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
};

export default LoginPage;
```

## Example: Sidebar Integration

```tsx
import { AccountSwitcher } from '../components/AccountSwitcher';

const Sidebar: React.FC = () => {
  return (
    <div className="sidebar">
      {/* Account Switcher at top */}
      <div className="sidebar-header">
        <AccountSwitcher />
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <a href="/chats">Chats</a>
        <a href="/settings">Settings</a>
        {/* ... */}
      </nav>
    </div>
  );
};
```

## Styling Tips

The components use Tailwind CSS classes. If you're not using Tailwind, you can:

1. **Convert to CSS modules**: Replace className with your own CSS classes
2. **Use inline styles**: Replace className with style prop
3. **Install Tailwind**: Follow Tailwind CSS installation guide

Example without Tailwind:

```tsx
// Replace this:
<button className="p-2 rounded-lg hover:bg-gray-100">

// With this:
<button style={{
  padding: '8px',
  borderRadius: '8px',
  transition: 'background-color 0.2s'
}}
onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
>
```

## Troubleshooting

### Accounts not persisting
- Check browser localStorage for `multi-account-storage` key
- Ensure zustand persist middleware is working
- Check browser console for errors

### Account switching not working
- Verify Firebase auth is properly configured
- Check that logout function has `switchingAccount` parameter
- Ensure URL parameters are being read correctly

### UI not showing
- Verify components are imported correctly
- Check that multiAccountStore has accounts
- Inspect React DevTools for component rendering

### Socket not reconnecting
- Check that `initSocket` is called in AuthContext
- Verify token is being passed correctly
- Check backend socket authentication

## Next Steps

After integration:
1. Test all user flows (add, switch, remove accounts)
2. Verify data isolation between accounts
3. Test socket reconnection on account switch
4. Add analytics tracking for account switching
5. Consider adding account sync across devices
6. Implement biometric auth for quick switching

## Support

If you encounter issues:
1. Check browser console for errors
2. Verify all files are created correctly
3. Ensure dependencies are installed
4. Review the MULTI_ACCOUNT_FEATURE.md documentation
5. Test with a fresh browser profile
