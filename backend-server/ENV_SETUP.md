# Backend Environment Configuration Guide

## Overview

The TeleDesk backend uses environment-specific configuration files to separate development and production settings.

## Environment Files

### `.env.development` (Development)
- Automatically loaded when: `NODE_ENV=development` (default for `npm run dev`)
- Contains local development settings:
  - `PORT=3001`
  - `CORS_ORIGINS` includes localhost ports (5173, 5174, 5175 for multiple frontend instances)
  - `BACKEND_URL=http://localhost:3001`
- **Committed to git** for team consistency

### `.env.production` (Production)
- Automatically loaded when: `NODE_ENV=production` (`npm run build`, `npm start`)
- Contains production settings:
  - `BACKEND_URL=https://teledesk-backend-production.up.railway.app`
  - `CORS_ORIGINS` includes production frontend URLs
- **Committed to git** for deployment consistency

### `.env.local` (Local Overrides - Optional)
- Highest priority - overrides all other env files
- Use for personal/machine-specific settings
- **NOT committed to git** (in .gitignore)
- Useful for testing different configurations

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
npm run dev
# Sets NODE_ENV=development
# Automatically loads .env.development
# Server runs on localhost:3001
# CORS allows localhost:5173, 5174, 5175 (multiple frontend instances)
```

### Production Build & Start
```bash
npm run build
# Sets NODE_ENV=production
# Uses .env.production for build-time variables

npm start
# Sets NODE_ENV=production  
# Uses .env.production
# Server expects production URLs
```

### Personal Testing
Create `.env.local` to override any setting:
```bash
# .env.local - Test with different database
SUPABASE_URL=https://your-test-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-test-key
```

## Key Variables

### Server Configuration
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment mode (development/production)
- `BACKEND_URL` - Full backend URL for callbacks
- `CORS_ORIGINS` - Comma-separated allowed origins

### Authentication
- `JWT_SECRET` - JWT signing secret (CHANGE IN PRODUCTION!)
- `FIREBASE_*` - Firebase Admin SDK credentials

### Database & Storage
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `R2_*` - Cloudflare R2 storage credentials

### External Services
- `EMAIL_*` - Email service credentials
- `GOOGLE_CLIENT_*` - Google OAuth credentials
- `GITHUB_*` - GitHub OAuth credentials
- `IPINFO_API_KEY` - IP geolocation service

## Environment Differences

| Setting | Development | Production |
|---------|-------------|------------|
| `PORT` | 3001 | 3001 |
| `BACKEND_URL` | localhost:3001 | Railway URL |
| `CORS_ORIGINS` | localhost:5173,5174,5175 | Production domains |
| `NODE_ENV` | development | production |

## Best Practices

1. **Never commit `.env.local`** - It's for personal use only
2. **Keep secrets in sync** - Only URLs and CORS should differ between environments
3. **Update `.env.example`** when adding new variables
4. **Use `.env.local` for testing** - Don't modify committed env files
5. **Change JWT_SECRET in production** - Use a strong, unique secret

## Multiple Frontend Instances Support

The development environment includes CORS origins for multiple ports:
```bash
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:5174,http://localhost:5175
```

This allows multiple desktop client instances to connect simultaneously.

## Troubleshooting

### Wrong environment loaded?
Check console output:
```
[Backend] Environment: development
[Backend] Loaded env from: .env.development
```

### CORS errors?
1. Check `CORS_ORIGINS` includes your frontend URL
2. Restart backend after env changes
3. Verify NODE_ENV is set correctly

### Variables not updating?
1. Restart the server: `npm run dev`
2. Check file exists: `backend-server/.env.development`
3. Verify NODE_ENV: `echo $NODE_ENV` (Linux/Mac) or `echo %NODE_ENV%` (Windows)

### Database connection issues?
1. Verify Supabase credentials in the correct env file
2. Check network connectivity
3. Ensure service role key has proper permissions

## Deployment Notes

### Railway Deployment
Railway automatically sets `NODE_ENV=production`, so `.env.production` will be loaded.

### Environment Variables in Railway
You can override any setting in Railway's environment variables panel. Railway variables take precedence over `.env.production`.

### Security
- Never commit real secrets to git
- Use Railway's environment variables for sensitive production data
- Rotate keys regularly
- Use different Firebase projects for dev/prod if possible