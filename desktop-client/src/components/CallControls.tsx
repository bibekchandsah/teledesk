import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, Phone, 
  Monitor, MessageCircle, 
  ChevronUp, LayoutGrid, Rows2, Columns2
} from 'lucide-react';
import ReactDOM from 'react-dom';

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
  isMiniMode?: boolean;
}

interface MenuSection {
  title: string;
  devices: MediaDeviceInfo[];
  activeId: string;
  onSelect: (id: string) => void;
}

interface MenuPos { bottom: number; left: number; }

const truncateLabel = (label: string): string => {
  const words = label.trim().split(/\s+/);
  return words.length > 4 ? words.slice(0, 4).join(' ') + ' ...' : label;
};

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

const ControlGroup: React.FC<{
  children: React.ReactNode;
  chevron?: boolean;
  onChevron?: () => void;
  isSmall?: boolean;
  isVerySmall?: boolean;
}> = ({ children, chevron, onChevron, isSmall, isVerySmall }) => (
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
  isMiniMode = false,
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

  useEffect(() => {
    const load = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        setMicDevices(all.filter((d) => d.kind === 'audioinput'));
        setSpeakerDevices(all.filter((d) => d.kind === 'audiooutput'));
        setCamDevices(all.filter((d) => d.kind === 'videoinput'));
      } catch { }
    };
    load();
  }, []);

  const isSmall = windowWidth < 600 || isMiniMode;
  const isVerySmall = windowWidth < 450 || isMiniMode;
  const btnSize = isVerySmall ? 40 : isSmall ? 44 : 52;
  const gap = isVerySmall ? 8 : isSmall ? 12 : 20;
  const padding = isVerySmall ? '10px 14px' : isSmall ? '12px 20px' : '16px 32px';
  const iconSize = isVerySmall ? 18 : isSmall ? 20 : 22;
  const endCallSize = isVerySmall ? 44 : isSmall ? 50 : 60;

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

  const btnBaseStyle: React.CSSProperties = {
    width: btnSize, height: btnSize, borderRadius: '50%', border: 'none',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: '#fff', transition: 'background-color 0.2s',
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: gap,
        padding: padding,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 50,
        pointerEvents: 'auto',
      }}
    >
      <ControlGroup
        chevron={(micDevices.length > 1 || speakerDevices.length > 0) && !!onSwitchMic}
        onChevron={openMicMenu}
        isSmall={isSmall}
        isVerySmall={isVerySmall}
      >
        <div ref={micBtnRef}>
          <button
            onClick={onToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            style={{ ...btnBaseStyle, backgroundColor: isMuted ? '#ef4444' : 'rgba(255,255,255,0.15)' }}
          >
            {isMuted ? <MicOff size={iconSize} /> : <Mic size={iconSize} />}
          </button>
        </div>
        {micMenuPos && (
          <DeviceMenu
            sections={[
              ...(micDevices.length > 0 ? [{ title: 'Microphone', devices: micDevices, activeId: activeMicId, onSelect: (id: string) => onSwitchMic?.(id) }] : []),
              ...(speakerDevices.length > 0 ? [{ title: 'Speaker', devices: speakerDevices, activeId: activeSpeakerId, onSelect: (id: string) => onSwitchSpeaker?.(id) }] : []),
            ]}
            pos={micMenuPos}
            width={isVerySmall ? 240 : 280}
            onClose={() => setMicMenuPos(null)}
          />
        )}
      </ControlGroup>

      <ControlGroup
        chevron={camDevices.length >= 1 && !!onSwitchCamera}
        onChevron={openCamMenu}
        isSmall={isSmall}
        isVerySmall={isVerySmall}
      >
        <div ref={camBtnRef}>
          <button
            onClick={onToggleVideo}
            title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
            style={{ ...btnBaseStyle, backgroundColor: isVideoOff ? '#ef4444' : 'rgba(255,255,255,0.15)' }}
          >
            {isVideoOff ? <VideoOff size={iconSize} /> : <Video size={iconSize} />}
          </button>
        </div>
        {camMenuPos && (
          <DeviceMenu
            sections={[{ title: 'Camera', devices: camDevices, activeId: activeCamId, onSelect: (id: string) => onSwitchCamera?.(id) }]}
            pos={camMenuPos}
            width={isVerySmall ? 240 : 280}
            onClose={() => setCamMenuPos(null)}
          />
        )}
      </ControlGroup>

      {onToggleScreenShare && !isMiniMode && (
        <button
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          style={{ ...btnBaseStyle, backgroundColor: isScreenSharing ? '#10b981' : 'rgba(255,255,255,0.15)' }}
        >
          <Monitor size={iconSize} />
        </button>
      )}

      {onToggleGridView && !isMiniMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onToggleGridView}
            title="Toggle grid view"
            style={{ ...btnBaseStyle, backgroundColor: isGridView ? '#6366f1' : 'rgba(255,255,255,0.15)' }}
          >
            <LayoutGrid size={iconSize} />
          </button>
          {isGridView && onToggleGridOrientation && (
            <button
              onClick={onToggleGridOrientation}
              title="Toggle grid orientation"
              style={{ ...btnBaseStyle, backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              {gridOrientation === 'horizontal' ? <Rows2 size={iconSize} /> : <Columns2 size={iconSize} />}
            </button>
          )}
        </div>
      )}

      {onToggleChat && !isMiniMode && (
        <button
          onClick={onToggleChat}
          title={isChatOpen ? 'Close chat' : 'Open chat'}
          style={{ ...btnBaseStyle, backgroundColor: isChatOpen ? '#6366f1' : 'rgba(255,255,255,0.15)' }}
        >
          <MessageCircle size={iconSize} />
        </button>
      )}

      <button
        onClick={onEndCall}
        title="End call"
        style={{ 
          ...btnBaseStyle, 
          width: endCallSize, 
          height: endCallSize, 
          backgroundColor: '#ef4444' 
        }}
      >
        <Phone size={isVerySmall ? 20 : 24} style={{ transform: 'rotate(135deg)' }} />
      </button>
    </div>
  );
};

export default React.memo(CallControls);
