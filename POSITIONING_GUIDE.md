# Account Switcher - Positioning Guide

## Current Layout

### Sidebar Profile Section
```
┌─────────────────────────────────────┐
│                                     │
│  Sidebar (60px wide)                │
│                                     │
│  ┌─────────┐                        │
│  │         │                        │
│  │  [👤]   │  ← Profile picture     │
│  │    ^    │  ← Icon badge          │
│  └─────────┘                        │
│                                     │
│  Bottom of sidebar                  │
└─────────────────────────────────────┘
```

### Icon Badge Position
```
Profile Picture (28x28px)
┌──────────────────┐
│                  │
│                  │  ┌─────┐
│       [👤]       │  │  ^  │ ← Icon (20x20px)
│                  │  └─────┘
│                  │    ↑
└──────────────────┘    │
                        │
                   top: -4px
                   right: -4px
```

### Dropdown Position (Fixed)
```
Screen Layout:
┌─────────────────────────────────────────────────┐
│                                                 │
│  ┌────┐  ┌──────────────────────────────┐     │
│  │    │  │ [👤] John Doe            ✓  │     │
│  │ S  │  │      john@example.com        │     │
│  │ I  │  │                              │     │
│  │ D  │  │ [👤] Jane Smith              │     │
│  │ E  │  │      jane@example.com        │     │
│  │ B  │  ├──────────────────────────────┤     │
│  │ A  │  │ [+]  Add account             │     │
│  │ R  │  └──────────────────────────────┘     │
│  │    │   ↑                                    │
│  │    │   left: 70px (next to sidebar)        │
│  │    │                                        │
│  │[👤]│                                        │
│  │ ^  │                                        │
│  └────┘                                        │
│   ↑                                            │
│   bottom: 80px (from bottom of screen)        │
└─────────────────────────────────────────────────┘
```

## CSS Positioning

### Icon Badge
```css
position: absolute;
top: -4px;      /* 4px above parent */
right: -4px;    /* 4px to the right of parent */
width: 20px;
height: 20px;
z-index: 10;    /* Above profile picture */
```

### Dropdown
```css
position: fixed;           /* Fixed to viewport */
bottom: 80px;             /* 80px from bottom */
left: 70px;               /* 70px from left (sidebar width + margin) */
width: 280px;             /* Fixed width */
max-height: calc(100vh - 100px); /* Max height with margin */
overflow: auto;           /* Scrollable if needed */
z-index: 50;              /* Above everything */
```

### Backdrop
```css
position: fixed;
inset: 0;                 /* Full screen */
z-index: 40;              /* Below dropdown, above content */
```

## Responsive Behavior

### Desktop (Normal)
```
Sidebar: 60px wide
Icon: top-right of profile
Dropdown: left: 70px (next to sidebar)
```

### Small Screen
```
Dropdown: Still at left: 70px
Max height: calc(100vh - 100px)
Scrollable if too many accounts
```

### Very Small Screen
```
May need adjustment:
- Reduce dropdown width
- Adjust left position
- Ensure always visible
```

## Z-Index Layers
```
Layer 5 (z-index: 50): Dropdown
Layer 4 (z-index: 40): Backdrop
Layer 3 (z-index: 10): Icon badge
Layer 2 (z-index: 1):  Sidebar
Layer 1 (z-index: 0):  Main content
```

## Event Flow

### Click Icon
```
User clicks icon
    ↓
e.preventDefault()     ← Prevent default link behavior
    ↓
e.stopPropagation()   ← Stop event from reaching NavLink
    ↓
Open dropdown or add account
```

### Click Profile Picture
```
User clicks profile picture
    ↓
NavLink receives click
    ↓
Navigate to /profile
```

### Click Outside Dropdown
```
User clicks anywhere
    ↓
Backdrop receives click
    ↓
Close dropdown
```

## DOM Structure

```html
<div style="position: relative; margin-top: 8px">
  <!-- Profile NavLink (clickable) -->
  <NavLink to="/profile" style="position: relative">
    <img src="avatar" style="width: 28px; height: 28px" />
  </NavLink>
  
  <!-- Account Switcher (separate) -->
  <AccountSwitcher>
    <!-- Icon Badge -->
    <button 
      onClick={stopPropagation}
      style="position: absolute; top: -4px; right: -4px"
    >
      +/^
    </button>
    
    <!-- Dropdown (when open) -->
    {isOpen && (
      <>
        <div style="position: fixed; inset: 0" /> {/* Backdrop */}
        <div style="position: fixed; bottom: 80px; left: 70px">
          {/* Account list */}
        </div>
      </>
    )}
  </AccountSwitcher>
</div>
```

## Measurements

### Sidebar
- Width: 60px
- Profile button: 28x28px
- Margin: 8px

### Icon Badge
- Size: 20x20px
- Border: 2px solid
- Offset: -4px (overlaps profile)

### Dropdown
- Width: 280px
- Max height: calc(100vh - 100px)
- Padding: 8px
- Border radius: 12px

### Account Row
- Height: ~64px (with padding)
- Avatar: 40x40px
- Padding: 12px
- Gap: 12px

## Viewport Constraints

```
Screen height: 100vh
Top margin: 20px
Bottom margin: 20px
Dropdown max: 100vh - 100px

Example:
Screen: 1080px
Max dropdown: 980px
Actual content: ~200px per account
Scrolls if > 4-5 accounts
```

## Testing Positions

### Test 1: Icon Position
```
Expected:
- Top-right corner of profile picture
- Overlaps by 4px on each side
- Circular badge
- Blue background
```

### Test 2: Dropdown Position
```
Expected:
- Appears to the right of sidebar
- 80px from bottom of screen
- 70px from left edge
- Fully visible
- Not cut off
```

### Test 3: Click Areas
```
Profile picture: Navigate to profile
Icon badge: Open dropdown/add account
Outside dropdown: Close dropdown
Account row: Switch account
```

## Troubleshooting

### Dropdown Not Visible
- Check `position: fixed` (not absolute)
- Verify `bottom: 80px, left: 70px`
- Check `z-index: 50`
- Ensure not `display: none`

### Icon Triggers Navigation
- Verify `e.stopPropagation()` is called
- Check icon is outside NavLink
- Ensure onClick handler is on icon button

### Icon Position Wrong
- Check `position: absolute` on icon
- Verify `top: -4px, right: -4px`
- Ensure parent has `position: relative`

### Dropdown Cut Off
- Check `maxHeight: calc(100vh - 100px)`
- Verify `overflow: auto`
- Adjust `bottom` value if needed
