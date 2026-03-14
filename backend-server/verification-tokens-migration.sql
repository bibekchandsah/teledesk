-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verification Tokens Table
CREATE TABLE IF NOT EXISTS verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    type TEXT NOT NULL, -- 'otp' or 'link'
    action TEXT NOT NULL, -- 'delete_account', 'reset_chat_pin', 'app_lock', 'two_factor'
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used_at TIMESTAMP WITH TIME ZONE,
    
    -- Index for faster cleanup and lookup
    CONSTRAINT verification_tokens_expiry_check CHECK (expires_at > created_at)
);

-- Index for identifying active tokens for a user
CREATE INDEX IF NOT EXISTS idx_verification_tokens_user_id ON verification_tokens(user_id) WHERE used_at IS NULL;

-- Index for token lookup
CREATE INDEX IF NOT EXISTS idx_verification_tokens_token_hash ON verification_tokens(token_hash);

-- Cleanup policy: You might want to run a cron job or similar to delete old expired tokens
-- For now, we will handle deletion of old tokens for a user when a new one is requested.
