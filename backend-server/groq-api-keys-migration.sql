-- SQL Migration: Add Groq API tracking arrays
ALTER TABLE users ADD COLUMN IF NOT EXISTS groq_api_keys TEXT[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS groq_usage_counts INTEGER[] DEFAULT '{}';
