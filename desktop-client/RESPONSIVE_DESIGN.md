# Account Switcher - Responsive Design

## Breakpoint
- **Desktop**: Width ≥ 768px
- **Mobile**: Width < 768px

## Desktop Layout (≥ 768px)

### Icon Position
```
Profile Picture (28x28px)
┌──────────────────┐
│                  │
│                  │  ┌─────┐
│       [👤]       │  │  ^  │ ← Icon (top-right)
│                  │  └─────┘
│                  │
└──────────────────┘
```

### Dropdown Position
```
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
│  │    │   Fixed: bottom: 80px, left: 70px     │
│  │[👤]│                                        │
│  │ ^  │                                        │
│  └────┘                                        │
└─────────────────────────────────────────────────┘
```

**Desktop Positioning:**
- `position: fixed`
- `bottom: 80px` (from bottom of screen)
- `left: 70px` (next to sidebar)
- `width: 280px`
- `maxHeight: calc(100vh - 100px)`

---

## Mobile Layout (< 768px)

### Icon Position
```
Same as desktop:
Top-right corner of profile picture
```

### Dropdown Position (Centered Modal)
```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ╔═══════════════════════════════════════╗     │
│  ║ Switch Account                    ✕  ║     │
│  ╠═══════════════════════════════════════╣     │
│  ║                                       ║     │
│  ║  [👤] John Doe                   ✓  ║     │
│  ║       john@example.com               ║     │
│  ║                                       ║     │
│  ║  [👤] Jane Smith                     ║     │
│  ║       jane@example.com               ║     │
│  ║                                       ║     │
│  ╠═══════════════════════════════════════╣     │
│  ║  [+]  Add account                    ║     │
│  ╚═══════════════════════════════════════╝     │
│                                                 │
│  Dark backdrop (50% opacity)                   │
└─────────────────────────────────────────────────┘
```

**Mobile Positioning:**
- `position: fixed`
- `top: 50%`
- `left: 50%`
- `transform: translate(-50%, -50%)` (centered)
- `width: calc(100vw - 32px)` (16px margin on each side)
- `maxWidth: 320px`
- `maxHeight: calc(100vh - 80px)`

---

## Responsive Features

### Desktop (≥ 768px)
- ✅ Dropdown appears next to sidebar
- ✅ No backdrop overlay
- ✅ No close button (click outside to close)
- ✅ Positioned at bottom-left

### Mobile (< 768px)
- ✅ Dropdown centered on screen (modal style)
- ✅ Dark backdrop (50% opacity)
- ✅ Close button (X) in top-right
- ✅ "Switch Account" header
- ✅ Full-width with margins
- ✅ Touch-friendly sizing

---

## CSS Breakdown

### Desktop Dropdown
```typescript
{
  position: 'fixed',
  bottom: 80,
  left: 70,
  width: 280,
  maxHeight: 'calc(100vh - 100px)',
  backgroundColor: 'var(--bg-secondary)',
  borderRadius: 12,
  boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
  border: '1px solid var(--border)',
  zIndex: 50,
  overflow: 'auto',
}
```

### Mobile Dropdown
```typescript
{
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'calc(100vw - 32px)',
  maxWidth: 320,
  maxHeight: 'calc(100vh - 80px)',
  backgroundColor: 'var(--bg-secondary)',
  borderRadius: 12,
  boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
  border: '1px solid var(--border)',
  zIndex: 50,
  overflow: 'auto',
}
```

### Backdrop
```typescript
// Desktop
{
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  backgroundColor: 'transparent', // No visible backdrop
}

// Mobile
{
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  backgroundColor: 'rgba(0, 0, 0, 0.5)', // Dark overlay
}
```

---

## Mobile-Specific Elements

### Close Button (Mobile Only)
```typescript
{isMobile && (
  <div style={{ 
    padding: '12px 12px 0', 
    display: 'flex', 
    justifyContent: 'space-between' 
  }}>
    <div style={{ fontSize: 14, fontWeight: 600 }}>
      Switch Account
    </div>
    <button onClick={() => setIsOpen(false)}>
      <svg>✕</svg>
    </button>
  </div>
)}
```

---

## Responsive Behavior

### Screen Resize
```typescript
useEffect(() => {
  const handleResize = () => {
    setIsMobile(window.innerWidth < 768);
  };

  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

### Dynamic Positioning
```typescript
...(isMobile ? {
  // Mobile styles
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'calc(100vw - 32px)',
  maxWidth: 320,
} : {
  // Desktop styles
  bottom: 80,
  left: 70,
  width: 280,
})
```

---

## Touch Targets (Mobile)

### Minimum Touch Target Size
- Account row: 64px height (12px padding × 2 + 40px avatar)
- Close button: 28px × 28px (20px icon + 4px padding × 2)
- Icon badge: 20px × 20px (acceptable for secondary action)

### Spacing
- Padding: 12px (comfortable for touch)
- Gap between elements: 12px
- Margin from screen edge: 16px

---

## Visual Comparison

### Desktop View
```
Sidebar                    Dropdown
┌────┐  ┌──────────────────────────┐
│    │  │ Account List             │
│    │  │                          │
│[👤]│  │ [👤] User 1          ✓  │
│ ^  │  │ [👤] User 2              │
└────┘  │ [+]  Add account         │
        └──────────────────────────┘
        ↑ Positioned next to sidebar
```

### Mobile View
```
┌─────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ ← Dark backdrop
│ ░░░┌─────────────────────┐░░░░ │
│ ░░░│ Switch Account    ✕ │░░░░ │
│ ░░░├─────────────────────┤░░░░ │
│ ░░░│ [👤] User 1      ✓ │░░░░ │
│ ░░░│ [👤] User 2         │░░░░ │
│ ░░░├─────────────────────┤░░░░ │
│ ░░░│ [+]  Add account    │░░░░ │
│ ░░░└─────────────────────┘░░░░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────────┘
        ↑ Centered modal
```

---

## Testing Checklist

### Desktop (≥ 768px)
- [ ] Dropdown appears next to sidebar
- [ ] No backdrop visible
- [ ] Click outside closes dropdown
- [ ] Positioned at bottom-left
- [ ] Width: 280px

### Mobile (< 768px)
- [ ] Dropdown centered on screen
- [ ] Dark backdrop visible
- [ ] Close button (X) appears
- [ ] "Switch Account" header shows
- [ ] Width: calc(100vw - 32px)
- [ ] Max width: 320px
- [ ] Touch-friendly tap targets

### Resize Behavior
- [ ] Resize from desktop to mobile → Layout changes
- [ ] Resize from mobile to desktop → Layout changes
- [ ] Dropdown repositions correctly
- [ ] No layout breaks

### Edge Cases
- [ ] Very small screen (320px) → Dropdown fits
- [ ] Very large screen (2560px) → Dropdown positioned correctly
- [ ] Portrait orientation → Works
- [ ] Landscape orientation → Works

---

## Browser Compatibility

### Modern Browsers (Supported)
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (iOS/macOS)
- ✅ Opera

### Features Used
- `window.innerWidth` - Widely supported
- `calc()` - Widely supported
- `transform: translate()` - Widely supported
- `position: fixed` - Widely supported
- CSS variables - Modern browsers only

---

## Performance

### Resize Listener
- Debounced automatically by browser
- Minimal performance impact
- Cleanup on unmount

### Conditional Rendering
- Only renders dropdown when open
- Backdrop only when needed
- No unnecessary re-renders

---

## Accessibility

### Mobile
- Close button has proper click target
- Header provides context
- Scrollable if many accounts
- Touch-friendly spacing

### Desktop
- Keyboard navigation works
- Click outside to close
- Focus management
- Screen reader friendly

---

## Future Enhancements

### Potential Improvements
1. Add swipe-to-close on mobile
2. Add animation for dropdown appearance
3. Add haptic feedback on mobile
4. Support tablet-specific layout (768px-1024px)
5. Add keyboard shortcuts for account switching
6. Remember last position on desktop
