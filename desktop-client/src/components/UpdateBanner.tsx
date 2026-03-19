import React, { useEffect, useState, useRef } from 'react';
import { Download, X, RefreshCw, ChevronRight, Info, AlertCircle, CheckCircle2, Clock, Zap } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface UpdateStatus {
  status: 'available' | 'no-update' | 'downloading' | 'downloaded' | 'error' | 'cancelled';
  info?: {
    version: string;
    url: string;
    name: string;
    size: number;
  };
  progress?: {
    percent: number;
    transferred: number;
    total: number;
    speed: number;
    eta: number;
  };
  message?: string;
}

const UpdateBanner: React.FC = () => {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [autoDownload, setAutoDownload] = useState(() => {
    return localStorage.getItem('teledesk_auto_download') === 'true';
  });
  const { isAuthenticated } = useAuthStore();

  // Show "Update installed successfully" toast if version changed since last run
  useEffect(() => {
    if (!window.electronAPI?.getAppVersion) return;
    window.electronAPI.getAppVersion().then((currentVersion: string) => {
      const lastVersion = localStorage.getItem('teledesk_last_version');
      if (lastVersion && lastVersion !== currentVersion) {
        setJustUpdated(true);
        setTimeout(() => setJustUpdated(false), 5000);
      }
      localStorage.setItem('teledesk_last_version', currentVersion);
    });
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;

    // Check for updates on mount
    window.electronAPI.checkForUpdates();

    const cleanup = window.electronAPI.onUpdateStatus((status: UpdateStatus) => {
      console.log('[Updater] Status update:', status);
      setUpdateStatus(status);
      
      if (status.status === 'available' || status.status === 'downloading' || status.status === 'downloaded' || status.status === 'error') {
        setShowBanner(true);
      } else if (status.status === 'no-update' || status.status === 'cancelled') {
        // If it was a manual check and no update, we might want to show a toast instead
        // For auto-check, we just hide the banner
        if (status.status === 'cancelled') {
          setShowBanner(false);
        }
      }
    });

    return cleanup;
  }, []);

  const status = updateStatus?.status;
  const info = updateStatus?.info;
  const progress = updateStatus?.progress;
  const message = updateStatus?.message;

  // Auto-download logic
  useEffect(() => {
    if (status === 'available' && autoDownload) {
      handleDownload();
    }
  }, [status, autoDownload]);

  const toggleAutoDownload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.checked;
    setAutoDownload(newVal);
    localStorage.setItem('teledesk_auto_download', String(newVal));
  };

  if (!showBanner && !justUpdated) return null;

  // "Update installed successfully" toast
  if (justUpdated && !showBanner) {
    return (
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(34,197,94,0.4)',
        borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center',
        gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', animation: 'slideUp 0.3s ease-out',
        color: '#f8fafc', fontSize: 14,
      }}>
        <CheckCircle2 size={18} color="#22c55e" />
        <span>Update installed successfully</span>
        <style dangerouslySetInnerHTML={{ __html: `@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }` }} />
      </div>
    );
  }

  if (!showBanner || !updateStatus) return null;

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number) => {
    return `${formatSize(bytesPerSec)}/s`;
  };

  const formatETA = (seconds: number) => {
    if (!seconds || seconds === Infinity) return 'calculating...';
    if (seconds < 60) return `${Math.round(seconds)}s remaining`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s remaining`;
  };

  const handleDownload = () => {
    if (window.electronAPI) {
      window.electronAPI.startDownload();
    }
  };

  const handleCancel = () => {
    if (window.electronAPI) {
      window.electronAPI.cancelDownload();
      setShowBanner(false);
    }
  };

  const handleRestart = () => {
    if (window.electronAPI) {
      window.electronAPI.quitAndInstall();
    }
  };

  const handleClose = () => {
    setShowBanner(false);
  };

  return (
    <div className={`update-banner-wrapper ${status === 'downloading' ? 'downloading' : ''}`}>
      <div className="update-banner-container">
        {status === 'available' && (
          <div className="update-banner available">
            <div className="icon-wrapper">
              <Download size={18} className="animate-bounce-subtle" />
            </div>
            <div className="content">
              <span className="title">Update Available: <strong>v{info?.version}</strong></span>
              <div className="auto-download-opt">
                <input 
                  type="checkbox" 
                  id="auto-download-check"
                  checked={autoDownload}
                  onChange={toggleAutoDownload}
                />
                <label htmlFor="auto-download-check">Download updates automatically</label>
              </div>
            </div>
            <div className="actions">
              <button className="btn-secondary" onClick={handleClose}>Later</button>
              <button className="btn-primary" onClick={handleDownload}>
                Update Now <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {status === 'downloading' && (
          <div className="update-banner downloading">
            <div className="progress-bg">
              <div 
                className="progress-fill" 
                style={{ width: `${progress?.percent || 0}%` }}
              >
                <div className="progress-shimmer"></div>
              </div>
            </div>
            <div className="download-content">
              <div className="top-row">
                <div className="status-info">
                  <RefreshCw size={16} className="animate-spin-slow" />
                  <span>Downloading TeleDesk v{info?.version}</span>
                </div>
                <button className="cancel-btn" onClick={handleCancel} title="Cancel Download">
                  <X size={18} />
                </button>
              </div>
              <div className="stats-row">
                <div className="stats-group">
                  <div className="stat">
                    <Zap size={12} />
                    <span>{formatSpeed(progress?.speed || 0)}</span>
                  </div>
                  <div className="stat">
                    <Clock size={12} />
                    <span>{formatETA(progress?.eta || 0)}</span>
                  </div>
                  <div className="stat total-size">
                    <span>{formatSize(progress?.transferred || 0)} / {formatSize(progress?.total || 0)}</span>
                  </div>
                  <div className="auto-download-mini">
                    <input 
                      type="checkbox" 
                      id="auto-download-check-mini"
                      checked={autoDownload}
                      onChange={toggleAutoDownload}
                    />
                    <label htmlFor="auto-download-check-mini">Auto Download</label>
                  </div>
                </div>
                <div className="percentage-stat">{Math.round(progress?.percent || 0)}%</div>
              </div>
            </div>
          </div>
        )}

        {status === 'downloaded' && (
          <div className="update-banner downloaded">
            <div className="icon-wrapper success">
              <CheckCircle2 size={18} />
            </div>
            <div className="content">
              <span className="title">Update Ready!</span>
              <span className="subtitle">Restart TeleDesk to finish installing the new version.</span>
            </div>
            <div className="actions">
              <button className="btn-primary pulse" onClick={handleRestart}>
                Restart & Update <RefreshCw size={14} />
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="update-banner error">
            <div className="icon-wrapper failure">
              <AlertCircle size={18} />
            </div>
            <div className="content">
              <span className="title">Update Failed</span>
              <span className="subtitle">{message || 'An unexpected error occurred.'}</span>
            </div>
            <div className="actions">
              <button className="btn-secondary" onClick={handleClose}>Dismiss</button>
              <button className="btn-primary" onClick={handleDownload}>Retry</button>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .update-banner-wrapper {
          width: 100%;
          padding: 8px 16px;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          z-index: 1000;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          animation: slideDown 0.4s ease-out;
        }

        .update-banner-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .update-banner {
          display: flex;
          align-items: center;
          gap: 16px;
          min-height: 48px;
        }

        .icon-wrapper {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(59, 130, 246, 0.2);
          color: #3b82f6;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .icon-wrapper.success {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .icon-wrapper.failure {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }

        .content {
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .title {
          font-size: 14px;
          font-weight: 500;
          color: #f8fafc;
        }

        .subtitle {
          font-size: 12px;
          color: #94a3b8;
        }

        .actions {
          display: flex;
          gap: 8px;
        }

        .btn-primary, .btn-secondary {
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
          border: none;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
        }

        .btn-primary:hover {
          background: #2563eb;
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          color: #e2e8f0;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        /* Downloading State Styling */
        .update-banner.downloading {
          flex-direction: column;
          align-items: stretch;
          gap: 8px;
          padding: 4px 0;
          position: relative;
        }

        .auto-download-opt {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
          font-size: 11px;
          color: #94a3b8;
          cursor: pointer;
        }

        .auto-download-opt input {
          cursor: pointer;
          accent-color: #3b82f6;
        }

        .auto-download-opt label {
          cursor: pointer;
        }

        .auto-download-mini {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-left: 4px;
          padding-left: 8px;
          border-left: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 10px;
          font-weight: 500;
          color: #94a3b8;
          cursor: pointer;
          user-select: none;
        }

        .auto-download-mini input {
          width: 12px;
          height: 12px;
          cursor: pointer;
          accent-color: #3b82f6;
          margin: 0;
        }

        .auto-download-mini label {
          cursor: pointer;
          opacity: 0.8;
        }

        .download-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
          z-index: 1;
        }

        .top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .status-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 500;
          color: #f8fafc;
        }

        .percentage-stat {
          font-size: 11px;
          font-weight: 700;
          color: #3b82f6;
          background: rgba(59, 130, 246, 0.1);
          padding: 1px 6px;
          border-radius: 4px;
          margin-left: auto;
        }

        .stats-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: #94a3b8;
          width: 100%;
        }

        .stats-group {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .stat {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .progress-bg {
          position: absolute;
          inset: -4px -8px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 12px;
          overflow: hidden;
          z-index: 0;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%);
          opacity: 0.15;
          transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }

        .progress-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          animation: shimmer 2s infinite;
        }

        .cancel-btn {
          background: rgba(255, 255, 255, 0.05);
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          z-index: 10;
          flex-shrink: 0;
        }

        .cancel-btn:hover {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.15);
          transform: scale(1.05);
        }

        .cancel-btn:active {
          transform: scale(0.95);
        }

        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }

        .animate-bounce-subtle {
          animation: bounceSubtle 2s infinite;
        }

        @keyframes bounceSubtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }

        .pulse {
          animation: pulse 2.5s infinite;
        }

        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
          70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      ` }} />
    </div>
  );
};

export default UpdateBanner;
