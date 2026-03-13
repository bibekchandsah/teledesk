# Logout QuickAccountPicker Fix

## Problem

When users explicitly logged out (from Settings), the login page showed the QuickAccountPicker with saved accounts. This was confusing because:
- User wanted to fully log out
- Seeing saved accounts suggested they weren't logged out
- Large placeholder images looked broken

## Solution

Added a `?logout=true` URL parameter to distinguish between:
1. **Explicit logout** - User clicked "Logout" button
2. **Account switching** - User switching to another account
3. **Session expired** - Automatic logout

## Implementation

### 1. LoginPage.tsx
```typescript
const logout = params.get('logout');

if (logout === 'true') {
  // User explicitly logged out, don't show picker
  setShowAccountPicker(false);
} else if (accounts.length > 0) {
  // Show picker for other cases
  setShowAccountPicker(true);
}
```

### 2. SettingsPage.tsx
```typescript
const handleLogout = async () => {
  await logout(false); // false = not switching
  window.location.href = '/login?logout=true';
};
```

### 3. SocketContext.tsx (Force Logout)
```typescript
// Force logout from this device
logout(false);
window.location.href = '/login?logout=true';
```

## Behavior

### Explicit Logout (?logout=true)
- Shows normal login form
- No QuickAccountPicker
- Clean, expected experience

### Account Switching (?switch=email)
- Pre-fills email
- No QuickAccountPicker
- Smooth switching experience

### Adding Account (?add=true)
- Shows normal login form
- No QuickAccountPicker
- Ready for new credentials

### No Parameters (Returning User)
- Shows QuickAccountPicker
- Lists saved accounts
- Quick re-login

## Status

🟢 **FIXED**

Users now see the appropriate login experience based on context.
