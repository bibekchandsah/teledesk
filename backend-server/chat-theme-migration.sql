-- Add chat theme customization to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS chat_themes JSONB DEFAULT '{}'::jsonb;

-- Chat themes structure:
-- {
--   "chatId": {
--     "backgroundImage": "url",
--     "backgroundColor": "#hex",
--     "opacity": 0.8,
--     "blur": 10,
--     "showToOthers": true
--   }
-- }

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_chat_themes ON users USING gin(chat_themes);

COMMENT ON COLUMN users.chat_themes IS 'Per-chat theme customization settings including background, opacity, and blur';
