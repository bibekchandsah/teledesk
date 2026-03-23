# Environment Configuration Guide

## Overview

TeleDesk uses environment-specific configuration files to separate development and production settings.

## Environment Files

### `.env.development` (Development)
- Automatically loaded during: `npm run dev`, `npm run electron:dev`
- Contains local development settings (localhost URLs, DevTools enabled)
- **Committed to git** for team consistency

### `.env.production` (Production)
- Automatically loaded during: `npm run build`, `npm run electron:build`
- Contains production settings (production URLs, DevTools disabled)
- **Committed to git** for team consistency

### `.env.local` (Local Overrides - Optional)
- Highest priority - overrides all other env files
- Use for personal/machine-specific settings
- **NOT committed to git** (in .gitignore)
- Useful for testing different backends without modifying committed files

### `.env.example` (Template)
- Template showing all available environment variables
- **Committed to git** for documentation

## File Priority (Highest to Lowest)

1. `.env.local` (personal overrides)
2. `.env.development` or `.env.production` (based on NODE_ENV)
3. `.env` (fallback, legacy)

## Usage

### Development
```bash
npm run electron:dev
# Automatically loads .env.development
# Backend: http://localhost:3001
# DevTools: Enabled
```

### Production Build
```bash
npm run electron:build
# Automatically loads .env.production
# Backend: https://teledesk-backend-production.up.railway.app
# DevTools: Disabled
```

### Personal Overrides
Create `.env.local` to override any setting:
```bash
# .env.local - Test against a different backend
VITE_BACKEND_URL=http://192.168.1.100:3001
VITE_SOCKET_URL=http://192.168.1.100:3001
```

## Key Variables

### Backend Configuration
- `VITE_BACKEND_URL` - REST API endpoint
- `VITE_SOCKET_URL` - WebSocket endpoint

### Firebase (Authentication)
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

### Supabase (Real-time)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### WebRTC (Video/Voice Calls)
- `VITE_TURN_URL`
- `VITE_TURN_USERNAME`
- `VITE_TURN_CREDENTIAL`

### Development Tools
- `ALLOW_DEVTOOLS` - Enable Electron DevTools (main process)
- `VITE_ALLOW_DEVTOOLS` - Enable DevTools UI (renderer process)

### APIs
- `VITE_GIPHY_API_KEY` - Giphy integration
- `GITHUB_TOKEN` - For checking app updates

## Best Practices

1. **Never commit `.env.local`** - It's for personal use only
2. **Keep `.env.development` and `.env.production` in sync** - Only URLs and DevTools should differ
3. **Update `.env.example`** when adding new variables
4. **Use `.env.local` for testing** - Don't modify committed env files for temporary tests
5. **Sensitive tokens** - Consider using environment-specific tokens in production

## Troubleshooting

### Wrong environment loaded?
Check console output:
```
[Main] Loaded .env from: <path>
[Env] Loaded from: <path>
```

### Variables not updating?
1. Restart the dev server completely
2. Clear Electron cache: Delete `AppData/Roaming/teledesk-desktop/instances/`
3. Rebuild: `npx tsc -p tsconfig.electron.json`

### Multiple instances?
Each instance gets its own data directory to avoid conflicts. This is normal and allows running multiple windows simultaneously.
