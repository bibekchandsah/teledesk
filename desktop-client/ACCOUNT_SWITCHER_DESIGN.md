# Account Switcher - New Design Specification

## Visual Design

### Single Account (No additional accounts)
```
┌─────────────┐
│             │
│   Profile   │  ← Profile navigation button
│   Picture   │
│      +      │  ← Plus icon in top-right corner
└─────────────┘
```
- Shows a **+ icon** in the top-right corner of the profile picture
- Clicking the + icon redirects to login page to add another account
- No dropdown appears

### Multiple Accounts (2+ accounts logged in)
```
┌─────────────┐
│             │
│   Profile   │  ← Profile navigation button
│   Picture   │
│      ^      │  ← Chevron up icon in top-right corner
└─────────────┘
```
- Shows a **^ icon** (chevron up) in the top-right corner
- Clicking the ^ icon opens the account dropdown

## Dropdown Layout (Multiple Accounts)

```
┌──────────────────────────────────────┐
│  ┌────┐                              │
│  │ 👤 │  John Doe                    │ ← Account 1 (Active)
│  └────┘  john@example.com        ✓  │
│                                      │
│  ┌────┐                              │
│  │ 👤 │  Jane Smith                  │ ← Account 2
│  └────┘  jane@example.com           │
│                                      │
│  ┌────┐                              │
│  │ 👤 │  Bob Wilson                  │ ← Account 3
│  └────┘  bob@example.com            │
├──────────────────────────────────────┤
│  ┌────┐                              │
│  │ +  │  Add account                 │ ← Add new account
│  └────┘                              │
└──────────────────────────────────────┘
```

### Dropdown Features:
- Shows all logged-in accounts with profile picture and username
- Active account has a checkmark (✓) indicator
- Hover effect on each account row
- Separator line before "Add account" option
- Clicking an account switches to that account
- Clicking "Add account" redirects to login page

## User Flows

### Flow 1: First Time User (No Accounts)
1. User logs in for the first time
2. Account is automatically saved
3. Profile nav shows **+ icon**
4. User can click + to add another account

### Flow 2: Adding Second Account
1. User clicks **+ icon** on profile nav
2. Redirects to `/login?add=true`
3. User logs in with different credentials
4. New account is added to the list
5. Profile nav now shows **^ icon** instead of +

### Flow 3: Switching Between Accounts
1. User clicks **^ icon** on profile nav
2. Dropdown appears showing all accounts
3. User clicks on a different account
4. Current session logs out
5. Redirects to login page with pre-filled email
6. User enters password and logs in
7. Switched to selected account

### Flow 4: Adding Third+ Account
1. User clicks **^ icon** on profile nav
2. Dropdown appears
3. User clicks "Add account" at bottom
4. Redirects to `/login?add=true`
5. User logs in with new credentials
6. New account added to dropdown list

## Technical Implementation

### Icon Logic
```typescript
const hasMultipleAccounts = accounts.length > 1;

// Show + icon when single account, ^ icon when multiple
{hasMultipleAccounts ? (
  <ChevronUp size={12} />  // ^ icon
) : (
  <Plus size={12} />       // + icon
)}
```

### Click Behavior
```typescript
onClick={() => {
  if (hasMultipleAccounts) {
    setIsOpen(!isOpen);  // Open dropdown
  } else {
    handleAddAccount();  // Redirect to login
  }
}}
```

### Dropdown Positioning
- Positioned **above** the profile button (bottom: 100%)
- Aligned to the **right** edge
- 8px margin from profile button
- Fixed width: 280px
- Appears with backdrop overlay

## Styling Details

### Icon Badge
- Size: 20x20px
- Position: Absolute, top-right corner (-4px, -4px)
- Background: Accent color (blue)
- Border: 2px solid background color
- Border radius: 50% (circular)
- Z-index: 10 (above profile picture)

### Dropdown
- Background: Secondary background color
- Border radius: 12px
- Box shadow: 0 10px 40px rgba(0,0,0,0.3)
- Border: 1px solid border color
- Overflow: hidden

### Account Row
- Padding: 12px
- Border radius: 8px
- Hover: Background color changes
- Active account: Highlighted background
- Avatar: 40x40px circular
- Name: 14px, font-weight 600
- Email: 12px, secondary text color

### Add Account Button
- Same styling as account row
- Plus icon in circular background
- Accent color text
- Separated by border line

## Integration in App.tsx

```tsx
import { AccountSwitcher } from './components/AccountSwitcher';

// In the profile NavLink
<NavLink
  to="/profile"
  style={{ marginTop: 8, position: 'relative' }}
>
  {/* Profile picture */}
  <img src={currentUser.avatar} />
  
  {/* Account switcher overlay */}
  <AccountSwitcher />
</NavLink>
```

## Responsive Behavior

- Works on all screen sizes
- Dropdown adjusts to viewport height if needed
- Touch-friendly on mobile (larger tap targets)
- Backdrop closes dropdown on outside click

## Accessibility

- Icon buttons have proper title attributes
- Keyboard navigation supported
- Focus states visible
- Screen reader friendly labels
- High contrast mode compatible

## Browser Compatibility

- Works in all modern browsers
- Uses CSS variables for theming
- No external dependencies (except lucide-react for icons)
- Fallback for browsers without backdrop-filter

## Performance

- Lightweight component (~200 lines)
- No unnecessary re-renders
- Efficient state management with Zustand
- LocalStorage persistence for accounts
- Fast account switching (< 1s)
