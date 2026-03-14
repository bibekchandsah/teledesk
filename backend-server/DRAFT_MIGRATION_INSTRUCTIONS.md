# Draft Messages Migration Instructions

The draft messages feature requires a new database table. Follow these steps to enable it:

## Option 1: Using psql command line

```bash
# Navigate to the backend-server directory
cd backend-server

# Run the migration (replace with your database credentials)
psql -U your_username -d your_database_name -f drafts-migration.sql
```

## Option 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `drafts-migration.sql`
4. Paste and run the SQL

## Option 3: Using your database client

Open `drafts-migration.sql` and execute the SQL in your preferred database client (DBeaver, pgAdmin, etc.)

## Verification

After running the migration, restart your backend server. The draft feature should now work without errors.

## Note

The feature will work without the migration (drafts just won't persist), but you'll see warnings in the backend logs. To fully enable cross-device draft syncing, you must run the migration.
