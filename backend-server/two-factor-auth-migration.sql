-- Add Two-Factor Authentication columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS two_factor_secret TEXT,
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[];

-- Add index for faster 2FA lookups
CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled ON users(two_factor_enabled) WHERE two_factor_enabled = TRUE;

COMMENT ON COLUMN users.two_factor_secret IS 'Encrypted TOTP secret for two-factor authentication';
COMMENT ON COLUMN users.two_factor_enabled IS 'Whether two-factor authentication is enabled for this user';
COMMENT ON COLUMN users.two_factor_backup_codes IS 'Array of hashed backup codes for account recovery';
