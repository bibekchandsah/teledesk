-- Migration: Add drafts table for cross-device message drafts
-- This allows users to start typing on one device and continue on another

CREATE TABLE IF NOT EXISTS drafts (
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, chat_id),
  FOREIGN KEY (user_id) REFERENCES users(uid) ON DELETE CASCADE,
  FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts(updated_at);

-- Add comment
COMMENT ON TABLE drafts IS 'Stores message drafts synced across devices';
