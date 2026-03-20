import React, { useEffect, useState, useRef } from 'react';
import { Download, X, RefreshCw, ChevronRight, Info, AlertCircle, CheckCircle2, Clock, Zap } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import PremiumToggle from './PremiumToggle';

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
  const [noUpdateNotice, setNoUpdateNotice] = useState<string | null>(null);
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
        // Show a short toast only when manual no-update message is provided.
        if (status.status === 'no-update' && status.message) {
          setNoUpdateNotice(status.message);
          setTimeout(() => setNoUpdateNotice(null), 5000);
        }
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

  const toggleAutoDownload = (newVal: boolean) => {
    setAutoDownload(newVal);
    localStorage.setItem('teledesk_auto_download', String(newVal));
  };

  if (!showBanner && !justUpdated && !noUpdateNotice) return null;

  if (noUpdateNotice && !showBanner) {
    return (
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        background: 'var(--bg-secondary)', border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))',
        borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center',
        gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', animation: 'slideUp 0.3s ease-out',
        color: 'var(--text-primary)', fontSize: 14,
      }}>
        <Info size={18} color='var(--accent)' />
        <span>{noUpdateNotice}</span>
        <style dangerouslySetInnerHTML={{ __html: `@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }` }} />
      </div>
    );
  }

  // "Update installed successfully" toast
  if (justUpdated && !showBanner) {
    return (
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        background: 'var(--bg-secondary)', border: '1px solid color-mix(in srgb, #22c55e 40%, var(--border))',
        borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center',
        gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', animation: 'slideUp 0.3s ease-out',
        color: 'var(--text-primary)', fontSize: 14,
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
                <PremiumToggle
                  label="Auto download"
                  description="Download updates automatically"
                  checked={autoDownload}
                  onChange={toggleAutoDownload}
                />
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
                    <PremiumToggle
                      checked={autoDownload}
                      onChange={toggleAutoDownload}
                      label="Auto Download"
                    />
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
          background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
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

        .update-banner.available {
          min-height: 44px;
          align-items: center;
          gap: 12px;
        }

        .icon-wrapper {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--accent) 18%, transparent);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .icon-wrapper.success {
          background: color-mix(in srgb, #22c55e 18%, transparent);
          color: #22c55e;
        }

        .icon-wrapper.failure {
          background: color-mix(in srgb, #ef4444 18%, transparent);
          color: #ef4444;
        }

        .content {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }

        .title {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .subtitle {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-shrink: 0;
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
          background: var(--accent);
          color: white;
        }

        .btn-primary:hover {
          background: var(--accent-hover);
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: var(--bg-secondary);
          color: var(--text-primary);
          border: 1px solid var(--border);
        }

        .btn-secondary:hover {
          background: color-mix(in srgb, var(--bg-secondary) 80%, var(--text-primary) 20%);
        }

        /* Downloading State Styling */
        .update-banner.downloading {
          flex-direction: column;
          align-items: stretch;
          gap: 6px;
          padding: 2px 0;
          position: relative;
        }

        .auto-download-opt {
          display: flex;
          align-items: center;
          gap: 0;
          margin-top: 2px;
          min-height: 24px;
          transform: scale(0.86);
          transform-origin: left center;
          max-width: 260px;
          color: var(--text-secondary);
        }

        .auto-download-mini {
          display: flex;
          align-items: center;
          gap: 0;
          margin-left: 0;
          padding-left: 10px;
          border-left: 1px solid var(--border);
          min-height: 24px;
          color: var(--text-secondary);
          user-select: none;
          transform: scale(0.82);
          transform-origin: left center;
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
          gap: 3px;
          z-index: 1;
        }

        .top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          min-height: 28px;
        }

        .status-info {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .percentage-stat {
          font-size: 10px;
          font-weight: 700;
          color: var(--accent);
          background: color-mix(in srgb, var(--accent) 14%, transparent);
          padding: 1px 5px;
          border-radius: 4px;
          margin-left: auto;
          line-height: 1.3;
        }

        .stats-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          color: var(--text-secondary);
          width: 100%;
          gap: 10px;
        }

        .stats-group {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          min-height: 24px;
        }

        .stat {
          display: flex;
          align-items: center;
          gap: 3px;
          white-space: nowrap;
        }

        .progress-bg {
          position: absolute;
          inset: -4px -8px;
          background: color-mix(in srgb, var(--bg-tertiary) 70%, transparent);
          border-radius: 12px;
          overflow: hidden;
          z-index: 0;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent) 0%, var(--accent-hover) 100%);
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
          background: color-mix(in srgb, var(--bg-secondary) 80%, var(--text-primary) 20%);
          border: none;
          color: var(--text-secondary);
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
          background: color-mix(in srgb, #ef4444 15%, transparent);
          transform: scale(1.05);
        }

        [data-theme='light'] .update-banner-wrapper {
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
        }

        [data-theme='light'] .btn-primary {
          color: #ffffff;
        }

        [data-theme='light'] .progress-fill {
          opacity: 0.22;
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
