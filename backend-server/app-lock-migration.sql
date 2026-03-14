-- Add app lock PIN columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS app_lock_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS app_lock_pin TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_app_lock_enabled ON users(app_lock_enabled);

-- Update existing users to have app lock disabled by default
UPDATE users SET app_lock_enabled = FALSE WHERE app_lock_enabled IS NULL;
