# Two-Factor Authentication (2FA) Implementation Guide

## Overview
Implement TOTP-based 2FA using Google Authenticator or Microsoft Authenticator apps.

## Features
- Enable/Disable 2FA in user profile settings
- QR code generation for authenticator app setup
- Backup codes for account recovery
- Regenerate QR code after verification (if lost)
- Mandatory 2FA verification after login when enabled
- Premium UI with smooth animations

## Technology Stack
- **Backend**: `speakeasy` (TOTP generation), `qrcode` (QR code generation)
- **Frontend**: React with premium modal UI
- **Database**: PostgreSQL (store secret, backup codes, enabled status)

## Implementation Steps

### 1. Database Schema
- Add columns to users table:
  - `two_factor_secret` (encrypted TOTP secret)
  - `two_factor_enabled` (boolean)
  - `two_factor_backup_codes` (array of hashed codes)

### 2. Backend API Endpoints
- `POST /api/users/me/2fa/setup` - Generate secret and QR code
- `POST /api/users/me/2fa/verify` - Verify TOTP code and enable 2FA
- `POST /api/users/me/2fa/disable` - Disable 2FA (requires TOTP code)
- `POST /api/users/me/2fa/regenerate` - Regenerate QR code (requires current TOTP)
- `POST /api/users/me/2fa/verify-login` - Verify TOTP during login
- `POST /api/users/me/2fa/verify-backup` - Verify backup code

### 3. Frontend Components
- TwoFactorSetupModal - Setup flow with QR code
- TwoFactorVerifyModal - Verify TOTP during login
- Settings page integration - Enable/Disable toggle

### 4. Authentication Flow
1. User logs in with email/password (Firebase Auth)
2. Backend checks if 2FA is enabled
3. If enabled, show TOTP verification modal
4. User enters 6-digit code from authenticator app
5. Backend verifies code
6. On success, complete login

## Security Considerations
- Secret stored encrypted in database
- Backup codes hashed (bcrypt)
- Rate limiting on verification attempts
- Backup codes can only be used once
- QR regeneration requires current valid TOTP

## User Experience
- Clear setup instructions
- QR code with app download links
- Backup codes displayed once and downloadable
- Option to use backup code if authenticator unavailable
- Premium animations and transitions
