import React, { useState, useRef, useEffect } from 'react';
import { useCallStore } from '../store/callStore';
import { useCallContext } from '../context/CallContext';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import VideoStream from '../components/VideoStream';
import CallControls from '../components/CallControls';
import ChatWindow from './ChatWindow';
import UserAvatar from '../components/UserAvatar';
import ScreenPickerModal from '../components/ScreenPickerModal';
import { formatDuration } from '../utils/formatters';
import { toggleAudio, toggleVideo, switchMicrophone, switchCamera, startScreenShare, stopScreenShare, enableCallVideo, disableCallVideo } from '../services/webrtcService';
import { getSocket, sendCallMuteChanged, sendCallVideoChanged } from '../services/socketService';
import { SOCKET_EVENTS } from '@shared/constants/events';

const BORDER_ZONE = 12;

function getPipResizeEdges(
  lx: number, ly: number, w: number, h: number, isCircle: boolean,
): { left: boolean; right: boolean; top: boolean; bottom: boolean } | null {
  if (isCircle) {
    const cx = w / 2, cy = h / 2;
    const dist = Math.sqrt((lx - cx) ** 2 + (ly - cy) ** 2);
    if (dist < w / 2 - BORDER_ZONE * 1.5) return null;
    return { left: lx < cx, right: lx >= cx, top: ly < cy, bottom: ly >= cy };
  }
  const left = lx <= BORDER_ZONE;
  const right = lx >= w - BORDER_ZONE;
  const top = ly <= BORDER_ZONE;
  const bottom = ly >= h - BORDER_ZONE;
  if (!left && !right && !top && !bottom) return null;
  return { left, right, top, bottom };
}

function getPipResizeCursor(edges: { left: boolean; right: boolean; top: boolean; bottom: boolean } | null): string {
  if (!edges) return 'grab';
  const { left, right, top, bottom } = edges;
  if ((top && left) || (bottom && right)) return 'nw-resize';
  if ((top && right) || (bottom && left)) return 'ne-resize';
  if (top || bottom) return 'ns-resize';
  if (left || right) return 'ew-resize';
  return 'grab';
}

const CallScreen: React.FC = () => {
  const { activeCall, localStream, remoteStream, isMuted, isVideoOff, callDuration, setMuted, setVideoOff } =
    useCallStore();
  const { endActiveCall } = useCallContext();
  const { currentUser } = useAuthStore();
  const { chats, nicknames } = useChatStore();
  const [showCallChat, setShowCallChat] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(380);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [localIsMain, setLocalIsMain] = useState(false);
  const [pipPos, setPipPos] = useState<{ top: number; left: number } | null>(null);
  const [pipShape, setPipShape] = useState<'rectangle' | 'circle'>('rectangle');
  const [pipSize, setPipSize] = useState<{ w: number; h: number }>({ w: 192, h: 192 });
  const [pipCursor, setPipCursor] = useState('grab');
  const [pipHidden, setPipHidden] = useState(false);
  const [showPipMenu, setShowPipMenu] = useState(false);
  const [gridView, setGridView] = useState(false);
  const [gridSwapped, setGridSwapped] = useState(false);
  const [gridSplit, setGridSplit] = useState(50); // percent for left panel
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showScreenPicker, setShowScreenPicker] = useState(false);
  // Tracks whether the user has enabled their camera during a voice call (upgrade to video)
  const [isLocalVideoEnabled, setIsLocalVideoEnabled] = useState(false);
  // Tracks remote peer's mute/video-off status (received via socket)
  const [peerIsMuted, setPeerIsMuted] = useState(false);
  const [peerIsVideoOff, setPeerIsVideoOff] = useState(false);
  const gridResizingRef = useRef(false);

  // Clamp pipPos when window is resized so PiP never goes off-screen
  useEffect(() => {
    const onResize = () => {
      setPipPos((prev) => {
        if (!prev) return prev;
        const PIP_W = pipShape === 'circle' ? 120 : pipSize.w;
        const PIP_H = pipShape === 'circle' ? 120 : pipSize.h;
        return {
          top:  Math.max(0, Math.min(window.innerHeight - PIP_H, prev.top)),
          left: Math.max(0, Math.min(window.innerWidth  - PIP_W, prev.left)),
        };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pipShape, pipSize]);
  const pipDragRef = useRef<{ startX: number; startY: number; origTop: number; origLeft: number } | null>(null);
  const pipMovedRef = useRef(false);
  const isResizing = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [volumeBars, setVolumeBars] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = chatPanelWidth;
    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX - ev.clientX;
      setChatPanelWidth(Math.min(700, Math.max(280, startWidth + delta)));
    };
    const onMouseUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Hidden <audio> element ref — plays remote stream for audio calls
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Attach remoteStream to hidden audio element so speakers actually play it
  useEffect(() => {
    if (!remoteStream) return;
    if (!remoteAudioRef.current) {
      const audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current = audio;
    }
    remoteAudioRef.current.srcObject = remoteStream;
    const savedSpeaker = localStorage.getItem('selectedSpeakerId');
    if (savedSpeaker && typeof (remoteAudioRef.current as any).setSinkId === 'function') {
      (remoteAudioRef.current as any).setSinkId(savedSpeaker).catch(() => {});
    }
    remoteAudioRef.current.play().catch(() => {});
    return () => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null;
      }
    };
  }, [remoteStream]);

  // Audio visualiser — analyses remote stream volume (analyser only, no destination)
  useEffect(() => {
    if (!remoteStream) return;
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    audioCtx.resume().catch(() => {});
    const source = audioCtx.createMediaStreamSource(remoteStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    // Do NOT connect to destination — the <audio> element handles playback
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const bars = Array.from({ length: 7 }, (_, i) => {
        const idx = Math.floor((i * data.length) / 7);
        return Math.round((data[idx] / 255) * 100);
      });
      setVolumeBars(bars);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      audioCtx.close();
    };
  }, [remoteStream]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide controls after 3 s of mouse idle, show immediately on mouse move
  useEffect(() => {
    const showAndReset = () => {
      setControlsVisible(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    };
    showAndReset(); // start the timer right away
    window.addEventListener('mousemove', showAndReset);
    return () => {
      window.removeEventListener('mousemove', showAndReset);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Listen for remote peer's mute / video-off status changes
  useEffect(() => {
    // Reset statuses whenever the call changes
    setPeerIsMuted(false);
    setPeerIsVideoOff(false);

    const socket = getSocket();
    if (!socket || !activeCall) return;

    const handleMuteChanged = (data: { callId: string; from: string; isMuted: boolean }) => {
      if (data.callId !== activeCall.callId) return;
      setPeerIsMuted(data.isMuted);
    };
    const handleVideoChanged = (data: { callId: string; from: string; isVideoOff: boolean }) => {
      if (data.callId !== activeCall.callId) return;
      setPeerIsVideoOff(data.isVideoOff);
    };

    socket.on(SOCKET_EVENTS.CALL_MUTE_CHANGED, handleMuteChanged);
    socket.on(SOCKET_EVENTS.CALL_VIDEO_CHANGED, handleVideoChanged);
    return () => {
      socket.off(SOCKET_EVENTS.CALL_MUTE_CHANGED, handleMuteChanged);
      socket.off(SOCKET_EVENTS.CALL_VIDEO_CHANGED, handleVideoChanged);
    };
  }, [activeCall]);

  if (!activeCall) return null;

  const isVideo = activeCall.type === 'video';
  // A voice call is effectively in video mode when the local user has enabled their camera
  // OR when the remote peer is sending video (i.e. track is live AND not muted).
  // After replaceTrack(null), the track stays 'live' but .muted becomes true — we treat
  // that the same as no video so the UI correctly reverts to voice-call mode.
  const remoteHasVideo = !!remoteStream && remoteStream.getVideoTracks().some(
    (t) => t.readyState !== 'ended' && !t.muted,
  );
  // Local has video active when:
  //   - native video call AND camera not turned off, OR
  //   - voice call upgraded by the local user (isLocalVideoEnabled)
  const localHasVideo = (isVideo && !isVideoOff) || isLocalVideoEnabled;
  // Show video UI only when at least one side is actively sending video.
  // When both users turn off their cameras the layout reverts to voice-call mode.
  const effectiveIsVideo = localHasVideo || remoteHasVideo;
  const currentUid = currentUser?.uid ?? '';
  const peerUid = activeCall.callerId === currentUid ? activeCall.receiverId : activeCall.callerId;
  const peerRawName =
    activeCall.callerId === currentUid
      ? (activeCall.receiverName || activeCall.receiverId)
      : activeCall.callerName;
  const peerName = nicknames[peerUid] || peerRawName;
  const peerAvatar =
    activeCall.callerId === currentUid
      ? activeCall.receiverAvatar
      : activeCall.callerAvatar;

  // Find the 1-on-1 chat between the two participants
  const callChat = chats.find(
    (c) =>
      c.type === 'private' &&
      c.members.includes(currentUid) &&
      c.members.includes(peerUid),
  );

  const handleToggleMute = () => {
    const newMuted = !isMuted;
    setMuted(newMuted);
    toggleAudio(!newMuted);
    if (activeCall.status === 'active') {
      sendCallMuteChanged(peerUid, activeCall.callId, newMuted);
    }
  };

  const handleToggleVideo = async () => {
    if (activeCall.type === 'video') {
      // Standard video call: use replaceTrack so remote sees muted state change
      const newOff = !isVideoOff;
      setVideoOff(newOff);
      try { await toggleVideo(!newOff); } catch (e) { console.error('[Call] toggleVideo', e); }
      if (activeCall.status === 'active') {
        sendCallVideoChanged(peerUid, activeCall.callId, newOff);
      }
    } else {
      // Voice call: upgrade/downgrade to video
      if (isLocalVideoEnabled) {
        try {
          await disableCallVideo();
          setIsLocalVideoEnabled(false);
          if (activeCall.status === 'active') sendCallVideoChanged(peerUid, activeCall.callId, true);
        } catch (e) { console.error('[Call] disableCallVideo', e); }
      } else {
        try {
          await enableCallVideo();
          setIsLocalVideoEnabled(true);
          if (activeCall.status === 'active') sendCallVideoChanged(peerUid, activeCall.callId, false);
        } catch (e) { console.error('[Call] enableCallVideo', e); }
      }
    }
  };

  const handleSwitchMic = async (deviceId: string) => {
    try { await switchMicrophone(deviceId); } catch (e) { console.error('[Call] switchMic', e); }
  };

  const handleSwitchCamera = async (deviceId: string) => {
    try { await switchCamera(deviceId); } catch (e) { console.error('[Call] switchCamera', e); }
  };

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      try {
        await stopScreenShare();
      } catch (e) {
        console.error('[Call] stopScreenShare', e);
      }
      setIsScreenSharing(false);
    } else if (window.electronAPI) {
      // In Electron, getDisplayMedia is blocked — show our custom source picker instead
      setShowScreenPicker(true);
    } else {
      // Browser path: use native getDisplayMedia
      try {
        await startScreenShare(() => setIsScreenSharing(false));
        setIsScreenSharing(true);
      } catch {
        // User cancelled the picker — no action needed
      }
    }
  };

  const handleScreenPickerSelect = async (sourceId: string) => {
    setShowScreenPicker(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // Chromium-specific constraints for desktopCapturer sources
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
          },
        } as MediaTrackConstraints,
      });
      await startScreenShare(() => setIsScreenSharing(false), stream);
      setIsScreenSharing(true);
    } catch (e) {
      console.error('[Call] screen share via desktopCapturer failed', e);
    }
  };

  const handleSwitchSpeaker = async (deviceId: string) => {
    localStorage.setItem('selectedSpeakerId', deviceId);
    if (remoteAudioRef.current && typeof (remoteAudioRef.current as any).setSinkId === 'function') {
      try { await (remoteAudioRef.current as any).setSinkId(deviceId); } catch (e) { console.error('[Call] setSinkId', e); }
    }
  };

  const handleGridResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    gridResizingRef.current = true;
    const containerEl = (e.currentTarget as HTMLElement).parentElement;
    const onMove = (ev: MouseEvent) => {
      if (!gridResizingRef.current || !containerEl) return;
      const rect = containerEl.getBoundingClientRect();
      const pct = Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100));
      setGridSplit(pct);
    };
    const onUp = () => {
      gridResizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleGridResizeTouchStart = (e: React.TouchEvent) => {
    gridResizingRef.current = true;
    const containerEl = (e.currentTarget as HTMLElement).parentElement;
    const onMove = (ev: TouchEvent) => {
      if (!gridResizingRef.current || !containerEl || !ev.touches[0]) return;
      const rect = containerEl.getBoundingClientRect();
      const pct = Math.min(80, Math.max(20, ((ev.touches[0].clientX - rect.left) / rect.width) * 100));
      setGridSplit(pct);
    };
    const onUp = () => {
      gridResizingRef.current = false;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  };

  const handlePipCornerMouseDown = (
    _e: React.MouseEvent,
    _corner: 'nw' | 'ne' | 'sw' | 'se',
    _currentW: number,
    _currentH: number,
    _currentTop: number,
    _currentLeft: number,
    _isCircle: boolean,
  ) => { /* replaced by border-drag resize in handlePipMouseDown */ };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        backgroundColor: '#0f172a',
        display: 'flex',
        flexDirection: 'row',
      }}
    >
      {/* ── Video / audio area ─────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
      {/* ── GRID VIEW ─────────────────────────────────────────────── */}
      {effectiveIsVideo && gridView && activeCall.status !== 'ringing' ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'row' }}>
          {/* Left panel */}
          {(() => {
            const leftStream  = gridSwapped ? (localStream)  : (remoteStream);
            const rightStream = gridSwapped ? (remoteStream) : (localStream);
            const leftLabel   = gridSwapped ? 'You'          : peerName;
            const rightLabel  = gridSwapped ? peerName       : 'You';
            const leftMuted   = gridSwapped;
            const leftMirror  = gridSwapped;
            const rightMuted  = !gridSwapped;
            const rightMirror = !gridSwapped;
            return (
              <>
                <div style={{ width: `${gridSplit}%`, height: '100%', position: 'relative', flexShrink: 0, backgroundColor: '#000' }}>
                  <VideoStream stream={leftStream} label={leftLabel} muted={leftMuted} mirror={leftMirror}
                    objectFit="contain"
                    style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, borderRadius: 0 }} />
                  <div style={{
                    position: 'absolute', top: 10, left: 12,
                    background: 'rgba(0,0,0,0.5)', color: '#fff',
                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                  }}>{leftLabel}</div>
                </div>

                {/* Draggable divider */}
                <div
                  onMouseDown={handleGridResizeMouseDown}
                  onTouchStart={handleGridResizeTouchStart}
                  style={{
                    width: 6, height: '100%', cursor: 'col-resize', flexShrink: 0,
                    background: 'rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 5, position: 'relative',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.5)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                >
                  {/* swap button centered on divider */}
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setGridSwapped((v) => !v)}
                    title="Swap sides"
                    style={{
                      position: 'absolute',
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'rgba(15,23,42,0.9)',
                      border: '1.5px solid rgba(255,255,255,0.25)',
                      color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, padding: 0, zIndex: 10,
                    }}
                  >
                    ⇄
                  </button>
                </div>

                {/* Right panel */}
                <div style={{ flex: 1, height: '100%', position: 'relative', backgroundColor: '#000' }}>
                  <VideoStream stream={rightStream} label={rightLabel} muted={rightMuted} mirror={rightMirror}
                    objectFit="contain"
                    style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, borderRadius: 0 }} />
                  <div style={{
                    position: 'absolute', top: 10, left: 12,
                    background: 'rgba(0,0,0,0.5)', color: '#fff',
                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                  }}>{rightLabel}</div>
                </div>
              </>
            );
          })()}
        </div>
      ) : effectiveIsVideo && activeCall.status !== 'ringing' ? (
        <>
          {/* Full-screen stream */}
          <VideoStream
            stream={localIsMain ? localStream : remoteStream}
            label={localIsMain ? 'You' : peerName}
            muted={localIsMain}
            mirror={localIsMain}
            objectFit="contain"
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
          />

          {/* PiP stream — draggable, menu, shape toggle, hide */}
          {(localIsMain ? remoteStream : localStream) && (() => {
            const pipStream = localIsMain ? remoteStream : localStream;
            // Only show PiP when the stream actually has live video
            if (!pipStream?.getVideoTracks().some((t) => t.readyState !== 'ended')) return null;
            const PIP_W = pipSize.w;
            const PIP_H = pipShape === 'circle' ? pipSize.w : pipSize.h;
            const borderRad = pipShape === 'circle' ? '50%' : 12;
            const pos = pipPos ?? { top: window.innerHeight - PIP_H - 100, left: window.innerWidth - PIP_W - 20 };

            const handlePipMouseDown = (e: React.MouseEvent) => {
              e.preventDefault();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const lx = e.clientX - rect.left;
              const ly = e.clientY - rect.top;
              const isCircle = pipShape === 'circle';
              const edges = getPipResizeEdges(lx, ly, PIP_W, PIP_H, isCircle);

              if (edges) {
                // ── RESIZE from border ────────────────────────────────
                pipMovedRef.current = true;
                const startX = e.clientX;
                const startY = e.clientY;
                const origW = PIP_W, origH = PIP_H;
                const origTop = pos.top, origLeft = pos.left;
                const MIN = 80, MAX = 640;
                const onMove = (ev: MouseEvent) => {
                  const dx = ev.clientX - startX;
                  const dy = ev.clientY - startY;
                  let newW = origW, newH = origH, newTop = origTop, newLeft = origLeft;
                  if (edges.right)  newW = Math.max(MIN, Math.min(MAX, origW + dx));
                  if (edges.left) { newW = Math.max(MIN, Math.min(MAX, origW - dx)); newLeft = origLeft + (origW - newW); }
                  if (edges.bottom) newH = Math.max(MIN, Math.min(MAX, origH + dy));
                  if (edges.top)  { newH = Math.max(MIN, Math.min(MAX, origH - dy)); newTop = origTop + (origH - newH); }
                  if (isCircle) { const s = Math.max(newW, newH); newW = s; newH = s; }
                  setPipSize({ w: newW, h: newH });
                  setPipPos({ top: Math.max(0, newTop), left: Math.max(0, newLeft) });
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
                return;
              }

              // ── DRAG ─────────────────────────────────────────────────
              pipMovedRef.current = false;
              pipDragRef.current = { startX: e.clientX, startY: e.clientY, origTop: pos.top, origLeft: pos.left };
              const onMove = (ev: MouseEvent) => {
                if (!pipDragRef.current) return;
                const dx = ev.clientX - pipDragRef.current.startX;
                const dy = ev.clientY - pipDragRef.current.startY;
                if (!pipMovedRef.current && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                pipMovedRef.current = true;
                const newTop = Math.max(0, Math.min(window.innerHeight - PIP_H, pipDragRef.current.origTop + dy));
                const newLeft = Math.max(0, Math.min(window.innerWidth - PIP_W, pipDragRef.current.origLeft + dx));
                setPipPos({ top: newTop, left: newLeft });
              };
              const onUp = () => {
                pipDragRef.current = null;
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            };

            const handlePipTouchStart = (e: React.TouchEvent) => {
              const touch = e.touches[0];
              pipMovedRef.current = false;
              pipDragRef.current = { startX: touch.clientX, startY: touch.clientY, origTop: pos.top, origLeft: pos.left };
              const onMove = (ev: TouchEvent) => {
                if (!pipDragRef.current || !ev.touches[0]) return;
                const dx = ev.touches[0].clientX - pipDragRef.current.startX;
                const dy = ev.touches[0].clientY - pipDragRef.current.startY;
                if (!pipMovedRef.current && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                pipMovedRef.current = true;
                const newTop = Math.max(0, Math.min(window.innerHeight - PIP_H, pipDragRef.current.origTop + dy));
                const newLeft = Math.max(0, Math.min(window.innerWidth - PIP_W, pipDragRef.current.origLeft + dx));
                setPipPos({ top: newTop, left: newLeft });
              };
              const onUp = () => {
                pipDragRef.current = null;
                window.removeEventListener('touchmove', onMove);
                window.removeEventListener('touchend', onUp);
              };
              window.addEventListener('touchmove', onMove, { passive: true });
              window.addEventListener('touchend', onUp);
            };

            // Hidden state: snap reveal tab to the nearest horizontal edge
            if (pipHidden) {
              const pipCenterX = pos.left + PIP_W / 2;
              const onRightSide = pipCenterX > window.innerWidth / 2;
              const tabTop = pos.top + PIP_H / 2 - 18;

              return (
                <button
                  key="pip-reveal"
                  onClick={() => setPipHidden(false)}
                  title="Show camera preview"
                  style={{
                    position: 'fixed',
                    top: tabTop,
                    // Left-edge tab: left:0, opens right. Right-edge tab: right:0, opens left.
                    ...(onRightSide
                      ? { right: 0, left: 'auto', borderRadius: '8px 0 0 8px', borderRight: 'none', borderLeft: '1px solid rgba(255,255,255,0.18)' }
                      : { left: 0, right: 'auto', borderRadius: '0 8px 8px 0', borderLeft: 'none', borderRight: '1px solid rgba(255,255,255,0.18)' }
                    ),
                    width: 28,
                    height: 36,
                    background: 'rgba(15,23,42,0.85)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 20,
                    fontSize: 16,
                    padding: 0,
                  }}
                >
                  {onRightSide ? '‹' : '›'}
                </button>
              );
            }

            type CornerEntry = ['nw'|'ne'|'sw'|'se', string, React.CSSProperties, React.CSSProperties];
            const isCircle = pipShape === 'circle';
            // no corner handles — resize via border drag

            return (
              <div
                key="pip"
                onMouseDown={handlePipMouseDown}
                onTouchStart={handlePipTouchStart}
                onMouseMove={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const cur = getPipResizeCursor(
                    getPipResizeEdges(e.clientX - rect.left, e.clientY - rect.top, PIP_W, PIP_H, pipShape === 'circle')
                  );
                  if (cur !== pipCursor) setPipCursor(cur);
                }}
                onMouseLeave={() => { if (pipCursor !== 'grab') setPipCursor('grab'); }}
                onClick={() => { if (!pipMovedRef.current) setLocalIsMain((v) => !v); }}
                title="Drag · Click to swap"
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  width: PIP_W,
                  height: PIP_H,
                  zIndex: 20,
                  userSelect: 'none',
                  cursor: pipCursor,
                }}
              >
                {/* Video clip layer — borderRadius clips video to shape */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: borderRad,
                  overflow: 'hidden',
                  border: '2px solid rgba(255,255,255,0.2)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  transition: 'border-radius 0.35s ease, border-color 0.2s, box-shadow 0.2s',
                }}>
                  <VideoStream
                    stream={localIsMain ? remoteStream : localStream}
                    muted={!localIsMain}
                    mirror={!localIsMain}
                    label={localIsMain ? peerName : 'You'}
                    style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
                  />
                </div>

                {/* Three-dot handle — hover to open menu */}
                <div
                  onMouseEnter={() => setShowPipMenu(true)}
                  onMouseLeave={() => setShowPipMenu(false)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    bottom: pipShape === 'circle' ? '10%' : 6,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 5,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  {/* dots pill */}
                  <div style={{
                    background: 'rgba(0,0,0,0.65)',
                    borderRadius: 10,
                    padding: '1px 9px 3px',
                    cursor: 'default',
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: 20,
                    lineHeight: 1,
                    letterSpacing: 3,
                  }}>···</div>

                  {/* popup menu — appears above dots */}
                  {showPipMenu && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 6px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#1e293b',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        padding: '4px 0',
                        width: 162,
                        boxShadow: '0 6px 24px rgba(0,0,0,0.7)',
                        zIndex: 10,
                      }}
                    >
                      {(['circle', 'rectangle'] as const).map((shape) => (
                        <button
                          key={shape}
                          onClick={() => { setPipShape(shape); setShowPipMenu(false); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            width: '100%', padding: '8px 12px',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: pipShape === shape ? '#6366f1' : '#e2e8f0',
                            fontSize: 13,
                            fontWeight: pipShape === shape ? 600 : 400,
                            textAlign: 'left',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{ fontSize: 15 }}>{shape === 'circle' ? '◯' : '▭'}</span>
                          <span>{shape === 'circle' ? 'Circle view' : 'Rectangle view'}</span>
                          {pipShape === shape && <span style={{ marginLeft: 'auto', color: '#6366f1', fontSize: 12 }}>✓</span>}
                        </button>
                      ))}
                      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                      <button
                        onClick={() => { setPipHidden(true); setShowPipMenu(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '8px 12px',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#e2e8f0', fontSize: 13, textAlign: 'left',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span style={{ fontSize: 15 }}>✕</span>
                        <span>Hide view</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </>
      ) : isScreenSharing ? (
        /* Voice call — local user is sharing: show their own screen preview */
        <VideoStream
          stream={localStream}
          muted
          style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
          objectFit="contain"
        />
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', color: '#fff', gap: 12,
        }}>
          <UserAvatar name={peerName} avatar={peerAvatar} size={110} />
          <h2 style={{ margin: 0, fontSize: 24 }}>{peerName}</h2>
          <p style={{ color: '#94a3b8', fontSize: 16, margin: 0 }}>
            {activeCall.status === 'ringing' ? 'Calling...' : formatDuration(callDuration)}
          </p>
          {activeCall.status === 'active' && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 32, marginTop: 4 }}>
              {volumeBars.map((h, i) => (
                <div
                  key={i}
                  style={{
                    width: 4,
                    borderRadius: 2,
                    height: `${Math.max(4, h * 0.32)}px`,
                    backgroundColor: h > 20 ? '#6366f1' : '#475569',
                    transition: 'height 0.08s ease',
                  }}
                />
              ))}
            </div>
          )}
          {/* Local mute status */}
          {isMuted && activeCall.status === 'active' && (
            <div style={{ fontSize: 13, color: '#f87171', background: 'rgba(239,68,68,0.15)', padding: '4px 12px', borderRadius: 20, marginTop: 2 }}>
              You are muted
            </div>
          )}
          {/* Remote mute status */}
          {peerIsMuted && activeCall.status === 'active' && (
            <div style={{ fontSize: 13, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '4px 12px', borderRadius: 20, marginTop: 2 }}>
              {peerName} is muted
            </div>
          )}
        </div>
      )}

      {/* Local Video (PiP) is now rendered inside the isVideo branch above */}
      {/* Peer info overlay (video mode) */}
      {effectiveIsVideo && (
        <div style={{
          position: 'absolute', top: 16, left: 16,
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(0,0,0,0.5)',
          borderRadius: 30,
          padding: '4px 12px 4px 4px',
          opacity: controlsVisible ? 1 : 0,
          transform: controlsVisible ? 'translateY(0)' : 'translateY(-12px)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          <UserAvatar name={peerName} avatar={peerAvatar} size={30} />
          <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>{peerName}</span>
        </div>
      )}
      {/* Duration (video calls) */}
      {effectiveIsVideo && activeCall.status === 'active' && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: controlsVisible ? 'translateX(-50%)' : 'translateX(-50%) translateY(-12px)',
            backgroundColor: 'rgba(0,0,0,0.5)',
            color: '#fff',
            padding: '4px 12px',
            borderRadius: 20,
            fontSize: 14,
            opacity: controlsVisible ? 1 : 0,
            transition: 'opacity 0.4s ease, transform 0.4s ease',
            pointerEvents: controlsVisible ? 'auto' : 'none',
          }}
        >
          {formatDuration(callDuration)}
        </div>
      )}

      {/* Mute / video-off status badges (video mode, active call) */}
      {effectiveIsVideo && activeCall.status === 'active' && (isMuted || peerIsMuted || !localHasVideo || !remoteHasVideo) && (
        <div style={{
          position: 'absolute',
          top: 56,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          zIndex: 12,
          pointerEvents: 'none',
        }}>
          {isMuted && (
            <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(0,0,0,0.6)', padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
              You are muted
            </div>
          )}
          {peerIsMuted && (
            <div style={{ fontSize: 12, color: '#fbbf24', background: 'rgba(0,0,0,0.6)', padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
              {peerName} is muted
            </div>
          )}
          {!localHasVideo && (
            <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(0,0,0,0.6)', padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
              Your camera is off
            </div>
          )}
          {!remoteHasVideo && (
            <div style={{ fontSize: 12, color: '#fbbf24', background: 'rgba(0,0,0,0.6)', padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
              {peerName}'s camera is off
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: controlsVisible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(20px)',
        opacity: controlsVisible ? 1 : 0,
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        pointerEvents: controlsVisible ? 'auto' : 'none',
      }}>
        <CallControls
          isMuted={isMuted}
          isVideoOff={activeCall.type === 'video' ? isVideoOff : !isLocalVideoEnabled}
          callType={activeCall.type}
          onToggleMute={handleToggleMute}
          onToggleVideo={handleToggleVideo}
          onEndCall={endActiveCall}
          isChatOpen={showCallChat}
          onToggleChat={callChat ? () => setShowCallChat((o) => !o) : undefined}
          onSwitchMic={handleSwitchMic}
          onSwitchCamera={effectiveIsVideo ? handleSwitchCamera : undefined}
          onSwitchSpeaker={handleSwitchSpeaker}
          isGridView={gridView}
          onToggleGridView={effectiveIsVideo ? () => setGridView((v) => !v) : undefined}
          isScreenSharing={isScreenSharing}
          onToggleScreenShare={handleToggleScreenShare}
        />
      </div>
      </div>{/* end video area */}

      {/* ── In-call chat sidebar ────────────────────────────────────── */}
      {showCallChat && callChat && (
        <>
          {/* Drag handle */}
          <div
            onMouseDown={handleResizeMouseDown}
            style={{
              width: 5,
              height: '100%',
              cursor: 'col-resize',
              backgroundColor: 'transparent',
              flexShrink: 0,
              zIndex: 10,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(99,102,241,0.5)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
          />
          <div
            style={{
              width: chatPanelWidth,
              minWidth: 280,
              maxWidth: 700,
              height: '100%',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
            }}
          >
            <ChatWindow chatId={callChat.chatId} />
          </div>
        </>
      )}

      {/* Screen source picker (Electron only) */}
      {showScreenPicker && (
        <ScreenPickerModal
          onSelect={handleScreenPickerSelect}
          onCancel={() => setShowScreenPicker(false)}
        />
      )}
    </div>
  );
};

export default CallScreen;
