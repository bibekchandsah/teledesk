-- SQL Migration: Add multi-key support for Gemini
ALTER TABLE users ADD COLUMN IF NOT EXISTS gemini_api_keys TEXT[] DEFAULT '{}';

-- Optional: Initial migration of single key to array if single key exists
UPDATE users 
SET gemini_api_keys = ARRAY[gemini_api_key] 
WHERE gemini_api_key IS NOT NULL AND (gemini_api_keys IS NULL OR array_length(gemini_api_keys, 1) IS NULL);
