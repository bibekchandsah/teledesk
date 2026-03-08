import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Monitor, X, RefreshCw } from 'lucide-react';

interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  appIconURL: string | null;
}

interface ScreenPickerModalProps {
  onSelect: (sourceId: string) => void;
  onCancel: () => void;
}

const ScreenPickerModal: React.FC<ScreenPickerModalProps> = ({ onSelect, onCancel }) => {
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'screen' | 'window'>('screen');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSources = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const all = await window.electronAPI!.getDesktopSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
      });
      setSources(all);
    } catch (e) {
      console.error('[ScreenPicker] failed to load sources', e);
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Initial load
    fetchSources(false);
    // Poll every 2 s so newly opened/closed windows appear automatically
    pollRef.current = setInterval(() => fetchSources(true), 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchSources]);

  const screens = sources.filter((s) => s.id.startsWith('screen:'));
  const windows = sources.filter((s) => s.id.startsWith('window:'));
  const visible = activeTab === 'screen' ? screens : windows;

  return ReactDOM.createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          zIndex: 9998,
        }}
      />
      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 9999,
          backgroundColor: '#1e1e2e',
          borderRadius: 12,
          padding: 24,
          width: 720,
          maxWidth: '95vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Monitor size={20} color="#6366f1" />
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>Choose what to share</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Manual refresh */}
            <button
              onClick={() => fetchSources(false)}
              title="Refresh"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#9ca3af',
                padding: 4,
                display: 'flex',
                borderRadius: 6,
              }}
            >
              <RefreshCw
                size={16}
                style={{
                  transition: 'transform 0.4s',
                  transform: refreshing ? 'rotate(360deg)' : 'none',
                }}
              />
            </button>
            <button
              onClick={onCancel}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#9ca3af',
                padding: 4,
                display: 'flex',
                borderRadius: 6,
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 0 }}>
          {(['screen', 'window'] as const).map((tab) => {
            const count = tab === 'screen' ? screens.length : windows.length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: activeTab === tab ? '#6366f1' : '#9ca3af',
                  fontWeight: activeTab === tab ? 600 : 400,
                  fontSize: 14,
                  padding: '8px 16px',
                  borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {tab === 'screen' ? 'Entire Screen' : 'Window'}
                {!loading && count > 0 && (
                  <span style={{
                    backgroundColor: activeTab === tab ? '#6366f1' : 'rgba(255,255,255,0.12)',
                    color: activeTab === tab ? '#fff' : '#9ca3af',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: '18px',
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Source grid */}
        <div
          style={{
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
          }}
        >
          {loading ? (
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>Loading sources…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>No sources available</div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 12,
                paddingRight: 4,
              }}
            >
              {visible.map((src) => (
                <button
                  key={src.id}
                  onClick={() => onSelect(src.id)}
                  onMouseEnter={() => setHovered(src.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    background: hovered === src.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `2px solid ${hovered === src.id ? '#6366f1' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    transition: 'all 0.15s',
                    textAlign: 'left',
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '16/9',
                      backgroundColor: '#000',
                      borderRadius: 4,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {src.thumbnail && src.thumbnail !== 'data:image/png;base64,' ? (
                      <img
                        src={src.thumbnail}
                        alt={src.name}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <Monitor size={32} color="#4b5563" />
                    )}
                  </div>
                  {/* Label */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    {src.appIconURL && (
                      <img src={src.appIconURL} alt="" style={{ width: 14, height: 14, objectFit: 'contain', flexShrink: 0, marginTop: 1 }} />
                    )}
                    <span
                      style={{
                        color: '#e5e7eb',
                        fontSize: 12,
                        fontWeight: 500,
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                        lineHeight: 1.4,
                      }}
                    >
                      {src.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: '#e5e7eb',
              cursor: 'pointer',
              padding: '8px 20px',
              fontSize: 14,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
};

export default ScreenPickerModal;
