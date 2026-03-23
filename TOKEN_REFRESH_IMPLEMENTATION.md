# Token Refresh Implementation - Extended Sessions

## Problem
Firebase custom tokens expire after 1 hour, forcing users to re-login frequently. This is inconvenient compared to apps like Gmail, Facebook, and Instagram which maintain sessions for weeks/months.

## Solution
Implemented automatic token refresh mechanism that extends sessions indefinitely (until user explicitly logs out or account is removed).

## How It Works

### 1. Token Refresh Flow
```
User switches account → Check if token is valid
  ├─ Valid → Use existing token
  └─ Expired → Request new token from backend
       ├─ Success → Update stored token, continue
       └─ Failure → Show error modal, require re-login
```

### 2. Backend Changes

#### New Endpoint: `/api/auth/refresh-token`
- **Method**: POST
- **Auth**: Required (uses existing token)
- **Purpose**: Generate a fresh custom token for the authenticated user
- **Response**: `{ success: true, data: { token: string, uid: string } }`

**File**: `backend-server/src/controllers/authController.ts`
```typescript
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  // Validates user still exists
  // Generates fresh custom token
  // Returns new token
}
```

**File**: `backend-server/src/routes/authRoutes.ts`
```typescript
router.post('/refresh-token', authenticateToken, refreshToken);
```

### 3. Frontend Changes

#### Updated: `multiAccountService.ts`

**New Function**: `refreshAccountToken()`
```typescript
export const refreshAccountToken = async (uid: string, oldToken: string): Promise<string> => {
  // Calls backend /api/auth/refresh-token
  // Returns fresh token
}
```

**Updated Function**: `switchToAccount()`
```typescript
export const switchToAccount = async (account: StoredAccount): Promise<boolean> => {
  // 1. Validate current token
  // 2. If expired, call refreshAccountToken()
  // 3. Update stored token in multi-account storage
  // 4. Continue with account switch
}
```

## Benefits

### Before (1-hour sessions)
- User logs in → Token expires after 1 hour
- User switches account → Error: "Session expired"
- User must re-login every hour

### After (Extended sessions)
- User logs in → Token stored
- Token expires → Automatically refreshed in background
- User can switch accounts seamlessly for weeks/months
- Only requires re-login if:
  - User explicitly logs out
  - Account is removed
  - Backend refresh fails (user deleted, etc.)

## Session Duration

### Token Lifecycle
1. **Initial Login**: User logs in via Google/GitHub/Email
2. **Token Storage**: Custom token stored in multi-account storage
3. **Token Expiry**: Firebase custom tokens expire after 1 hour
4. **Auto Refresh**: When switching accounts, expired tokens are automatically refreshed
5. **Refresh Limit**: Tokens can be refreshed indefinitely as long as:
   - User account exists in Firebase
   - User hasn't been deleted/disabled
   - Backend is accessible

### Comparison with Other Apps
- **Gmail/Google**: Sessions last ~2 weeks to months (similar to our implementation)
- **Facebook**: Sessions last ~60 days
- **Instagram**: Sessions last ~90 days
- **TeleDesk**: Sessions last indefinitely with auto-refresh (until explicit logout)

## Security Considerations

### Token Security
- Tokens are stored locally in Electron's userData directory
- Each token is validated before use
- Expired tokens are refreshed, not reused
- Backend validates user exists before issuing new token

### Refresh Token Security
- Refresh requires valid (even if expired) token
- Backend checks user still exists and is active
- Failed refresh triggers re-login flow
- No refresh tokens stored (uses Firebase's internal mechanism)

## User Experience

### Seamless Account Switching
```
User clicks switch account
  ↓
Token validated
  ↓
If expired: Auto-refresh (invisible to user)
  ↓
Account switched successfully
```

### Only Requires Re-login When:
1. User explicitly logs out
2. User removes account
3. Account deleted from Firebase
4. Backend refresh endpoint fails

## Testing

### Test Scenarios
1. **Fresh Login**: Login → Switch accounts → Should work
2. **Expired Token**: Wait 1+ hour → Switch accounts → Should auto-refresh
3. **Deleted User**: Delete user from Firebase → Switch accounts → Should show error
4. **Offline**: Disconnect internet → Switch accounts → Should show error

### Expected Behavior
- ✅ Tokens refresh automatically when expired
- ✅ Users stay logged in for extended periods
- ✅ Error modal only shows when refresh fails
- ✅ Seamless experience like Gmail/Facebook

## Files Modified

### Backend
- `backend-server/src/controllers/authController.ts` - Added `refreshToken()` function
- `backend-server/src/routes/authRoutes.ts` - Added `/refresh-token` route

### Frontend
- `desktop-client/src/services/multiAccountService.ts` - Added auto-refresh logic
- `desktop-client/src/components/AccountSwitcher.tsx` - Already handles errors gracefully

## Migration

### Existing Users
- No migration needed
- Existing tokens will be refreshed on first switch attempt
- Old behavior (1-hour expiry) replaced with auto-refresh

### New Users
- Tokens automatically refresh from first login
- Extended sessions work out of the box

## Future Enhancements

### Possible Improvements
1. **Proactive Refresh**: Refresh tokens before they expire (e.g., at 50 minutes)
2. **Background Refresh**: Periodically refresh tokens for all stored accounts
3. **Refresh Token Storage**: Store Firebase refresh tokens for even longer sessions
4. **Session Analytics**: Track session duration and refresh frequency

### Not Implemented (Yet)
- Proactive refresh (tokens only refresh when needed)
- Background refresh for inactive accounts
- Configurable session duration
