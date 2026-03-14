# Two-Factor Authentication Pending Secret Migration

## Overview
This migration adds support for safe QR code regeneration by introducing pending secret fields. This prevents users from losing access to their accounts if they close the regeneration modal before completing verification.

## What Changed

### Database Changes
- Added `two_factor_pending_secret` column to store temporary secret during regeneration
- Added `two_factor_pending_backup_codes` column to store temporary backup codes during regeneration

### Backend Changes
- Updated `regenerate2FASecret()` to store new secret in pending fields instead of replacing active secret
- Updated `verify2FACode()` to activate pending secret when user completes verification
- Added `cancelPending2FA()` function to clear pending secrets if user cancels
- Added new API endpoint: `POST /api/users/me/2fa/cancel-pending`

### Frontend Changes
- Updated `TwoFactorSetupModal` to call `cancelPending2FA()` when user closes modal during regeneration
- Added `cancelPending2FA()` API service function

## How to Apply Migration

### Step 1: Run SQL Migration
Execute the SQL migration file against your Supabase database:

```bash
psql -h <your-supabase-host> -U postgres -d postgres -f two-factor-pending-migration.sql
```

Or run it directly in Supabase SQL Editor:
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `two-factor-pending-migration.sql`
3. Execute the query

### Step 2: Restart Backend Server
The backend code changes are already in place. Simply restart your server:

```bash
cd backend-server
npm run dev
```

### Step 3: Test the Feature
1. Enable 2FA for a test account
2. Go to Settings → Two-Factor Authentication
3. Click "Regenerate QR"
4. Enter current verification code
5. Close the modal WITHOUT verifying the new QR code
6. Try logging in with your OLD authenticator code - it should still work!
7. Regenerate again and complete the verification - new code should now be active

## How It Works

### Before (Problem)
1. User clicks "Regenerate QR"
2. User enters current verification code
3. Backend immediately replaces active secret with new one and sets `two_factor_enabled: false`
4. User closes modal without verifying
5. User is now locked out - old QR doesn't work, new QR wasn't saved

### After (Solution)
1. User clicks "Regenerate QR"
2. User enters current verification code
3. Backend stores new secret in `two_factor_pending_secret` (old secret remains active)
4. User can close modal - old QR still works
5. When user completes verification, pending secret becomes active
6. If user closes modal, pending secret is cleared automatically

## Rollback
If you need to rollback this migration:

```sql
ALTER TABLE users 
DROP COLUMN IF EXISTS two_factor_pending_secret,
DROP COLUMN IF EXISTS two_factor_pending_backup_codes;
```

Note: Rolling back will break the regeneration safety feature, but existing 2FA functionality will continue to work.
