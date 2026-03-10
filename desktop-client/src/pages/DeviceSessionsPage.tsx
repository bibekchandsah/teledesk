import React, { useEffect, useState } from 'react';
import { DeviceSession } from '@shared/types';
import { getDeviceSessions, revokeDeviceSession, revokeAllOtherSessions, cleanupDuplicateSessions } from '../services/deviceSessionService';
import { Monitor, Smartphone, Globe, MapPin, Clock, Shield, Trash2, LogOut } from 'lucide-react';
import { formatTime } from '../utils/formatters';

const DeviceSessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    const response = await getDeviceSessions();
    if (response.success && response.data) {
      setSessions(response.data);
    } else {
      console.error('Failed to load device sessions:', response.error);
      // Show user-friendly error message
      if (response.error?.includes('401') || response.error?.includes('Unauthorized')) {
        alert('Authentication error. Please try logging out and logging back in.');
      } else if (response.error?.includes('table') || response.error?.includes('relation')) {
        alert('Database not set up. Please run the device sessions migration first.');
      } else {
        alert('Failed to load device sessions: ' + (response.error || 'Unknown error'));
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleRevokeSession = async (sessionId: string) => {
    setRevoking(sessionId);
    const response = await revokeDeviceSession(sessionId);
    if (response.success) {
      setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
    } else {
      alert('Failed to revoke session: ' + (response.error || 'Unknown error'));
    }
    setRevoking(null);
  };

  const handleCleanupDuplicates = async () => {
    setCleaningUp(true);
    const response = await cleanupDuplicateSessions();
    if (response.success) {
      await loadSessions(); // Reload to show cleaned up list
      alert(`Duplicate sessions cleaned up successfully. ${response.data?.sessionCount || 0} sessions remaining.`);
    } else {
      alert('Failed to cleanup duplicate sessions: ' + (response.error || 'Unknown error'));
    }
    setCleaningUp(false);
  };
  const handleRevokeAllOthers = async () => {
    if (!confirm('Are you sure you want to log out all other devices? This will end all other active sessions.')) {
      return;
    }

    setRevokingAll(true);
    const response = await revokeAllOtherSessions();
    if (response.success) {
      await loadSessions(); // Reload to show updated list
      alert(`Successfully logged out ${response.data?.revokedCount || 0} other devices.`);
    } else {
      alert('Failed to revoke other sessions: ' + (response.error || 'Unknown error'));
    }
    setRevokingAll(false);
  };

  const getDeviceIcon = (deviceType: DeviceSession['deviceType']) => {
    switch (deviceType) {
      case 'desktop':
        return <Monitor size={20} />;
      case 'mobile':
        return <Smartphone size={20} />;
      case 'web':
      default:
        return <Globe size={20} />;
    }
  };

  const getLocationDisplay = (session: DeviceSession) => {
    if (session.locationCity && session.locationCountry) {
      return `${session.locationCity}, ${session.locationCountry}`;
    }
    if (session.locationCountry) {
      return session.locationCountry;
    }
    return 'Unknown Location';
  };

  const formatLastActive = (lastActive: string) => {
    const now = new Date();
    const activeTime = new Date(lastActive);
    const diffMs = now.getTime() - activeTime.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Active now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatTime(lastActive);
  };

  if (loading) {
    return (
      <div style={{ 
        padding: 24, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: 'var(--text-secondary)' 
      }}>
        Loading device sessions...
      </div>
    );
  }

  const currentSession = sessions.find(s => s.isCurrent);
  const otherSessions = sessions.filter(s => !s.isCurrent);

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ margin: 0, marginBottom: 8, color: 'var(--text-primary)' }}>
          Device Sessions
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
          Manage your active sessions across all devices. You can log out from specific devices or all other devices at once.
        </p>
      </div>

      {/* Current Session */}
      {currentSession && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ 
            margin: 0, 
            marginBottom: 16, 
            color: 'var(--text-primary)', 
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <Shield size={16} style={{ color: 'var(--accent)' }} />
            Current Session
          </h3>
          
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '2px solid var(--accent)',
            borderRadius: 12,
            padding: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ color: 'var(--accent)', marginTop: 2 }}>
                {getDeviceIcon(currentSession.deviceType)}
              </div>
              
              <div style={{ flex: 1 }}>
                <div style={{ 
                  fontWeight: 600, 
                  color: 'var(--text-primary)', 
                  marginBottom: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  {currentSession.deviceName}
                  <span style={{
                    backgroundColor: 'var(--accent)',
                    color: 'white',
                    fontSize: 10,
                    fontWeight: 500,
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}>
                    CURRENT
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <MapPin size={12} />
                    {getLocationDisplay(currentSession)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <Clock size={12} />
                    {formatLastActive(currentSession.lastActive)}
                  </div>
                </div>
                
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  IP: {currentSession.ipAddress}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Other Sessions */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: 16 
        }}>
          <h3 style={{ 
            margin: 0, 
            color: 'var(--text-primary)', 
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            Other Sessions ({otherSessions.length})
          </h3>
          
          <div style={{ display: 'flex', gap: 8 }}>
            {sessions.length > 2 && (
              <button
                onClick={handleCleanupDuplicates}
                disabled={cleaningUp}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: cleaningUp ? 'not-allowed' : 'pointer',
                  opacity: cleaningUp ? 0.6 : 1,
                }}
                title="Remove duplicate sessions from the same device"
              >
                {cleaningUp ? 'Cleaning...' : 'Clean Duplicates'}
              </button>
            )}
            
            {otherSessions.length > 0 && (
              <button
                onClick={handleRevokeAllOthers}
                disabled={revokingAll}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  backgroundColor: 'var(--error)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: revokingAll ? 'not-allowed' : 'pointer',
                  opacity: revokingAll ? 0.6 : 1,
                }}
              >
                <LogOut size={14} />
                {revokingAll ? 'Logging out...' : 'Log out all others'}
              </button>
            )}
          </div>
        </div>

        {otherSessions.length === 0 ? (
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 32,
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}>
            <Monitor size={32} style={{ opacity: 0.5, marginBottom: 12 }} />
            <p style={{ margin: 0, fontSize: 14 }}>
              No other active sessions found.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {otherSessions.map((session) => (
              <div
                key={session.sessionId}
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                }}
              >
                <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                  {getDeviceIcon(session.deviceType)}
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontWeight: 600, 
                    color: 'var(--text-primary)', 
                    marginBottom: 4 
                  }}>
                    {session.deviceName}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                      <MapPin size={12} />
                      {getLocationDisplay(session)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                      <Clock size={12} />
                      {formatLastActive(session.lastActive)}
                    </div>
                  </div>
                  
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    IP: {session.ipAddress}
                  </div>
                </div>
                
                <button
                  onClick={() => handleRevokeSession(session.sessionId)}
                  disabled={revoking === session.sessionId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    backgroundColor: 'transparent',
                    color: 'var(--error)',
                    border: '1px solid var(--error)',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: revoking === session.sessionId ? 'not-allowed' : 'pointer',
                    opacity: revoking === session.sessionId ? 0.6 : 1,
                  }}
                  title="Log out this device"
                >
                  <Trash2 size={12} />
                  {revoking === session.sessionId ? 'Logging out...' : 'Log out'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        backgroundColor: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        fontSize: 13,
        color: 'var(--text-secondary)',
      }}>
        <strong>Security Note:</strong> If you see any unfamiliar devices or locations, 
        log them out immediately and consider changing your password. Sessions are automatically 
        cleaned up after 30 days of inactivity.
      </div>
    </div>
  );
};

export default DeviceSessionsPage;