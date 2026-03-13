# Account Switcher - Visual Examples

## Sidebar Profile Navigation

### Before (Single Account)
```
┌─────────────────┐
│                 │
│   ┌─────────┐   │
│   │         │   │
│   │  [👤]   │   │  ← Profile picture
│   │    +    │   │  ← Plus icon overlay (top-right)
│   └─────────┘   │
│                 │
└─────────────────┘
```
**Behavior**: Click anywhere on profile → Opens profile page
**Icon Click**: Click + icon → Redirects to login to add account

---

### After (Multiple Accounts)
```
┌─────────────────┐
│                 │
│   ┌─────────┐   │
│   │         │   │
│   │  [👤]   │   │  ← Profile picture
│   │    ^    │   │  ← Chevron up icon (top-right)
│   └─────────┘   │
│                 │
└─────────────────┘
```
**Behavior**: Click profile → Opens profile page
**Icon Click**: Click ^ icon → Opens account dropdown

---

## Dropdown Appearance (Multiple Accounts)

```
                    ┌────────────────────────────────────┐
                    │                                    │
                    │  ┌────┐                            │
                    │  │ 👤 │  John Doe              ✓  │
                    │  └────┘  john@example.com         │
                    │                                    │
                    │  ┌────┐                            │
                    │  │ 👤 │  Jane Smith                │
                    │  └────┘  jane@example.com         │
                    │                                    │
                    │  ┌────┐                            │
                    │  │ 👤 │  Bob Wilson                │
                    │  └────┘  bob@example.com          │
                    │                                    │
                    ├────────────────────────────────────┤
                    │                                    │
                    │  ┌────┐                            │
                    │  │ +  │  Add account               │
                    │  └────┘                            │
                    │                                    │
                    └────────────────────────────────────┘
┌─────────────────┐  ↑
│                 │  │
│   ┌─────────┐   │  │ Dropdown appears above profile
│   │  [👤]   │   │  │
│   │    ^    │   │  │
│   └─────────┘   │  │
│                 │
└─────────────────┘
```

---

## Icon States

### State 1: No Accounts (Should never happen - user must be logged in)
```
No icon shown
```

### State 2: Single Account (1 account)
```
┌─────────┐
│         │
│  [👤]   │
│    +    │  ← Plus icon (blue circle, white +)
└─────────┘
```
**Action**: Click + → Add another account

### State 3: Multiple Accounts (2+ accounts)
```
┌─────────┐
│         │
│  [👤]   │
│    ^    │  ← Chevron up icon (blue circle, white ^)
└─────────┘
```
**Action**: Click ^ → Show dropdown

---

## Dropdown Interactions

### Hover State
```
┌────────────────────────────────────┐
│                                    │
│  ┌────┐                            │
│  │ 👤 │  John Doe              ✓  │  ← Active (highlighted)
│  └────┘  john@example.com         │
│                                    │
│  ┌────┐                            │
│  │ 👤 │  Jane Smith                │  ← Hover (background changes)
│  └────┘  jane@example.com         │  ← 
│                                    │
│  ┌────┐                            │
│  │ 👤 │  Bob Wilson                │
│  └────┘  bob@example.com          │
│                                    │
└────────────────────────────────────┘
```

### Active Account Indicator
```
┌────┐                            
│ 👤 │  John Doe              ✓  ← Blue checkmark in circle
└────┘  john@example.com         
```

### Add Account Button
```
┌────┐                            
│ +  │  Add account               ← Blue + icon, blue text
└────┘                            
```

---

## Complete User Journey

### Step 1: First Login
```
User logs in with Google
         ↓
Account saved automatically
         ↓
Profile shows + icon
```

### Step 2: Add Second Account
```
User clicks + icon
         ↓
Redirects to /login?add=true
         ↓
User logs in with GitHub
         ↓
Second account added
         ↓
Profile now shows ^ icon
```

### Step 3: View Accounts
```
User clicks ^ icon
         ↓
Dropdown appears
         ↓
Shows both accounts
         ↓
Active account has checkmark
```

### Step 4: Switch Account
```
User clicks on Jane Smith
         ↓
Current session logs out
         ↓
Redirects to /login?switch=jane@example.com
         ↓
Email pre-filled
         ↓
User enters password
         ↓
Logged in as Jane Smith
```

### Step 5: Add Third Account
```
User clicks ^ icon
         ↓
Dropdown appears
         ↓
User clicks "Add account"
         ↓
Redirects to /login?add=true
         ↓
User logs in with Email
         ↓
Third account added to dropdown
```

---

## Responsive Design

### Desktop (Sidebar)
```
┌──────┐
│      │
│ [👤] │  ← 28x28px profile picture
│  +   │  ← 20x20px icon badge
│      │
└──────┘
```

### Mobile (If applicable)
```
┌──────┐
│      │
│ [👤] │  ← Same size, touch-friendly
│  +   │  ← Larger tap target
│      │
└──────┘
```

---

## Color Scheme (Using CSS Variables)

### Icon Badge
- Background: `var(--accent)` (Blue)
- Border: `2px solid var(--bg-primary)`
- Icon color: `#fff` (White)

### Dropdown
- Background: `var(--bg-secondary)`
- Border: `1px solid var(--border)`
- Shadow: `0 10px 40px rgba(0,0,0,0.3)`

### Account Row
- Text (name): `var(--text-primary)`
- Text (email): `var(--text-secondary)`
- Hover background: `var(--bg-hover)`
- Active background: `var(--bg-hover)`

### Active Indicator
- Background: `var(--accent)` (Blue)
- Checkmark: `#fff` (White)

### Add Account
- Icon color: `var(--accent)` (Blue)
- Text color: `var(--accent)` (Blue)
- Hover background: `var(--bg-hover)`

---

## Animation & Transitions

### Icon Appearance
- Fades in when account is added
- No animation on initial load

### Dropdown
- Appears instantly (no slide animation)
- Backdrop fades in
- Closes on outside click

### Hover Effects
- Background color transition: 0.2s
- Smooth color changes

### Switching State
- Icon changes from + to ^ instantly
- No loading spinner (happens in background)

---

## Accessibility

### Keyboard Navigation
```
Tab → Focus on profile button
Enter → Open profile page
Tab → Focus on icon badge
Enter → Open dropdown (if multiple accounts)
Tab → Navigate through accounts
Enter → Select account
Esc → Close dropdown
```

### Screen Reader
- Icon badge: "Add account" or "Switch account"
- Dropdown: "Account list"
- Each account: "Switch to [name]"
- Active account: "[name] (current account)"
- Add button: "Add another account"

### Focus States
- Visible outline on focused elements
- High contrast mode compatible
- Color blind friendly (uses icons + text)
