import { supabase } from '../config/supabase';
import { now } from '../utils/helpers';
import logger from '../utils/logger';

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

    const data = await response.json();
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
  
  // Detect device type
  let deviceType: DeviceSession['deviceType'] = 'web';
  if (ua.includes('electron')) {
    deviceType = 'desktop';
  } else if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) {
    deviceType = 'mobile';
  }

  // Parse device name
  let deviceName = 'Unknown Device';
  
  if (ua.includes('electron')) {
    deviceName = 'TeleDesk Desktop';
  } else if (ua.includes('chrome')) {
    deviceName = 'Chrome Browser';
  } else if (ua.includes('firefox')) {
    deviceName = 'Firefox Browser';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    deviceName = 'Safari Browser';
  } else if (ua.includes('edge')) {
    deviceName = 'Edge Browser';
  }

  // Add OS info
  if (ua.includes('windows')) {
    deviceName += ' (Windows)';
  } else if (ua.includes('mac')) {
    deviceName += ' (macOS)';
  } else if (ua.includes('linux')) {
    deviceName += ' (Linux)';
  } else if (ua.includes('android')) {
    deviceName += ' (Android)';
  } else if (ua.includes('iphone') || ua.includes('ipad')) {
    deviceName += ' (iOS)';
  }

  return { deviceName, deviceType };
}

export const createDeviceSession = async (
  uid: string,
  firebaseTokenId: string,
  ipAddress: string,
  userAgent: string,
): Promise<DeviceSession> => {
  const { deviceName, deviceType } = parseDeviceInfo(userAgent);
  const location = await getLocationFromIP(ipAddress);
  
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
  const { data, error } = await supabase
    .from('device_sessions')
    .select('*')
    .eq('uid', uid)
    .order('last_active', { ascending: false });

  if (error) {
    logger.error(`Failed to get user sessions: ${error.message}`);
    throw new Error('Failed to get user sessions');
  }

  return (data as DeviceSessionRow[]).map(rowToSession);
};

export const revokeDeviceSession = async (
  uid: string,
  sessionId: string,
): Promise<boolean> => {
  const { error } = await supabase
    .from('device_sessions')
    .delete()
    .eq('uid', uid)
    .eq('session_id', sessionId);

  if (error) {
    logger.error(`Failed to revoke device session: ${error.message}`);
    return false;
  }

  logger.info(`Device session ${sessionId} revoked for user ${uid}`);
  return true;
};

export const revokeAllOtherSessions = async (
  uid: string,
  currentSessionId: string,
): Promise<number> => {
  const { data, error } = await supabase
    .from('device_sessions')
    .delete()
    .eq('uid', uid)
    .neq('session_id', currentSessionId)
    .select('session_id');

  if (error) {
    logger.error(`Failed to revoke other sessions: ${error.message}`);
    return 0;
  }

  const count = data?.length || 0;
  logger.info(`Revoked ${count} other sessions for user ${uid}`);
  return count;
};

export const getSessionByTokenId = async (
  firebaseTokenId: string,
): Promise<DeviceSession | null> => {
  const { data, error } = await supabase
    .from('device_sessions')
    .select('*')
    .eq('firebase_token_id', firebaseTokenId)
    .single();

  if (error || !data) {
    return null;
  }

  return rowToSession(data as DeviceSessionRow);
};