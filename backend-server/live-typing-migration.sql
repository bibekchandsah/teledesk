-- Add show_live_typing column to users table
-- Default true so existing users keep the current behavior
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_live_typing BOOLEAN NOT NULL DEFAULT TRUE;
