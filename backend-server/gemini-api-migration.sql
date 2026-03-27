-- Migration to add Gemini AI configuration to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS gemini_api_key text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_suggestions_enabled boolean DEFAULT false;
