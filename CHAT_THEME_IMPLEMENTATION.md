# Chat Theme Implementation Guide

## ✅ Completed Backend

### Database Schema
- **File**: `backend-server/chat-theme-migration.sql`
- Added `chat_themes` JSONB column to users table
- Stores per-chat theme settings with structure:
  ```json
  {
    "chatId": {
      "backgroundImage": "url",
      "backgroundColor": "#hex",
      "opacity": 0.8,
      "blur": 10,
      "showToOthers": true
    }
  }
  ```

### Types
- **File**: `shared/types/index.ts`
- Added `ChatTheme` interface
- Added `chatThemes` to User interface

### Services
- **File**: `backend-server/src/services/userService.ts`
- `setChatTheme(uid, chatId, theme)` - Set/update theme
- `getChatTheme(uid, chatId)` - Get theme for chat
- `removeChatTheme(uid, chatId)` - Remove theme
- `getAllChatThemes(uid)` - Get all themes

### Controllers
- **File**: `backend-server/src/controllers/userController.ts`
- `setChatThemeHandler` - PUT /api/users/me/chat-theme/:chatId
- `getChatThemeHandler` - GET /api/users/me/chat-theme/:chatId
- `removeChatThemeHandler` - DELETE /api/users/me/chat-theme/:chatId
- `getAllChatThemesHandler` - GET /api/users/me/chat-themes
- Emits socket events for cross-device sync

### Routes
- **File**: `backend-server/src/routes/userRoutes.ts`
- All chat theme endpoints registered

## ✅ Completed Frontend

### API Service
- **File**: `desktop-client/src/services/apiService.ts`
- `setChatTheme(chatId, theme)`
- `getChatTheme(chatId)`
- `removeChatTheme(chatId)`
- `getAllChatThemes()`

### Components
- **File**: `desktop-client/src/components/modals/ChatThemeModal.tsx`
- Premium modal with:
  - Image upload with preview
  - Opacity slider (0-100%)
  - Blur slider (0-50px)
  - "Show to Others" toggle
  - Remove theme option
  - Animated loading states

## 🔧 Integration Steps

### 1. Run Database Migration
```bash
psql -U your_username -d your_database -f backend-server/chat-theme-migration.sql
```

### 2. Add Theme Modal to ChatWindow
In `desktop-client/src/pages/ChatWindow.tsx`:

```typescript
import ChatThemeModal from '../components/modals/ChatThemeModal';

// Add state
const [showThemeModal, setShowThemeModal] = useState(false);
const [chatTheme, setChatTheme] = useState<ChatTheme | null>(null);

// Load theme on chat open
useEffect(() => {
  if (activeChat && currentUser?.chatThemes) {
    const theme = currentUser.chatThemes[activeChat.chatId];
    setChatTheme(theme || null);
  }
}, [activeChat, currentUser?.chatThemes]);

// Add menu option in header three-dot menu
<button
  onClick={() => { setHeaderMenu(null); setShowThemeModal(true); }}
  style={headerCtxItemStyle}
>
  <Palette size={14} style={{ marginRight: 8 }} />Customize Theme
</button>

// Render modal
{showThemeModal && activeChat && (
  <ChatThemeModal
    chatId={activeChat.chatId}
    currentTheme={chatTheme || undefined}
    onClose={() => setShowThemeModal(false)}
    onSave={(theme) => setChatTheme(theme)}
  />
)}
```

### 3. Apply Theme to Chat Background
In `desktop-client/src/pages/ChatWindow.tsx`, update the messages container:

```typescript
// Get theme to display (own theme or peer's theme if they shared)
const displayTheme = useMemo(() => {
  if (!activeChat) return null;
  
  // Check if peer shared their theme
  if (peer && peer.chatThemes?.[activeChat.chatId]?.showToOthers) {
    return peer.chatThemes[activeChat.chatId];
  }
  
  // Use own theme
  return currentUser?.chatThemes?.[activeChat.chatId] || null;
}, [activeChat, currentUser?.chatThemes, peer]);

// Apply to messages container
<div
  style={{
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    position: 'relative',
    ...(displayTheme && {
      backgroundImage: displayTheme.backgroundImage 
        ? `url(${displayTheme.backgroundImage})` 
        : undefined,
      backgroundColor: displayTheme.backgroundColor || 'var(--bg-primary)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }),
  }}
>
  {displayTheme && (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: `rgba(15, 23, 42, ${1 - displayTheme.opacity})`,
        backdropFilter: `blur(${displayTheme.blur}px)`,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )}
  <div style={{ position: 'relative', zIndex: 1 }}>
    {/* Messages content */}
  </div>
</div>
```

### 4. Add Socket Listener for Cross-Device Sync
In `desktop-client/src/services/socketService.ts` or in ChatWindow:

```typescript
useEffect(() => {
  const socket = getSocket();
  if (!socket) return;

  const handleThemeUpdate = ({ chatId, theme }: any) => {
    if (currentUser) {
      const updatedThemes = { ...currentUser.chatThemes, [chatId]: theme };
      setCurrentUser({ ...currentUser, chatThemes: updatedThemes });
    }
  };

  const handleThemeRemove = ({ chatId }: any) => {
    if (currentUser) {
      const updatedThemes = { ...currentUser.chatThemes };
      delete updatedThemes[chatId];
      setCurrentUser({ ...currentUser, chatThemes: updatedThemes });
    }
  };

  socket.on('CHAT_THEME_UPDATED', handleThemeUpdate);
  socket.on('CHAT_THEME_REMOVED', handleThemeRemove);

  return () => {
    socket.off('CHAT_THEME_UPDATED', handleThemeUpdate);
    socket.off('CHAT_THEME_REMOVED', handleThemeRemove);
  };
}, [currentUser, setCurrentUser]);
```

### 5. Add Palette Icon Import
In `desktop-client/src/pages/ChatWindow.tsx`:
```typescript
import { ..., Palette } from 'lucide-react';
```

## Features Implemented

✅ Individual chat themes per user
✅ Custom background image upload
✅ Opacity control (0-100%)
✅ Blur control (0-50px)
✅ Show to others toggle
✅ Cross-device sync via socket events
✅ Premium animated UI
✅ Image preview with remove option
✅ Smooth transitions and loading states
✅ Database persistence
✅ RESTful API endpoints

## Premium Features

- **Animated Image Upload**: Smooth fade-in when image loads
- **Real-time Sliders**: Instant visual feedback
- **Glassmorphism**: Backdrop blur effects
- **Smooth Transitions**: All state changes animated
- **Loading States**: Spinner during upload/save
- **Hover Effects**: Interactive button states
- **Modal Animations**: Fade-in backdrop, slide-up content

## Testing Steps

1. Run migration
2. Restart backend server
3. Open a chat
4. Click three-dot menu → "Customize Theme"
5. Upload an image or adjust opacity/blur
6. Toggle "Show to Others"
7. Save and verify theme applies
8. Open same chat on another device - theme should sync
9. Have peer enable "Show to Others" and verify you see their theme

## Notes

- Themes are stored per-user, per-chat
- Each user can have different theme for same chat
- "Show to Others" allows peer to see your theme
- Images stored in R2/cloud storage
- Themes sync across all user's devices
- Maximum image size: 10 MB
