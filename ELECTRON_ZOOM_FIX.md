# Electron Zoom Controls Fix

## Problem

In the Electron desktop app:
- `Ctrl -` (zoom out) was working
- `Ctrl +` (zoom in) was NOT working
- `Ctrl 0` (reset zoom) was not implemented

## Root Cause

Electron's default keyboard shortcuts were not properly handling the `+` key because:
1. The `+` key requires `Shift` to be pressed (it's `Shift + =`)
2. Electron was only listening for the literal `+` character
3. Need to also listen for `=` key (which is `+` without shift)

## Solution

Added custom keyboard shortcut handling using `before-input-event`:

```typescript
mainWindow.webContents.on('before-input-event', (event, input) => {
  const isCtrlOrCmd = input.control || input.meta;

  // Zoom In: Ctrl/Cmd + Plus or Ctrl/Cmd + =
  if (isCtrlOrCmd && (input.key === '+' || input.key === '=')) {
    event.preventDefault();
    const currentZoom = mainWindow.webContents.getZoomLevel();
    mainWindow.webContents.setZoomLevel(currentZoom + 0.5);
  }

  // Zoom Out: Ctrl/Cmd + Minus
  if (isCtrlOrCmd && input.key === '-') {
    event.preventDefault();
    const currentZoom = mainWindow.webContents.getZoomLevel();
    mainWindow.webContents.setZoomLevel(currentZoom - 0.5);
  }

  // Reset Zoom: Ctrl/Cmd + 0
  if (isCtrlOrCmd && input.key === '0') {
    event.preventDefault();
    mainWindow.webContents.setZoomLevel(0);
  }
});
```

## Features

### Zoom In
- **Windows/Linux**: `Ctrl + +` or `Ctrl + =`
- **macOS**: `Cmd + +` or `Cmd + =`
- Increases zoom by 0.5 levels per press

### Zoom Out
- **Windows/Linux**: `Ctrl + -`
- **macOS**: `Cmd + -`
- Decreases zoom by 0.5 levels per press

### Reset Zoom
- **Windows/Linux**: `Ctrl + 0`
- **macOS**: `Cmd + 0`
- Resets zoom to default (100%)

## Zoom Levels

Electron zoom levels:
- `0` = 100% (default)
- `0.5` = ~110%
- `1.0` = ~120%
- `-0.5` = ~90%
- `-1.0` = ~80%

Each 0.5 increment ≈ 10% zoom change

## Cross-Platform Support

- ✅ Windows: Uses `Ctrl` key
- ✅ macOS: Uses `Cmd` key
- ✅ Linux: Uses `Ctrl` key
- ✅ Handles both `+` and `=` keys

## Why Both `+` and `=`?

On most keyboards:
- `=` key is the base key
- `+` requires pressing `Shift + =`
- Some users press `Ctrl + Shift + =` (which sends `+`)
- Some users press `Ctrl + =` (which sends `=`)
- We handle both for better UX

## Testing

### Test Zoom In
1. Press `Ctrl + +` (or `Cmd + +` on Mac)
2. Verify window zooms in
3. Press multiple times
4. Verify continues zooming in

### Test Zoom Out
1. Press `Ctrl + -` (or `Cmd + -` on Mac)
2. Verify window zooms out
3. Press multiple times
4. Verify continues zooming out

### Test Reset
1. Zoom in or out
2. Press `Ctrl + 0` (or `Cmd + 0` on Mac)
3. Verify zoom resets to 100%

### Test Both Keys
1. Try `Ctrl + =` (without Shift)
2. Verify zooms in
3. Try `Ctrl + Shift + =` (with Shift, produces `+`)
4. Verify also zooms in

## Status

🟢 **FIXED**

All zoom controls now work correctly:
- ✅ Zoom in with `Ctrl/Cmd + +` or `=`
- ✅ Zoom out with `Ctrl/Cmd + -`
- ✅ Reset zoom with `Ctrl/Cmd + 0`
- ✅ Cross-platform support
- ✅ Smooth zoom increments
