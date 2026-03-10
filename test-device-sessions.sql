-- Test if device_sessions table exists and check its structure
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'device_sessions' 
ORDER BY ordinal_position;

-- Check if there are any existing device sessions
SELECT COUNT(*) as session_count FROM device_sessions;