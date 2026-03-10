# Device Sessions Setup Guide

This guide will help you set up the device session management feature that allows users to see their logged-in devices with location information and remotely log out from specific devices.

## 1. Database Migration

Run the device sessions migration in your Supabase SQL editor:

```sql
-- Copy and paste the contents of backend-server/device-sessions-migration.sql
-- into your Supabase SQL editor and execute it
```

Or run it directly:
```bash
# Navigate to your Supabase project SQL editor
# Copy the contents of backend-server/device-sessions-migration.sql
# Paste and execute
```

## 2. IP Geolocation API Setup (Optional but Recommended)

1. **Get a free API key from ipinfo.io:**
   - Visit https://ipinfo.io/signup
   - Sign up for a free account (50,000 requests/month)
   - Copy your API token

2. **Add to your backend .env file:**
   ```env
   IPINFO_API_KEY=your-ipinfo-api-key-here
   ```

3. **Without API key:**
   - The system will still work but won't show location information
   - Local/private IP addresses will show as "Local Network"

## 3. Features Included

### Backend Features:
- **Device Session Tracking**: Automatically tracks device sessions on login
- **IP Geolocation**: Shows city, region, and country for each device
- **Device Detection**: Identifies device type (desktop/mobile/web) and browser
- **Session Management**: APIs to list, revoke individual, or revoke all other sessions
- **Auto Cleanup**: Removes sessions older than 30 days automatically

### Frontend Features:
- **Device Sessions Page**: Accessible from Settings → Privacy & Security → Manage Devices
- **Current Session Highlighting**: Shows which device you're currently using
- **Location Display**: Shows city and country for each session
- **Remote Logout**: Log out from specific devices or all other devices at once
- **Real-time Updates**: Session list updates after logout actions
- **Security Warnings**: Alerts about unfamiliar devices

## 4. API Endpoints

- `GET /api/users/device-sessions` - Get all user's device sessions
- `DELETE /api/users/device-sessions/:sessionId` - Revoke specific session
- `DELETE /api/users/device-sessions/others/all` - Revoke all other sessions

**Note**: The routes are currently under `/api/users/` for deployment compatibility.

## 5. Security Features

- **Automatic Session Creation**: Sessions are created/updated on each authenticated request
- **Token-based Identification**: Uses Firebase token ID for session tracking
- **IP Address Logging**: Tracks IP addresses for security monitoring
- **User Agent Analysis**: Parses browser and OS information
- **Current Session Protection**: Cannot accidentally log out current session

## 6. Usage

1. **Access Device Sessions:**
   - Go to Settings → Privacy & Security → Manage Devices
   - Or navigate directly to `/device-sessions`

2. **View Active Sessions:**
   - See all devices where you're logged in
   - Current session is highlighted with a green border
   - View device type, location, and last activity

3. **Remote Logout:**
   - Click "Log out" on individual sessions
   - Use "Log out all others" to end all other sessions
   - Confirmation required for bulk logout

## 7. Troubleshooting

### No Location Information:
- Check if IPINFO_API_KEY is set in backend .env
- Verify API key is valid at ipinfo.io
- Local/private IPs will always show "Local Network"

### Sessions Not Appearing:
- Ensure device-sessions migration was run successfully
- Check backend logs for any database errors
- Verify authentication middleware is working

### Cannot Revoke Sessions:
- Check user permissions and authentication
- Verify session belongs to the current user
- Check backend API logs for errors

## 8. Privacy Notes

- **IP Address Storage**: IP addresses are stored for security purposes
- **Location Accuracy**: Location is approximate based on IP geolocation
- **Data Retention**: Sessions are automatically cleaned up after 30 days
- **User Control**: Users can revoke any session at any time

The device session management system provides users with full visibility and control over their account security across all devices.