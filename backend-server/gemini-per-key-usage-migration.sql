-- SQL Migration: Add per-key AI usage tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_usage_counts INTEGER[] DEFAULT '{}';

-- Optional: Initial migration of current count to the first index of array
UPDATE users 
SET ai_usage_counts = ARRAY[ai_usage_count] 
WHERE ai_usage_count > 0 AND (ai_usage_counts IS NULL OR array_length(ai_usage_counts, 1) IS NULL);
