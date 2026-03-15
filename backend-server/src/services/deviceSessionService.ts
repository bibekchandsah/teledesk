import { supabase } from '../config/supabase';
import { now } from '../utils/helpers';
import logger from '../utils/logger';

// Import socket.io for session revocation notifications
let io: any = null;
export const setSocketIO = (socketIO: any) => {
  io = socketIO;
};

export interface DeviceSession {
  sessionId: string;
  uid: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'web';
  ipAddress: string;
  locationCountry?: string;
  locationCity?: string;
  locationRegion?: string;
  userAgent: string;
  firebaseTokenId: string;
  createdAt: string;
  lastActive: string;
  isCurrent: boolean;
  isRevoked?: boolean;
}

type DeviceSessionRow = {
  session_id: string;
  uid: string;
  device_name: string;
  device_type: string;
  ip_address: string;
  location_country: string | null;
  location_city: string | null;
  location_region: string | null;
  user_agent: string;
  firebase_token_id: string;
  created_at: string;
  last_active: string;
  is_current: boolean;
  is_revoked?: boolean;
};

const rowToSession = (row: DeviceSessionRow): DeviceSession => ({
  sessionId: row.session_id,
  uid: row.uid,
  deviceName: row.device_name,
  deviceType: row.device_type as DeviceSession['deviceType'],
  ipAddress: row.ip_address,
  locationCountry: row.location_country || undefined,
  locationCity: row.location_city || undefined,
  locationRegion: row.location_region || undefined,
  userAgent: row.user_agent,
  firebaseTokenId: row.firebase_token_id,
  createdAt: row.created_at,
  lastActive: row.last_active,
  isCurrent: row.is_current,
  isRevoked: row.is_revoked || false,
});

// Get location info from IP using ipinfo.io API
async function getLocationFromIP(ipAddress: string): Promise<{
  country?: string;
  city?: string;
  region?: string;
}> {
  try {
    // Skip localhost/private IPs
    if (ipAddress === '127.0.0.1' || ipAddress === '::1' || ipAddress.startsWith('192.168.') || ipAddress.startsWith('10.')) {
      return { country: 'Local Network', city: 'Local', region: 'Local' };
    }

    const apiKey = process.env.IPINFO_API_KEY;
    if (!apiKey) {
      logger.warn('IPINFO_API_KEY not configured, skipping location lookup');
      return {};
    }

    const response = await fetch(`https://ipinfo.io/${ipAddress}?token=${apiKey}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as {
      country?: string;
      city?: string;
      region?: string;
    };
    return {
      country: data.country,
      city: data.city,
      region: data.region,
    };
  } catch (error) {
    logger.warn(`Failed to get location for IP ${ipAddress}: ${(error as Error).message}`);
    return {};
  }
}

// Parse device info from User-Agent
function parseDeviceInfo(userAgent: string): { deviceName: string; deviceType: DeviceSession['deviceType'] } {
  const ua = userAgent.toLowerCase();
  
  logger.debug(`Parsing device info for UA: ${userAgent}`);
  
  // Detect device type - check mobile first, then desktop app
  let deviceType: DeviceSession['deviceType'] = 'web';
  let deviceName = 'Unknown Device';
  
  // Check for mobile devices first (most specific)
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) {
    deviceType = 'mobile';
    
    // Mobile browser detection
    if (ua.includes('chrome') && ua.includes('android')) {
      deviceName = 'Chrome Mobile';
    } else if (ua.includes('firefox') && (ua.includes('mobile') || ua.includes('android'))) {
      deviceName = 'Firefox Mobile';
    } else if (ua.includes('safari') && (ua.includes('iphone') || ua.includes('ipad'))) {
      deviceName = 'Safari Mobile';
    } else if (ua.includes('edge') && ua.includes('mobile')) {
      deviceName = 'Edge Mobile';
    } else if (ua.includes('samsung')) {
      deviceName = 'Samsung Browser';
    } else if (ua.includes('android')) {
      deviceName = 'Android Browser';
    } else if (ua.includes('iphone') || ua.includes('ipad')) {
      deviceName = 'iOS Browser';
    } else {
      deviceName = 'Mobile Browser';
    }
    
    // Add mobile OS info
    if (ua.includes('android')) {
      deviceName += ' (Android)';
    } else if (ua.includes('iphone')) {
      deviceName += ' (iPhone)';
    } else if (ua.includes('ipad')) {
      deviceName += ' (iPad)';
    }
    
  } else if (ua.includes('electron')) {
    // Desktop application
    deviceType = 'desktop';
    deviceName = 'TeleDesk Desktop';
    
    // Add desktop OS info
    if (ua.includes('windows')) {
      deviceName += ' (Windows)';
    } else if (ua.includes('mac')) {
      deviceName += ' (macOS)';
    } else if (ua.includes('linux')) {
      deviceName += ' (Linux)';
    }
    
  } else {
    // Desktop web browsers
    deviceType = 'web';
    
    if (ua.includes('chrome') && !ua.includes('edge')) {
      deviceName = 'Chrome Browser';
    } else if (ua.includes('firefox')) {
      deviceName = 'Firefox Browser';
    } else if (ua.includes('safari') && !ua.includes('chrome')) {
      deviceName = 'Safari Browser';
    } else if (ua.includes('edge')) {
      deviceName = 'Edge Browser';
    } else if (ua.includes('opera')) {
      deviceName = 'Opera Browser';
    } else {
      deviceName = 'Web Browser';
    }
    
    // Add desktop OS info
    if (ua.includes('windows')) {
      deviceName += ' (Windows)';
    } else if (ua.includes('mac')) {
      deviceName += ' (macOS)';
    } else if (ua.includes('linux')) {
      deviceName += ' (Linux)';
    } else if (ua.includes('chromeos')) {
      deviceName += ' (Chrome OS)';
    }
  }

  logger.debug(`Parsed device: ${deviceName} (${deviceType}) from UA: ${ua.slice(0, 100)}`);
  return { deviceName, deviceType };
}

export const createDeviceSession = async (
  uid: string,
  firebaseTokenId: string,
  ipAddress: string,
  userAgent: string,
): Promise<DeviceSession> => {
  logger.info(`Creating device session for user ${uid} with fingerprint: ${firebaseTokenId}`);
  logger.debug(`User Agent: ${userAgent}`);
  logger.debug(`IP Address: ${ipAddress}`);
  
  const { deviceName, deviceType } = parseDeviceInfo(userAgent);
  const location = await getLocationFromIP(ipAddress);
  
  logger.info(`Detected device: ${deviceName} (${deviceType})`);
  
  // Check if a session with this fingerprint already exists (race condition protection)
  const existingSession = await getSessionByTokenId(firebaseTokenId);
  if (existingSession) {
    logger.info(`Found existing session for fingerprint ${firebaseTokenId}: ${existingSession.deviceName} (Revoked: ${existingSession.isRevoked})`);
    
    // Mark all other fingerprint groups as not current
    await supabase
      .from('device_sessions')
      .update({ is_current: false })
      .eq('uid', uid)
      .neq('firebase_token_id', firebaseTokenId);
    
    // Mark this fingerprint group as current and update activity
    // Note: We update BY fingerprint to ensure all rows in this group are consistent,
    // though ideally we'd target by session_id. For simplicity and robustness during lookup:
    await supabase
      .from('device_sessions')
      .update({ 
        is_current: true,
        last_active: now(),
        // If it was revoked, we keep it revoked! The middleware handles un-revocation.
        // We only "reactivate" activity here.
      })
      .eq('firebase_token_id', firebaseTokenId);
    
    // Return updated session
    const updatedSession = await getSessionByTokenId(firebaseTokenId);
    if (updatedSession) {
      logger.info(`Device session activity updated for user ${uid}: ${deviceName}`);
      return updatedSession;
    }
  }
  
  logger.info(`Creating new session for ${deviceName}`);
  
  // Mark all other sessions as not current
  await supabase
    .from('device_sessions')
    .update({ is_current: false })
    .eq('uid', uid);

  const sessionData = {
    uid,
    device_name: deviceName,
    device_type: deviceType,
    ip_address: ipAddress,
    location_country: location.country || null,
    location_city: location.city || null,
    location_region: location.region || null,
    user_agent: userAgent,
    firebase_token_id: firebaseTokenId,
    created_at: now(),
    last_active: now(),
    is_current: true,
  };

  const { data, error } = await supabase
    .from('device_sessions')
    .insert(sessionData)
    .select()
    .single();

  if (error) {
    logger.error(`Failed to insert session: ${error.message}`);
    // If it's a unique constraint violation, try to get the existing session
    if (error.code === '23505') {
      logger.warn(`Unique constraint violation for fingerprint ${firebaseTokenId}, trying to update existing`);
      const existingSession = await getSessionByTokenId(firebaseTokenId);
      if (existingSession) {
        // Mark this session as current
        await supabase
          .from('device_sessions')
          .update({ 
            is_current: true,
            last_active: now(),
            device_name: deviceName, // Update device name in case it changed
            device_type: deviceType,
            location_country: location.country || null,
            location_city: location.city || null,
            location_region: location.region || null,
          })
          .eq('firebase_token_id', firebaseTokenId);
        
        // Mark all others as not current
        await supabase
          .from('device_sessions')
          .update({ is_current: false })
          .eq('uid', uid)
          .neq('firebase_token_id', firebaseTokenId);
        
        const updatedSession = await getSessionByTokenId(firebaseTokenId);
        if (updatedSession) {
          logger.info(`Updated existing session for user ${uid}: ${deviceName}`);
          return updatedSession;
        }
      }
    }
    logger.error(`Failed to create device session: ${error.message}`);
    throw new Error('Failed to create device session');
  }

  logger.info(`Device session created for user ${uid}: ${deviceName} from ${location.city || 'Unknown'}`);
  return rowToSession(data as DeviceSessionRow);
};

export const updateSessionActivity = async (
  firebaseTokenId: string,
): Promise<void> => {
  await supabase
    .from('device_sessions')
    .update({ last_active: now() })
    .eq('firebase_token_id', firebaseTokenId);
};

export const getUserSessions = async (uid: string): Promise<DeviceSession[]> => {
  // First, clean up any duplicate sessions
  await cleanupDuplicateSessions(uid);
  
  const { data, error } = await supabase
    .from('device_sessions')
    .select('*')
    .eq('uid', uid)
    .order('last_active', { ascending: false });

  if (error) {
    logger.error(`Error fetching user sessions: ${error.message}`);
    return [];
  }

  const sessions = (data as DeviceSessionRow[])
    .map(rowToSession)
    .filter(session => !session.isRevoked); // Filter out revoked sessions here to prevent them displaying in the UI
  
  // Debug logging
  logger.debug(`Found ${sessions.length} sessions for user ${uid}:`);
  sessions.forEach(session => {
    logger.debug(`  - ${session.deviceName} (${session.deviceType}) - Current: ${session.isCurrent} - Fingerprint: ${session.firebaseTokenId}`);
  });
  
  return sessions;
};

export const revokeDeviceSession = async (
  uid: string,
  sessionId: string,
): Promise<boolean> => {
  logger.info(`Attempting to revoke session ${sessionId} for user ${uid}`);
  
  // Get session info before deleting for notification
  const { data: sessionData } = await supabase
    .from('device_sessions')
    .select('firebase_token_id')
    .eq('uid', uid)
    .eq('session_id', sessionId)
    .single();

  if (!sessionData) {
    logger.warn(`Session ${sessionId} not found for user ${uid}`);
    return false;
  }

  const { error } = await supabase
    .from('device_sessions')
    .update({ is_revoked: true })
    .eq('uid', uid)
    .eq('session_id', sessionId);

  if (error) {
    logger.error(`Failed to revoke device session in DB: ${error.message} (Code: ${error.code})`);
    return false;
  }

  logger.info(`Successfully marked session ${sessionId} as revoked in database`);

  // Notify the specific session to logout via socket
  if (io && sessionData) {
    const { SOCKET_EVENTS } = await import('../../../shared/constants/events');
    const { getSessionSockets } = await import('../sockets/socketManager');
    
    const sessionSockets = getSessionSockets();
    const sessionFingerprint = sessionData.firebase_token_id; // This is actually the session fingerprint
    const targetSocketId = sessionSockets.get(sessionFingerprint);
    
    logger.debug(`Attempting to revoke session: ${sessionFingerprint}`);
    logger.debug(`Available session sockets: ${JSON.stringify(Array.from(sessionSockets.keys()))}`);
    
    if (targetSocketId) {
      // Send to specific socket only
      io.to(targetSocketId).emit(SOCKET_EVENTS.SESSION_REVOKED, {
        sessionId,
        firebaseTokenId: sessionFingerprint,
        message: 'Your session has been revoked from another device. If this was not you, please check your active sessions.'
      });
      logger.info(`Sent session revocation to specific socket: ${targetSocketId} for session: ${sessionFingerprint}`);
    } else {
      logger.warn(`No active socket found for session fingerprint: ${sessionFingerprint}`);
      // List all current socket mappings for debugging
      logger.debug(`Current socket mappings: ${JSON.stringify(Array.from(sessionSockets.entries()))}`);
    }
  }

  logger.info(`Device session ${sessionId} revoked for user ${uid}`);
  return true;
};

export const revokeAllOtherSessions = async (
  uid: string,
  currentSessionId: string,
): Promise<number> => {
  logger.info(`Attempting to revoke all other sessions for user ${uid}, keeping current session: ${currentSessionId}`);
  
  // Get current session's firebase_token_id (session fingerprint) to exclude from notifications
  const { data: currentSessionData } = await supabase
    .from('device_sessions')
    .select('firebase_token_id')
    .eq('uid', uid)
    .eq('session_id', currentSessionId)
    .single();

  if (!currentSessionData) {
    logger.warn(`Current session ${currentSessionId} not found for user ${uid}`);
  }

  // Get session info before revoking for notifications
  const { data: sessionsToRevoke } = await supabase
    .from('device_sessions')
    .select('session_id, firebase_token_id')
    .eq('uid', uid)
    .neq('session_id', currentSessionId)
    .eq('is_revoked', false); // Only consider active sessions for revocation

  logger.info(`Found ${sessionsToRevoke?.length || 0} other sessions to revoke`);

  const { error } = await supabase
    .from('device_sessions')
    .update({ is_revoked: true })
    .eq('uid', uid)
    .neq('session_id', currentSessionId);

  if (error) {
    logger.error(`Failed to revoke other sessions in DB: ${error.message} (Code: ${error.code})`);
    return 0;
  }

  const count = sessionsToRevoke?.length || 0;
  logger.info(`Successfully deleted ${count} other sessions from database`);

  // Notify specific revoked sessions to logout via socket (exclude current session)
  if (io && sessionsToRevoke && sessionsToRevoke.length > 0) {
    const { SOCKET_EVENTS } = await import('../../../shared/constants/events');
    const { getSessionSockets } = await import('../sockets/socketManager');
    
    const sessionSockets = getSessionSockets();
    const currentSessionFingerprint = currentSessionData?.firebase_token_id;
    
    logger.debug(`Current session fingerprint: ${currentSessionFingerprint}`);
    logger.debug(`Sessions to revoke: ${JSON.stringify(sessionsToRevoke.map(s => s.firebase_token_id))}`);
    logger.debug(`Available session sockets: ${JSON.stringify(Array.from(sessionSockets.keys()))}`);
    
    let notificationsSent = 0;
    
    // Send force logout to each specific session that was revoked (excluding current)
    for (const session of sessionsToRevoke) {
      const sessionFingerprint = session.firebase_token_id;
      
      // Double-check we're not targeting the current session
      if (sessionFingerprint === currentSessionFingerprint) {
        logger.warn(`Skipping current session in revoke all others: ${sessionFingerprint}`);
        continue;
      }
      
      const targetSocketId = sessionSockets.get(sessionFingerprint);
      if (targetSocketId) {
        io.to(targetSocketId).emit(SOCKET_EVENTS.FORCE_LOGOUT, {
          message: 'You have been logged out from all other devices',
          sessionId: session.session_id
        });
        logger.info(`Sent force logout to socket: ${targetSocketId} for session: ${sessionFingerprint}`);
        notificationsSent++;
      } else {
        logger.debug(`No active socket found for session: ${sessionFingerprint}`);
      }
    }
    
    logger.info(`Sent ${notificationsSent} force logout notifications out of ${sessionsToRevoke.length} sessions`);
  }

  logger.info(`Revoked ${count} other sessions for user ${uid}, kept current session: ${currentSessionId}`);
  return count;
};

export const getSessionByTokenId = async (
  firebaseTokenId: string,
): Promise<DeviceSession | null> => {
  // Use limit(1) and ordering instead of .single() because soft-delete
  // might leave multiple rows with the same fingerprint in the DB.
  // We want the most recently active one (which would be the current or last known).
  const { data, error } = await supabase
    .from('device_sessions')
    .select('*')
    .eq('firebase_token_id', firebaseTokenId)
    .order('last_active', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    if (error && error.code !== 'PGRST116') { // Ignore "no rows" error
      logger.error(`Error searching for session by fingerprint: ${error.message}`);
    }
    return null;
  }

  return rowToSession(data[0] as DeviceSessionRow);
};

// Clean up duplicate sessions for a user (keep only the most recent ones)
export const cleanupDuplicateSessions = async (uid: string): Promise<void> => {
  try {
    // Get all sessions for the user
    const { data: sessions, error } = await supabase
      .from('device_sessions')
      .select('*')
      .eq('uid', uid)
      .order('last_active', { ascending: false });

    if (error || !sessions) return;

    // Group sessions by device fingerprint (same device/browser)
    const sessionGroups = new Map<string, DeviceSessionRow[]>();
    const crypto = require('crypto');
    
    for (const session of sessions as DeviceSessionRow[]) {
      // Use the same fingerprint logic as the middleware for consistency
      const deviceFingerprint = crypto.createHash('md5').update(session.user_agent).digest('hex');
      const sessionFingerprint = `${session.uid}_${deviceFingerprint}_${session.ip_address}`;
      
      if (!sessionGroups.has(sessionFingerprint)) {
        sessionGroups.set(sessionFingerprint, []);
      }
      sessionGroups.get(sessionFingerprint)!.push(session);
    }

    // For each device, keep only the most recent session
    const sessionsToDelete: string[] = [];
    
    for (const [, deviceSessions] of sessionGroups) {
      if (deviceSessions.length > 1) {
        // Sort by last_active and keep the first (most recent)
        deviceSessions.sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime());
        
        // Mark older sessions for deletion
        for (let i = 1; i < deviceSessions.length; i++) {
          sessionsToDelete.push(deviceSessions[i].session_id);
        }
      }
    }

    // Mark duplicate sessions as revoked
    if (sessionsToDelete.length > 0) {
      await supabase
        .from('device_sessions')
        .update({ is_revoked: true })
        .in('session_id', sessionsToDelete);
      
      logger.info(`Cleaned up ${sessionsToDelete.length} duplicate sessions for user ${uid} by marking them as revoked`);
    }
  } catch (error) {
    logger.warn(`Failed to cleanup duplicate sessions: ${(error as Error).message}`);
  }
};