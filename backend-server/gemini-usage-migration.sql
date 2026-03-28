-- SQL Migration: Add AI usage tracking columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_usage_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_usage_limit INTEGER DEFAULT 1500;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_usage_last_reset TIMESTAMPTZ DEFAULT now();

-- Ensure non-null constraints for tracking
UPDATE users SET ai_usage_count = 0 WHERE ai_usage_count IS NULL;
UPDATE users SET ai_usage_limit = 1500 WHERE ai_usage_limit IS NULL;
UPDATE users SET ai_usage_last_reset = now() WHERE ai_usage_last_reset IS NULL;
