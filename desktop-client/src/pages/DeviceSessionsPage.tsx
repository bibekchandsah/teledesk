import React, { useEffect, useState } from 'react';
import { DeviceSession } from '@shared/types';
import { getDeviceSessions, revokeDeviceSession, revokeAllOtherSessions } from '../services/deviceSessionService';
import { Monitor, Smartphone, Globe, MapPin, Clock, Shield, Trash2, LogOut, AlertTriangle, Info } from 'lucide-react';
import { formatTime } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import ConfirmationModal from '../components/modals/ConfirmationModal';

const DeviceSessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const { logout } = useAuth();

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    hideCancel?: boolean;
    icon?: React.ReactNode;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  const showAlert = (title: string, message: string) => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      confirmText: 'OK',
      hideCancel: true,
      icon: <Info size={18} color="#fff" />,
      onConfirm: closeModal,
    });
  };

  const loadSessions = async () => {
    setLoading(true);
    const response = await getDeviceSessions();
    if (response.success && response.data) {
      setSessions(response.data);
    } else {
      console.error('Failed to load device sessions:', response.error);
      if (response.error?.includes('401') || response.error?.includes('Unauthorized')) {
        showAlert('Authentication Error', 'Authentication error. Please try logging out and logging back in.');
      } else if (response.error?.includes('table') || response.error?.includes('relation')) {
        showAlert('Database Error', 'Database not set up. Please run the device sessions migration first.');
      } else {
        showAlert('Error', 'Failed to load device sessions: ' + (response.error || 'Unknown error'));
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleRevokeSession = (sessionId: string) => {
    setModalConfig({
      isOpen: true,
      title: 'Log out device',
      message: 'Are you sure you want to log out this device?',
      confirmText: 'Log Out',
      isDestructive: true,
      icon: <LogOut size={18} color="#fff" />,
      onConfirm: async () => {
        closeModal();
        setRevoking(sessionId);
        const response = await revokeDeviceSession(sessionId);
        if (response.success) {
          setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
        } else {
          showAlert('Error', 'Failed to revoke session: ' + (response.error || 'Unknown error'));
        }
        setRevoking(null);
      }
    });
  };

  const handleRevokeAllOthers = () => {
    setModalConfig({
      isOpen: true,
      title: 'Terminate other sessions',
      message: 'Are you sure you want to log out all other devices? This will end all other active sessions.',
      confirmText: 'Terminate All',
      isDestructive: true,
      icon: <AlertTriangle size={18} color="#fff" />,
      onConfirm: async () => {
        closeModal();
        setRevokingAll(true);
        const response = await revokeAllOtherSessions();
        if (response.success) {
          await loadSessions(); 
        } else {
          showAlert('Error', 'Failed to revoke other sessions: ' + (response.error || 'Unknown error'));
        }
        setRevokingAll(false);
      }
    });
  };

  const handleLogoutAllDevices = () => {
    setModalConfig({
      isOpen: true,
      title: 'Log out everywhere',
      message: 'Are you sure you want to log out from ALL devices including this one? You will be logged out immediately.',
      confirmText: 'Log Out All',
      isDestructive: true,
      icon: <LogOut size={18} color="#fff" />,
      onConfirm: async () => {
        closeModal();
        setRevokingAll(true);
        await revokeAllOtherSessions();
        await logout();
      }
    });
  };

  const handleLogoutCurrentSession = () => {
    setModalConfig({
      isOpen: true,
      title: 'Log out',
      message: 'Are you sure you want to log out of this device?',
      confirmText: 'Log Out',
      isDestructive: true,
      icon: <LogOut size={18} color="#fff" />,
      onConfirm: async () => {
        closeModal();
        await logout();
      }
    });
  };

  const getDeviceIcon = (deviceType: DeviceSession['deviceType']) => {
    switch (deviceType) {
      case 'desktop':
        return <Monitor size={24} />;
      case 'mobile':
        return <Smartphone size={24} />;
      case 'web':
      default:
        return <Globe size={24} />;
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
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ margin: 0, marginBottom: 8, color: 'var(--text-primary)', fontSize: 24, fontWeight: 600 }}>
          Devices
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>
          Manage your active sessions across all devices. You can log out from specific devices, terminate all other sessions, or log out everywhere entirely.
        </p>
      </div>

      {/* Global Actions */}
      <div style={{ 
        display: 'flex', 
        gap: 16, 
        marginBottom: 32,
        flexWrap: 'wrap'
      }}>
        {otherSessions.length > 0 && (
          <button
            onClick={handleRevokeAllOthers}
            disabled={revokingAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 20px',
              backgroundColor: 'transparent',
              color: 'var(--error)',
              border: '1px solid var(--error)',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: revokingAll ? 'not-allowed' : 'pointer',
              opacity: revokingAll ? 0.6 : 1,
              flex: '1 1 auto',
              transition: 'all 0.2s',
            }}
          >
            <AlertTriangle size={16} />
            {revokingAll ? 'Processing...' : 'Terminate All Other Sessions'}
          </button>
        )}
        
        <button
          onClick={handleLogoutAllDevices}
          disabled={revokingAll}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '12px 20px',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: revokingAll ? 'not-allowed' : 'pointer',
            opacity: revokingAll ? 0.6 : 1,
            flex: '1 1 auto',
            transition: 'all 0.2s',
          }}
        >
          <LogOut size={16} />
          {revokingAll ? 'Logging Out...' : 'Log Out of All Devices'}
        </button>
      </div>

      {/* Current Session */}
      {currentSession && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ 
            margin: 0, 
            marginBottom: 16, 
            color: 'var(--text-secondary)', 
            fontSize: 14,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Current Device
          </h3>
          
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
              <div style={{ 
                color: 'var(--text-secondary)', 
                backgroundColor: 'var(--bg-tertiary)', 
                padding: 12, 
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {getDeviceIcon(currentSession.deviceType)}
              </div>
              
              <div style={{ flex: 1 }}>
                <div style={{ 
                  fontWeight: 600, 
                  color: 'var(--text-primary)', 
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 16
                }}>
                  {currentSession.deviceName}
                  <span style={{
                    backgroundColor: 'var(--accent)',
                    color: 'white',
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 12,
                    textTransform: 'uppercase'
                  }}>
                    Online
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <MapPin size={14} />
                    {getLocationDisplay(currentSession)}
                  </div>
                </div>
                
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  IP: {currentSession.ipAddress}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogoutCurrentSession}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Trash2 size={16} />
              Log Out
            </button>
          </div>
        </div>
      )}

      {/* Other Sessions */}
      <div>
        <h3 style={{ 
          margin: 0, 
          marginBottom: 16, 
          color: 'var(--text-secondary)', 
          fontSize: 14,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Active Sessions ({otherSessions.length})
        </h3>

        {otherSessions.length === 0 ? (
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 40,
            textAlign: 'center',
            color: 'var(--text-secondary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12
          }}>
            <Shield size={40} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
              No other active sessions found
            </p>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
              You are only logged in on this device.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {otherSessions.map((session) => (
              <div
                key={session.sessionId}
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  transition: 'transform 0.2s',
                }}
              >
                <div style={{ 
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: 12,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {getDeviceIcon(session.deviceType)}
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontWeight: 600, 
                    color: 'var(--text-primary)', 
                    marginBottom: 4,
                    fontSize: 15,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {session.deviceName}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                      <MapPin size={12} />
                      {getLocationDisplay(session)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                      <Clock size={12} />
                      {formatLastActive(session.lastActive)}
                    </div>
                  </div>
                  
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    IP: {session.ipAddress}
                  </div>
                </div>
                
                <button
                  onClick={() => handleRevokeSession(session.sessionId)}
                  disabled={revoking === session.sessionId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 12px',
                    backgroundColor: 'transparent',
                    color: 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: revoking === session.sessionId ? 'not-allowed' : 'pointer',
                    opacity: revoking === session.sessionId ? 0.6 : 1,
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseOver={(e) => {
                    if (revoking !== session.sessionId) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                    }
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title="Log out this device"
                >
                  <Trash2 size={16} style={{ marginRight: 6 }} />
                  {revoking === session.sessionId ? '...' : 'Log Out'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        marginTop: 32,
        backgroundColor: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        fontSize: 13,
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        lineHeight: 1.5
      }}>
        <Shield size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>Security Check:</strong> If you see any unfamiliar devices or locations, 
          log them out immediately and consider changing your password. Sessions are automatically 
          cleaned up after 30 days of inactivity.
        </div>
      </div>

      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.hideCancel ? undefined : "Cancel"}
        isDestructive={modalConfig.isDestructive}
        icon={modalConfig.icon}
        onConfirm={modalConfig.onConfirm}
        onCancel={closeModal}
      />
    </div>
  );
};

export default DeviceSessionsPage;