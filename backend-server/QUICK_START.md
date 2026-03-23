# TeleDesk Backend - Quick Start

## Development

### Start Development Server
```bash
npm run dev
```
- Loads `.env.development` automatically
- Server: `http://localhost:3001`
- CORS: Allows multiple frontend instances (ports 5173, 5174, 5175)
- Hot reload: Enabled via ts-node-dev

### Multiple Frontend Support
The backend automatically supports multiple frontend instances:
- Desktop client on port 5173
- Another desktop instance on port 5174
- Web client on port 3000
- All configured in `CORS_ORIGINS`

## Production

### Build & Start
```bash
npm run build
npm start
```
- Loads `.env.production` automatically
- Server: Production Railway URL
- CORS: Production domains only

## Environment Configuration

### Default Environments

**Development** (`.env.development`)
- Local server: `http://localhost:3001`
- CORS: Multiple localhost ports
- Auto-loaded during `npm run dev`

**Production** (`.env.production`)
- Railway server: `https://teledesk-backend-production.up.railway.app`
- CORS: Production domains
- Auto-loaded during `npm run build` and `npm start`

### Personal Overrides

Create `.env.local` to override settings without modifying committed files:

```bash
# .env.local - Test with different database
SUPABASE_URL=https://your-test-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-test-key

# Or test with different port
PORT=3002
```

## API Endpoints

### Health Check
```bash
GET http://localhost:3001/api/health
```

### Authentication
```bash
POST http://localhost:3001/api/auth/login
POST http://localhost:3001/api/auth/register
```

### Users
```bash
GET http://localhost:3001/api/users/profile
PUT http://localhost:3001/api/users/profile
```

### Chats
```bash
GET http://localhost:3001/api/chats
POST http://localhost:3001/api/chats
```

## Database Setup

### Supabase Tables
The backend expects these Supabase tables:
- `users` - User profiles
- `chats` - Chat rooms
- `messages` - Chat messages
- `device_sessions` - Device management
- `drafts` - Message drafts

### Migrations
SQL migration files are in the root directory:
- `supabase-migration.sql` - Main schema
- `device-sessions-migration.sql` - Device sessions
- `drafts-migration.sql` - Drafts feature
- And others...

## File Storage

### Cloudflare R2
- Avatars: `avatars/{userId}.{ext}`
- Chat files: `files/{chatId}/{messageId}/{filename}`
- Public URL: `https://pub-{hash}.r2.dev`

## WebSocket Events

### Connection
```javascript
const socket = io('http://localhost:3001');
```

### Chat Events
- `join-chat` - Join a chat room
- `leave-chat` - Leave a chat room
- `send-message` - Send a message
- `message-received` - Receive a message

### Call Events
- `call-offer` - Initiate call
- `call-answer` - Answer call
- `call-end` - End call

## Common Tasks

### Add New Environment Variable
1. Add to `.env.development` and `.env.production`
2. Update `.env.example`
3. Document in `ENV_SETUP.md`
4. Use in code: `process.env.YOUR_VAR`

### Test with Different Database
Create `.env.local`:
```bash
SUPABASE_URL=https://your-test-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-test-service-key
```

### Change Server Port
Create `.env.local`:
```bash
PORT=3002
```
Don't forget to update frontend `VITE_BACKEND_URL` too!

### Enable Debug Logging
Create `.env.local`:
```bash
LOG_LEVEL=debug
```

## Troubleshooting

### Port 3001 already in use
```bash
# Find process using port 3001
netstat -ano | findstr :3001

# Kill the process (Windows)
taskkill /PID <process_id> /F

# Or use different port in .env.local
PORT=3002
```

### CORS errors from frontend
1. Check `CORS_ORIGINS` includes your frontend URL
2. Restart backend after env changes
3. Verify frontend is using correct backend URL

### Database connection failed
1. Check Supabase credentials in env file
2. Verify service role key permissions
3. Test connection: `curl https://your-project.supabase.co/rest/v1/`

### File upload errors
1. Check R2 credentials in env file
2. Verify bucket exists and is public
3. Test R2 connection in AWS CLI

### Environment not loading
Check console output:
```
[Backend] Environment: development
[Backend] Loaded env from: .env.development
```

If wrong file is loaded:
1. Verify NODE_ENV: `npm run dev` sets it to `development`
2. Check file exists: `backend-server/.env.development`
3. Restart server completely

## File Structure

```
backend-server/
├── .env.development      # Dev config (committed)
├── .env.production       # Prod config (committed)
├── .env.local           # Personal overrides (not committed)
├── .env.example         # Template
├── src/
│   ├── server.ts        # Main server with env loading
│   ├── config/          # Configuration files
│   ├── controllers/     # Route handlers
│   ├── middleware/      # Express middleware
│   ├── routes/          # API routes
│   └── services/        # Business logic
└── dist/                # Compiled JavaScript
```

## Documentation

- **ENV_SETUP.md** - Complete environment configuration guide
- **QUICK_START.md** - This file
- **.env.example** - All available variables

## Need Help?

1. Check console logs for environment loading
2. Verify env files exist in `backend-server/`
3. Ensure database and external services are accessible
4. Check `ENV_SETUP.md` for detailed configuration
5. Test API endpoints with curl or Postman