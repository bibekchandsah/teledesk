# IMPORTANT: Run Database Migration First

Before testing the device sessions feature, you need to run the database migration:

## Step 1: Run the Migration

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy the contents of `backend-server/device-sessions-migration.sql`
4. Paste and execute the SQL

## Step 2: Add IP Info API Key (Optional)

1. Get a free API key from https://ipinfo.io/signup
2. Add to your `backend-server/.env` file:
   ```
   IPINFO_API_KEY=your-api-key-here
   ```

## Step 3: Restart Backend Server

After running the migration, restart your backend server to ensure all changes are loaded.

The 401 error you're seeing will be resolved once:
1. The database migration is complete
2. The backend server is restarted
3. The authentication token is properly retrieved from Firebase

## Testing

After completing these steps, you should be able to:
1. Go to Settings → Privacy & Security → Manage Devices
2. See your current device session
3. View location information (if API key is configured)
4. Test remote logout functionality