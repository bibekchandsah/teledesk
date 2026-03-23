# TeleDesk Desktop - Quick Start

## Development

### Start Development Server
```bash
npm run electron:dev
```
- Loads `.env.development` automatically
- Backend: `http://localhost:3001`
- DevTools: Enabled
- Hot reload: Enabled

### Multiple Instances
You can now run multiple instances simultaneously! Just run the command again in a new terminal:
```bash
# Terminal 1
npm run electron:dev

# Terminal 2 (different account/testing)
npm run electron:dev
```

Each instance gets its own isolated data directory.

## Production Build

### Build Executable
```bash
npm run electron:build
```
- Loads `.env.production` automatically
- Backend: Production Railway URL
- DevTools: Disabled
- Output: `release/TeleDesk.exe`

## Environment Configuration

### Default Environments

**Development** (`.env.development`)
- Local backend: `http://localhost:3001`
- DevTools enabled
- Auto-loaded during `npm run electron:dev`

**Production** (`.env.production`)
- Railway backend: `https://teledesk-backend-production.up.railway.app`
- DevTools disabled
- Auto-loaded during `npm run electron:build`

### Personal Overrides

Create `.env.local` to override settings without modifying committed files:

```bash
# .env.local - Test against network backend
VITE_BACKEND_URL=http://192.168.1.100:3001
VITE_SOCKET_URL=http://192.168.1.100:3001
```

This file is ignored by git and has highest priority.

## Common Tasks

### Switch Backend URL (Temporary)
Create `.env.local`:
```bash
VITE_BACKEND_URL=http://10.5.234.63:3001
VITE_SOCKET_URL=http://10.5.234.63:3001
```

### Enable DevTools in Production Build
Edit `.env.production`:
```bash
ALLOW_DEVTOOLS=true
VITE_ALLOW_DEVTOOLS=true
```

### Clear Cache
Delete instance data:
```bash
# Windows
rmdir /s /q "%APPDATA%\teledesk-desktop\instances"

# Or manually delete:
C:\Users\<username>\AppData\Roaming\teledesk-desktop\instances\
```

## Troubleshooting

### Port 5173 already in use
This is normal if you're running multiple instances. Vite will auto-increment to 5174, 5175, etc.

### Wrong backend URL
Check console output:
```
[Main] Loaded .env from: <path>
[Env] Loaded from: <path>
```

Verify the correct env file is loaded.

### Changes not reflecting
1. Stop the dev server (Ctrl+C)
2. Rebuild: `npx tsc -p tsconfig.electron.json`
3. Restart: `npm run electron:dev`

### Database lock errors
Fixed! Each instance now uses its own data directory.

## File Structure

```
desktop-client/
├── .env.development      # Dev config (committed)
├── .env.production       # Prod config (committed)
├── .env.local           # Personal overrides (not committed)
├── .env.example         # Template
├── electron/
│   └── main.ts          # Smart env loading
└── src/
    └── ...
```

## Documentation

- **ENV_SETUP.md** - Complete environment configuration guide
- **QUICK_START.md** - This file
- **.env.example** - All available variables

## Need Help?

1. Check console logs for env file paths
2. Verify env files exist in `desktop-client/`
3. Ensure backend server is running (for development)
4. Check `ENV_SETUP.md` for detailed configuration
