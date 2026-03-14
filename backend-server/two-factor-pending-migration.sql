-- Migration: Add pending secret field for 2FA regeneration
-- This allows users to regenerate QR codes without losing access if they don't complete verification

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS two_factor_pending_secret TEXT,
ADD COLUMN IF NOT EXISTS two_factor_pending_backup_codes TEXT[];

COMMENT ON COLUMN users.two_factor_pending_secret IS 'Temporary TOTP secret during QR regeneration, activated only after verification';
COMMENT ON COLUMN users.two_factor_pending_backup_codes IS 'Temporary backup codes during QR regeneration, activated only after verification';
