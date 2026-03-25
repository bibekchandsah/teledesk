import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Mic, MicOff, Video, VideoOff, Phone, MessageCircle, ChevronUp, LayoutGrid, Monitor, MonitorOff, Rows2, Columns2 } from 'lucide-react';

interface CallControlsProps {
  isMuted: boolean;
  isVideoOff: boolean;
  callType: 'video' | 'voice';
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
  onSwitchMic?: (deviceId: string) => void;
  onSwitchCamera?: (deviceId: string) => void;
  onSwitchSpeaker?: (deviceId: string) => void;
  isGridView?: boolean;
  onToggleGridView?: () => void;
  gridOrientation?: 'horizontal' | 'vertical';
  onToggleGridOrientation?: () => void;
  isScreenSharing?: boolean;
  onToggleScreenShare?: () => void;
  activeMicId?: string;
  activeCamId?: string;
  activeSpeakerId?: string;
}

interface MenuSection {
  title: string;
  devices: MediaDeviceInfo[];
  activeId: string;
  onSelect: (id: string) => void;
}

interface MenuPos { bottom: number; left: number; }

// Truncate label to first 4 words
const truncateLabel = (label: string): string => {
  const words = label.trim().split(/\s+/);
  return words.length > 4 ? words.slice(0, 4).join(' ') + ' ...' : label;
};

// ── device picker popup — rendered into document.body via portal ──────────
const DeviceMenu: React.FC<{
  sections: MenuSection[];
  pos: MenuPos;
  width: number;
  onClose: () => void;
}> = ({ sections, pos, width, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        bottom: pos.bottom,
        left: pos.left,
        width: width,
        backgroundColor: '#1e293b',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '6px 0',
        zIndex: 999999,
        boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
      }}
    >
      {sections.map((section, si) => (
        <React.Fragment key={section.title}>
          {si > 0 && (
            <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />
          )}
          <div style={{
            padding: '4px 14px 2px',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)',
          }}>
            {section.title}
          </div>
          {section.devices.map((d) => {
            const raw = d.label || `Device ${d.deviceId.slice(0, 8)}`;
            const label = truncateLabel(raw);
            const isActive = d.deviceId === section.activeId;
            return (
              <button
                key={d.deviceId}
                onClick={() => { section.onSelect(d.deviceId); onClose(); }}
                title={raw}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 14px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: isActive ? '#6366f1' : '#e2e8f0',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ width: 16, flexShrink: 0, color: '#6366f1' }}>
                  {isActive ? '✓' : ''}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </div>,
    document.body
  );
};

// ── button + optional chevron wrapper ─────────────────────────────────────
const ControlGroup: React.FC<{
  children: React.ReactNode;
  chevron?: boolean;
  anchorRef?: React.RefObject<HTMLElement>;
  menu?: React.ReactNode;
  onChevron?: () => void;
  isSmall?: boolean;
  isVerySmall?: boolean;
}> = ({ children, chevron, menu, onChevron, isSmall, isVerySmall }) => (
  <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
    {children}
    {chevron && (
      <button
        onClick={onChevron}
        title="Choose device"
        style={{
          position: 'absolute',
          bottom: isVerySmall ? 0 : isSmall ? -1 : -2,
          right: isVerySmall ? -4 : isSmall ? -6 : -10,
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: '1.5px solid rgba(255,255,255,0.3)',
          backgroundColor: 'rgba(0,0,0,0.55)',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          zIndex: 10,
        }}
      >
        <ChevronUp size={11} />
      </button>
    )}
    {menu}
  </div>
);

const CallControls: React.FC<CallControlsProps> = ({
  isMuted,
  isVideoOff,
  callType,
  onToggleMute,
  onToggleVideo,
  onEndCall,
  isChatOpen,
  onToggleChat,
  onSwitchMic,
  onSwitchCamera,
  onSwitchSpeaker,
  isGridView,
  onToggleGridView,
  gridOrientation = 'horizontal',
  onToggleGridOrientation,
  isScreenSharing,
  onToggleScreenShare,
  activeMicId = '',
  activeCamId = '',
  activeSpeakerId = '',
}) => {
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [camDevices, setCamDevices] = useState<MediaDeviceInfo[]>([]);
  const [micMenuPos, setMicMenuPos] = useState<MenuPos | null>(null);
  const [camMenuPos, setCamMenuPos] = useState<MenuPos | null>(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const micBtnRef = useRef<HTMLDivElement>(null);
  const camBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isSmall = windowWidth < 600;
  const isVerySmall = windowWidth < 450;
  const btnSize = isVerySmall ? 40 : isSmall ? 44 : 52;
  const gap = isVerySmall ? 8 : isSmall ? 12 : 20;
  const padding = isVerySmall ? '10px 14px' : isSmall ? '12px 20px' : '16px 32px';
  const iconSize = isVerySmall ? 18 : isSmall ? 20 : 22;
  const endCallSize = isVerySmall ? 44 : isSmall ? 50 : 60;

  useEffect(() => {
    const load = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        setMicDevices(all.filter((d) => d.kind === 'audioinput'));
        setSpeakerDevices(all.filter((d) => d.kind === 'audiooutput'));
        setCamDevices(all.filter((d) => d.kind === 'videoinput'));
      } catch { /* permission not yet granted */ }
    };
    load();
  }, []);

  // Compute menu position from anchor rect at click time
  const openMicMenu = () => {
    if (micMenuPos) { setMicMenuPos(null); return; }
    const rect = micBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mWidth = isVerySmall ? 240 : 280;
    const rawLeft = rect.left + rect.width / 2 - mWidth / 2;
    const left = Math.max(8, Math.min(rawLeft, windowWidth - mWidth - 8));
    setCamMenuPos(null);
    setMicMenuPos({ bottom: window.innerHeight - rect.top + 10, left });
  };

  const openCamMenu = () => {
    if (camMenuPos) { setCamMenuPos(null); return; }
    const rect = camBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mWidth = isVerySmall ? 240 : 280;
    const rawLeft = rect.left + rect.width / 2 - mWidth / 2;
    const left = Math.max(8, Math.min(rawLeft, windowWidth - mWidth - 8));
    setMicMenuPos(null);
    setCamMenuPos({ bottom: window.innerHeight - rect.top + 10, left });
  };

  const handleSelectMic = (id: string) => {
    onSwitchMic?.(id);
  };

  const handleSelectSpeaker = (id: string) => {
    onSwitchSpeaker?.(id);
  };

  const handleSelectCam = (id: string) => {
    onSwitchCamera?.(id);
  };

  const btnBase: React.CSSProperties = {
    width: 52, height: 52, borderRadius: '50%', border: 'none',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: '#fff', transition: 'background-color 0.2s',
  };

  return (
    <div
      className="call-controls"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: gap,
        padding: padding,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 50,
      }}
    >
      {/* Mic button + chevron */}
      <ControlGroup
        chevron={(micDevices.length > 1 || speakerDevices.length > 0) && !!onSwitchMic}
        onChevron={openMicMenu}
        isSmall={isSmall}
        isVerySmall={isVerySmall}
        menu={micMenuPos && (
          <DeviceMenu
            sections={[
              ...(micDevices.length > 0 ? [{
                title: 'Microphone',
                devices: micDevices,
                activeId: activeMicId,
                onSelect: handleSelectMic,
              }] : []),
              ...(speakerDevices.length > 0 ? [{
                title: 'Speaker',
                devices: speakerDevices,
                activeId: activeSpeakerId,
                onSelect: handleSelectSpeaker,
              }] : []),
            ]}
            pos={micMenuPos}
            width={isVerySmall ? 240 : 280}
            onClose={() => setMicMenuPos(null)}
          />
        )}
      >
        <div ref={micBtnRef}>
          <button
            onClick={onToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            style={{ ...btnBase, width: btnSize, height: btnSize, backgroundColor: isMuted ? '#ef4444' : 'rgba(255,255,255,0.15)' }}
          >
            {isMuted ? <MicOff size={iconSize} /> : <Mic size={iconSize} />}
          </button>
        </div>
      </ControlGroup>

      {/* Camera button + chevron (always shown) */}
      <ControlGroup
        chevron={camDevices.length >= 1 && !!onSwitchCamera}
        onChevron={openCamMenu}
        isSmall={isSmall}
        isVerySmall={isVerySmall}
        menu={camMenuPos && (
          <DeviceMenu
            sections={[{
              title: 'Camera',
              devices: camDevices,
              activeId: activeCamId,
              onSelect: handleSelectCam,
            }]}
            pos={camMenuPos}
            width={isVerySmall ? 240 : 280}
            onClose={() => setCamMenuPos(null)}
          />
        )}
      >
        <div ref={camBtnRef}>
          <button
            onClick={onToggleVideo}
            title={
              callType === 'voice' && isVideoOff
                ? 'Enable camera'
                : isVideoOff
                ? 'Turn on camera'
                : callType === 'voice'
                ? 'Disable camera'
                : 'Turn off camera'
            }
            style={{ ...btnBase, width: btnSize, height: btnSize, backgroundColor: isVideoOff ? '#ef4444' : 'rgba(255,255,255,0.15)' }}
          >
            {isVideoOff ? <VideoOff size={iconSize} /> : <Video size={iconSize} />}
          </button>
        </div>
      </ControlGroup>

      {/* Screen share toggle */}
      {onToggleScreenShare && (
        <button
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
          style={{ ...btnBase, width: btnSize, height: btnSize, backgroundColor: isScreenSharing ? '#f59e0b' : 'rgba(255,255,255,0.15)' }}
        >
          {isScreenSharing ? <MonitorOff size={iconSize} /> : <Monitor size={iconSize} />}
        </button>
      )}

      {/* Grid / PiP view toggle (when video is active) */}
      {onToggleGridView && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onToggleGridView}
            title={isGridView ? 'Switch to PiP view' : 'Switch to grid view'}
            style={{ ...btnBase, width: btnSize, height: btnSize, backgroundColor: isGridView ? '#6366f1' : 'rgba(255,255,255,0.15)' }}
          >
            <LayoutGrid size={iconSize} />
          </button>
          {isGridView && onToggleGridOrientation && (
            <button
              onClick={onToggleGridOrientation}
              title={gridOrientation === 'horizontal' ? 'Switch to vertical grid' : 'Switch to horizontal grid'}
              style={{ ...btnBase, width: btnSize, height: btnSize, backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              {gridOrientation === 'horizontal' ? <Rows2 size={iconSize} /> : <Columns2 size={iconSize} />}
            </button>
          )}
        </div>
      )}

      {/* Chat toggle */}
      {onToggleChat && (
        <button
          onClick={onToggleChat}
          title={isChatOpen ? 'Close chat' : 'Open chat'}
          style={{ ...btnBase, width: btnSize, height: btnSize, backgroundColor: isChatOpen ? '#6366f1' : 'rgba(255,255,255,0.15)' }}
        >
          <MessageCircle size={iconSize} />
        </button>
      )}

      {/* End call */}
      <button
        onClick={onEndCall}
        title="End call"
        style={{ ...btnBase, width: endCallSize, height: endCallSize, fontSize: isVerySmall ? 20 : 24, backgroundColor: '#ef4444' }}
      >
        <Phone size={isVerySmall ? 20 : 24} style={{ transform: 'rotate(135deg)' }} />
      </button>
    </div>
  );
};

export default CallControls;

