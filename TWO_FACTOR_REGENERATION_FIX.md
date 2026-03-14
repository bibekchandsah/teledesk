# Two-Factor Authentication QR Regeneration Fix

## Problem
When users regenerated their 2FA QR code, the system had a critical flaw:
1. User enters current verification code to start regeneration
2. Backend immediately replaces the active secret with a new one
3. If user closes the modal before verifying the new QR code, they lose access
4. Old QR code no longer works, and new QR code wasn't saved to their authenticator app

## Solution
Implemented a "pending secret" system that keeps the old QR code active until the user successfully verifies the new one.

## Changes Made

### Database Migration
**File:** `backend-server/two-factor-pending-migration.sql`
- Added `two_factor_pending_secret` column
- Added `two_factor_pending_backup_codes` column

### Backend Changes

**File:** `backend-server/src/services/userService.ts`
1. Updated `UserRow` type to include pending fields
2. Modified `regenerate2FASecret()`:
   - Now stores new secret in `two_factor_pending_secret` instead of replacing active secret
   - Old secret remains active in `two_factor_secret`
3. Modified `verify2FACode()`:
   - Checks for pending secret first during verification
   - If pending secret exists, activates it and clears pending fields
   - If no pending secret, handles normal initial setup
4. Added `cancelPending2FA()`:
   - Clears pending secret fields when user cancels regeneration

**File:** `backend-server/src/controllers/userController.ts`
- Added `cancelPending2FAHandler()` endpoint handler

**File:** `backend-server/src/routes/userRoutes.ts`
- Added route: `POST /api/users/me/2fa/cancel-pending`

### Frontend Changes

**File:** `desktop-client/src/services/apiService.ts`
- Added `cancelPending2FA()` API function

**File:** `desktop-client/src/components/modals/TwoFactorSetupModal.tsx`
1. Imported `cancelPending2FA` function
2. Added `handleClose()` function:
   - Detects if user is in regeneration flow
   - Calls `cancelPending2FA()` if user closes modal before completing verification
3. Updated all close handlers to use `handleClose()` instead of `onClose()`

## How It Works Now

### Regeneration Flow
1. User clicks "Regenerate QR" button
2. User enters current 6-digit verification code
3. Backend verifies code against ACTIVE secret
4. Backend generates new secret and stores in `two_factor_pending_secret`
5. User sees new QR code
6. **Two possible outcomes:**
   - **User completes verification:** New secret moves from pending to active
   - **User closes modal:** Pending secret is cleared, old secret remains active

### Safety Features
- Old QR code continues working until new one is verified
- User can close modal at any time without losing access
- Pending secrets are automatically cleared on modal close
- No risk of account lockout during regeneration

## Testing Checklist

- [x] Database migration SQL created
- [x] Backend types updated
- [x] Backend service functions updated
- [x] Backend controller handler added
- [x] Backend route added
- [x] Frontend API service updated
- [x] Frontend modal updated
- [x] TypeScript compilation successful
- [ ] Database migration applied
- [ ] Manual testing: Regenerate and close modal (old code should work)
- [ ] Manual testing: Regenerate and complete verification (new code should work)

## Migration Instructions
See `backend-server/TWO_FACTOR_PENDING_MIGRATION_INSTRUCTIONS.md` for detailed migration steps.
