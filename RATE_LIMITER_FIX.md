# Rate Limiter 429 Error Fix

## Problem

Getting "429 (Too Many Requests)" errors when:
- Loading the app
- Switching accounts
- React Strict Mode running effects twice in development

## Root Cause

1. **React Strict Mode**: In development, React runs effects twice to help detect bugs
2. **Multi-Account Feature**: Account switching triggers multiple API calls
3. **Low Rate Limits**: 200 requests per 15 minutes was too restrictive for development
4. **Localhost Not Excluded**: Rate limiter was counting localhost requests

## Solution

Updated rate limiter to be more lenient in development:

### 1. Higher Limits in Development
```typescript
const isDev = process.env.NODE_ENV === 'development';

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 1000 : 200, // 5x higher in dev
});
```

### 2. Skip Localhost in Development
```typescript
skip: (req) => {
  // Skip rate limiting for localhost in development
  if (isDev && (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1')) {
    return true;
  }
  return false;
},
```

### 3. Updated All Rate Limiters
- **Global**: 200 → 1000 (dev)
- **Auth**: 20 → 100 (dev)
- **Upload**: 10 → 50 (dev)

## Rate Limits

### Development
- Global: 1000 requests / 15 minutes
- Auth: 100 requests / 15 minutes
- Upload: 50 requests / 1 minute
- Localhost: Unlimited (skipped)

### Production
- Global: 200 requests / 15 minutes
- Auth: 20 requests / 15 minutes
- Upload: 10 requests / 1 minute
- All IPs: Rate limited

## Why This Happens

### React Strict Mode
In development, React intentionally:
1. Mounts components twice
2. Runs effects twice
3. Calls functions twice

This helps detect bugs but doubles API calls.

### Multi-Account Feature
When switching accounts:
1. Fetch user profile
2. Fetch chats
3. Fetch saved messages
4. Sync with backend
5. Initialize socket

Each action = multiple API calls.

### Combined Effect
React Strict Mode × Multi-Account = Many rapid requests

## Testing

### Before Fix
```
Load app → 429 error
Switch account → 429 error
Refresh page → 429 error
```

### After Fix
```
Load app → ✅ Works
Switch account → ✅ Works
Refresh page → ✅ Works
Multiple refreshes → ✅ Works
```

## Production Safety

The fix only affects development:
- Production still has strict limits
- Localhost skip only in development
- Production security unchanged

## Alternative Solutions

If you still hit rate limits:

### 1. Disable React Strict Mode
```tsx
// main.tsx
<React.StrictMode>  // Remove this
  <App />
</React.StrictMode>  // Remove this
```

### 2. Debounce API Calls
```typescript
const debouncedFetch = debounce(fetchData, 300);
```

### 3. Cache Responses
```typescript
const cache = new Map();
if (cache.has(key)) return cache.get(key);
```

### 4. Batch Requests
```typescript
const results = await Promise.all([
  fetchChats(),
  fetchMessages(),
  fetchUsers(),
]);
```

## Status

🟢 **FIXED**

Rate limiter now allows sufficient requests for development while maintaining security in production.

## Restart Required

After updating the rate limiter, restart your backend server:
```bash
cd backend-server
npm run dev
```
