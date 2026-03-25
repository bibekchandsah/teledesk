import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
import InCallChatList from '../components/InCallChatList';
import { toggleAudio, toggleVideo, switchMicrophone, switchCamera, startScreenShare, stopScreenShare, enableCallVideo, disableCallVideo } from '../services/webrtcService';
import { getSocket, sendCallMuteChanged, sendCallVideoChanged } from '../services/socketService';
import { SOCKET_EVENTS } from '@shared/constants/events';
import callAudioService from '../services/callAudioService';
import { Pin, PinOff } from 'lucide-react';

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
  const { activeCall, localStream, remoteStream, isMuted, isVideoOff, callDuration, isCalleeRinging, setMuted, setVideoOff } =
    useCallStore();
  const { endActiveCall } = useCallContext();
  const { currentUser } = useAuthStore();
  const { chats, nicknames } = useChatStore();
  const [showCallChat, setShowCallChat] = useState(false);
  const handleToggleMiniMode = () => {
    if (!isMiniMode) {
      setShowCallChat(false);
      // Center mini mode initially if not set
      if (!miniPos.top) {
        setMiniPos({ top: 20, left: window.innerWidth - miniSize.w - 20 });
      }
    }
    setIsMiniMode(!isMiniMode);
  };

  const menuItems = [ { label: 'Chat', onClick: () => setViewMode('chat') } ];
  const [viewMode, setViewMode] = useState<'chat' | 'list'>('chat');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [gridOrientation, setGridOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [chatPanelWidth, setChatPanelWidth] = useState(380);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [localIsMain, setLocalIsMain] = useState(false);
  const [pipPos, setPipPos] = useState<{ top: number; left: number } | null>(null);
  const [pipShape, setPipShape] = useState<'rectangle' | 'circle'>('rectangle');
  const [pipSize, setPipSize] = useState<{ w: number; h: number }>({ w: 240, h: 135 });
  const [pipCursor, setPipCursor] = useState('grab');
  const [pipHidden, setPipHidden] = useState(false);
  const [pipControlsVisible, setPipControlsVisible] = useState(false);
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
  const [activeMicId, setActiveMicId] = useState(localStorage.getItem('selectedMicId') ?? '');
  const [activeCamId, setActiveCamId] = useState(localStorage.getItem('selectedCameraId') ?? '');
  const [activeSpeakerId, setActiveSpeakerId] = useState(localStorage.getItem('selectedSpeakerId') ?? 'default');
  
  const [isMiniMode, setIsMiniMode] = useState(false);
  const [miniSize, setMiniSize] = useState({ w: 320, h: 180 });
  const [miniPos, setMiniPos] = useState({ top: 20, left: window.innerWidth - 340 });
  
  const [mainCursor, setMainCursor] = useState('default');
  const gridResizingRef = useRef(false);

  // Clamp pipPos when window is resized so PiP never goes off-screen
  useEffect(() => {
    const onResize = () => {
      setPipPos((prev) => {
        if (!prev) return prev;
        const limitW = isMiniMode ? miniSize.w : window.innerWidth;
        const limitH = isMiniMode ? miniSize.h : window.innerHeight;
        const PIP_W = pipShape === 'circle' ? (isMiniMode ? Math.min(120, miniSize.w * 0.4) : 120) : (isMiniMode ? Math.min(pipSize.w, miniSize.w * 0.4) : pipSize.w);
        const PIP_H = pipShape === 'circle' ? PIP_W : (isMiniMode ? Math.min(pipSize.h, miniSize.h * 0.4) : pipSize.h);
        return {
          top:  Math.max(0, Math.min(limitH - PIP_H, prev.top)),
          left: Math.max(0, Math.min(limitW - PIP_W, prev.left)),
        };
      });
    };
    onResize(); // Run when state changes
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pipShape, pipSize, isMiniMode, miniSize]);
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => {
      setWindowSize({ w: window.innerWidth, h: window.innerHeight });
      if (!isMiniMode) {
        setMiniPos(p => ({ ...p, left: window.innerWidth - miniSize.w - 20 }));
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isMiniMode, miniSize.w]);
  const pipDragRef = useRef<{ startX: number; startY: number; origTop: number; origLeft: number } | null>(null);
  const pipMovedRef = useRef(false);
  const isResizing = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pipIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [volumeBars, setVolumeBars] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

  // Manage outgoing ringtone for calls initiated by current user
  useEffect(() => {
    if (!activeCall || !currentUser) return;

    const isOutgoingCall = activeCall.callerId === currentUser.uid;
    const isRinging = activeCall.status === 'ringing';

    if (isOutgoingCall && isRinging) {
      // Play outgoing ringtone
      callAudioService.playOutgoingRingtone();
    } else {
      // Stop outgoing ringtone when call is accepted, rejected, or ended
      callAudioService.stopOutgoingRingtone();
    }

    // Cleanup when component unmounts or call changes
    return () => {
      callAudioService.stopOutgoingRingtone();
    };
  }, [activeCall, currentUser]);

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = chatPanelWidth;
    const onMouseMove = (ev: PointerEvent) => {
      if (!isResizing.current) return;
      const delta = startX - ev.clientX;
      setChatPanelWidth(Math.min(700, Math.max(280, startWidth + delta)));
    };
    const onMouseUp = () => {
      isResizing.current = false;
      window.removeEventListener('pointermove', onMouseMove);
      window.removeEventListener('pointerup', onMouseUp);
    };
    window.addEventListener('pointermove', onMouseMove);
    window.addEventListener('pointerup', onMouseUp);
  };

  // ─── Play remote stream through DOM <audio> element ───────────────────
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!remoteStream || !remoteAudioRef.current) return;
    const audioEl = remoteAudioRef.current;
    audioEl.srcObject = remoteStream;
    audioEl.muted = false; // CRITICAL: ensure remote audio is NOT muted
    audioEl.volume = 1.0;
    const savedSpeaker = localStorage.getItem('selectedSpeakerId');
    if (savedSpeaker && typeof (audioEl as any).setSinkId === 'function') {
      (audioEl as any).setSinkId(savedSpeaker).catch(() => { });
    }
    audioEl.play().catch((e) => {
      if (e.name !== 'AbortError') {
        console.error('[CallScreen] Audio autoplay failed:', e);
      }
    });
  }, [remoteStream]);
  // Audio visualiser — analyses remote stream volume (analyser only, no destination)
  useEffect(() => {
    if (!remoteStream || remoteStream.getAudioTracks().length === 0) return;
    
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    audioCtx.resume().catch(() => {});
    const source = audioCtx.createMediaStreamSource(remoteStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    // DO NOT connect to destination — that would duplicate audio playback!
    // The DOM <audio> element handles playback; this is visualization only.
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
  }, [remoteStream]);

  const handleInteraction = useCallback(() => {
    setControlsVisible(true);
    setPipControlsVisible(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
      setPipControlsVisible(false);
    }, 5000);
  }, []);

  useEffect(() => {
    handleInteraction(); // Show controls initially
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [handleInteraction]);

  // Sync active device IDs when localStream changes
  useEffect(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      const currentMicId = audioTrack.getSettings().deviceId;
      if (currentMicId) {
        setActiveMicId(currentMicId);
        if (!localStorage.getItem('selectedMicId')) localStorage.setItem('selectedMicId', currentMicId);
      }
    }
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      const currentCamId = videoTrack.getSettings().deviceId;
      if (currentCamId) {
        setActiveCamId(currentCamId);
        if (!localStorage.getItem('selectedCameraId')) localStorage.setItem('selectedCameraId', currentCamId);
      }
    }
  }, [localStream]);

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
  const callChat = useMemo(() => {
    return chats.find(
      (c) =>
        c.type === 'private' &&
        c.members.includes(currentUid) &&
        c.members.includes(peerUid),
    );
  }, [chats, currentUid, peerUid]);

  // Set initial selectedChatId when callChat is first resolved
  useEffect(() => {
    if (callChat && !selectedChatId) {
      setSelectedChatId(callChat.chatId);
    }
  }, [callChat, selectedChatId]);

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
    localStorage.setItem('selectedMicId', deviceId);
    setActiveMicId(deviceId);
    try { await switchMicrophone(deviceId); } catch (e) { console.error('[Call] switchMic', e); }
  };

  const handleSwitchCamera = async (deviceId: string) => {
    localStorage.setItem('selectedCameraId', deviceId);
    setActiveCamId(deviceId);
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
    setActiveSpeakerId(deviceId);
    if (remoteAudioRef.current && typeof (remoteAudioRef.current as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId === 'function') {
      try {
        await (remoteAudioRef.current as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
      } catch (e) {
        console.error('[Call] switchSpeaker', e);
      }
    }
  };

  const handleGridResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    gridResizingRef.current = true;
    const containerEl = (e.currentTarget as HTMLElement).parentElement;
    const onMove = (ev: PointerEvent) => {
      if (!gridResizingRef.current || !containerEl) return;
      const rect = containerEl.getBoundingClientRect();
      if (gridOrientation === 'horizontal') {
        const pct = Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100));
        setGridSplit(pct);
      } else {
        const pct = Math.min(80, Math.max(20, ((ev.clientY - rect.top) / rect.height) * 100));
        setGridSplit(pct);
      }
    };
    const onUp = () => {
      gridResizingRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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

  const handleMainPointerDown = (e: React.PointerEvent) => {
    if (!isMiniMode) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
    const edges = {
      left: lx <= 12,
      right: lx >= miniSize.w - 12,
      top: ly <= 12,
      bottom: ly >= miniSize.h - 12,
    };
    const isAnyEdge = edges.left || edges.right || edges.top || edges.bottom;

    if (isAnyEdge) {
      isResizing.current = true;
      const sx = e.clientX, sy = e.clientY;
      const oW = miniSize.w, oH = miniSize.h, oT = miniPos.top, oL = miniPos.left;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        let nW = oW, nH = oH, nT = oT, nL = oL;
        if (edges.right) nW = Math.max(240, oW + dx);
        if (edges.left) { nW = Math.max(240, oW - dx); nL = oL + (oW - nW); }
        if (edges.bottom) nH = Math.max(135, oH + dy);
        if (edges.top) { nH = Math.max(135, oH - dy); nT = oT + (oH - nH); }
        setMiniSize({ w: nW, h: nH });
        setMiniPos({ top: nT, left: nL });
        // Keep PiP attached to bottom-right during main window resize
        setPipPos((prev) => {
          if (!prev) return prev;
          const distR = oW - prev.left;
          const distB = oH - prev.top;
          return { top: nH - distB, left: nW - distR };
        });
      };
      const onUp = () => { 
        isResizing.current = false;
        window.removeEventListener('pointermove', onMove); 
        window.removeEventListener('pointerup', onUp); 
      };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    } else {
      isResizing.current = true;
      const sx = e.clientX, sy = e.clientY, oT = miniPos.top, oL = miniPos.left;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        setMiniPos({ top: oT + dy, left: oL + dx });
      };
      const onUp = () => { 
        isResizing.current = false;
        window.removeEventListener('pointermove', onMove); 
        window.removeEventListener('pointerup', onUp); 
      };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    }
  };

  const handleMainMouseMove = (e: React.PointerEvent) => {
    if (!isMiniMode || isResizing.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
    const edges = {
      left: lx <= 12,
      right: lx >= miniSize.w - 12,
      top: ly <= 12,
      bottom: ly >= miniSize.h - 12,
    };
    const { left, right, top, bottom } = edges;
    let cur = 'move'; // Default for dragging
    if ((top && left) || (bottom && right)) cur = 'nwse-resize';
    else if ((top && right) || (bottom && left)) cur = 'nesw-resize';
    else if (top || bottom) cur = 'ns-resize';
    else if (left || right) cur = 'ew-resize';
    
    if (cur !== mainCursor) setMainCursor(cur);
  };

  return (
    <div
      onPointerDown={handleMainPointerDown}
      onPointerMove={handleMainMouseMove}
      onMouseMove={handleInteraction}
      onMouseEnter={handleInteraction}
      onTouchStart={handleInteraction}
      onMouseLeave={() => isMiniMode && !isResizing.current && setMainCursor('default')}
      style={{
        position: 'fixed',
        zIndex: 999,
        backgroundColor: '#0f172a',
        display: 'flex',
        flexDirection: 'row',
        overflow: isMiniMode ? 'visible' : 'hidden', // Allow handles/shadows to show
        cursor: isMiniMode ? mainCursor : 'default',
        ...(isMiniMode ? {
          top: miniPos.top,
          left: miniPos.left,
          width: miniSize.w,
          height: miniSize.h,
          borderRadius: 16,
          boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.1)',
          transition: isResizing.current ? 'none' : 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
        } : {
          inset: 0,
          transition: 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
        })
      }}
    >
      {/* ── DOM Audio Element for Remote Stream ────────────── */}
      <audio ref={remoteAudioRef} autoPlay muted={false} style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} />

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
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: gridOrientation === 'horizontal' ? 'row' : 'column' }}>
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
                <div style={{ 
                  width: gridOrientation === 'horizontal' ? `${gridSplit}%` : '100%', 
                  height: gridOrientation === 'horizontal' ? '100%' : `${gridSplit}%`, 
                  position: 'relative', flexShrink: 0, backgroundColor: '#000' 
                }}>
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
                  onPointerDown={handleGridResizePointerDown}
                  style={{
                    width: gridOrientation === 'horizontal' ? 6 : '100%',
                    height: gridOrientation === 'horizontal' ? '100%' : 6,
                    cursor: gridOrientation === 'horizontal' ? 'col-resize' : 'row-resize',
                    flexShrink: 0,
                    background: 'rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 5, position: 'relative',
                    touchAction: 'none'
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
                <div style={{ flex: 1, position: 'relative', backgroundColor: '#000' }}>
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
            muted={localIsMain} // Only mute if showing local stream (prevent echo)
            mirror={localIsMain}
            objectFit="contain"
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
          />

          {/* PiP stream — draggable, menu, shape toggle, hide */}
          {(localIsMain ? remoteStream : localStream) && (() => {
            const pipStream = localIsMain ? remoteStream : localStream;
            // Only show PiP when the stream actually has live video
            if (!pipStream?.getVideoTracks().some((t) => t.readyState !== 'ended')) return null;
            const PIP_W = isMiniMode ? Math.min(pipSize.w, miniSize.w * 0.4) : pipSize.w;
            const PIP_H = pipShape === 'circle' ? PIP_W : (isMiniMode ? Math.min(pipSize.h, miniSize.h * 0.4) : pipSize.h);
            const borderRad = pipShape === 'circle' ? '50%' : 12;
            const containerW = isMiniMode ? miniSize.w : window.innerWidth;
            const containerH = isMiniMode ? miniSize.h : window.innerHeight;
            const pos = pipPos ?? { top: containerH - PIP_H - (isMiniMode ? 10 : 100), left: containerW - PIP_W - (isMiniMode ? 10 : 20) };

            const handlePipPointerDown = (e: React.PointerEvent) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
              const isCircle = pipShape === 'circle';
              const edges = getPipResizeEdges(lx, ly, PIP_W, PIP_H, isCircle);
              if (edges) {
                pipMovedRef.current = true;
                const sx = e.clientX, sy = e.clientY, oW = PIP_W, oH = PIP_H, oT = pos.top, oL = pos.left;
                const MIN = 80, MAX = 640;
                const onMove = (ev: PointerEvent) => {
                  const dx = ev.clientX - sx, dy = ev.clientY - sy;
                  let nW = oW, nH = oH, nT = oT, nL = oL;
                  if (edges.right)  nW = Math.max(MIN, Math.min(MAX, oW + dx));
                  if (edges.left) { nW = Math.max(MIN, Math.min(MAX, oW - dx)); nL = oL + (oW - nW); }
                  if (edges.bottom) nH = Math.max(MIN, Math.min(MAX, oH + dy));
                  if (edges.top)  { nH = Math.max(MIN, Math.min(MAX, oH - dy)); nT = oT + (oH - nH); }
                  if (isCircle) { 
                    const s = Math.max(nW, nH); 
                    nW = s; 
                    nH = oH; // Restore the previous rectangular height so it's not lost
                  }
                  setPipSize({ w: nW, h: nH }); setPipPos({ top: Math.max(0, nT), left: Math.max(0, nL) });
                };
                const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
                window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
                return;
              }
              pipMovedRef.current = false;
              pipDragRef.current = { startX: e.clientX, startY: e.clientY, origTop: pos.top, origLeft: pos.left };
              const onMove = (ev: PointerEvent) => {
                if (!pipDragRef.current) return;
                const dx = ev.clientX - pipDragRef.current.startX, dy = ev.clientY - pipDragRef.current.startY;
                if (!pipMovedRef.current && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                pipMovedRef.current = true;
                const limitW = isMiniMode ? miniSize.w : window.innerWidth;
                const limitH = isMiniMode ? miniSize.h : window.innerHeight;
                setPipPos({ top: Math.max(0, Math.min(limitH - PIP_H, pipDragRef.current.origTop + dy)), left: Math.max(0, Math.min(limitW - PIP_W, pipDragRef.current.origLeft + dx)) });
              };
              const onUp = () => { pipDragRef.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
              window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
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
                onPointerDown={handlePipPointerDown}
                onMouseMove={(e) => { 
                  handleInteraction();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); 
                  const cur = getPipResizeCursor(getPipResizeEdges(e.clientX - rect.left, e.clientY - rect.top, PIP_W, PIP_H, pipShape === 'circle')); 
                  if (cur !== pipCursor) setPipCursor(cur); 
                }}
                onMouseLeave={() => { 
                  if (pipCursor !== 'grab') setPipCursor('grab');
                }}
                onClick={() => { if (!pipMovedRef.current) setLocalIsMain((v) => !v); }}
                title="Drag · Click to swap"
                style={{
                  position: isMiniMode ? 'absolute' : 'fixed',
                  zIndex: 20,
                  userSelect: 'none',
                  cursor: pipCursor,
                  touchAction: 'none',
                  ...(isMiniMode ? {
                    bottom: miniSize.h - pos.top - PIP_H,
                    right: miniSize.w - pos.left - PIP_W,
                  } : {
                    top: pos.top,
                    left: pos.left,
                  }),
                  width: PIP_W,
                  height: PIP_H,
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
                    muted={!localIsMain} // Mute local stream in PiP, unmute remote
                    mirror={!localIsMain}
                    label={localIsMain ? peerName : 'You'}
                    style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
                  />
                </div>

                {/* Three-dot handle — hover to open menu */}
                <div
                  onMouseEnter={() => {
                    setShowPipMenu(true);
                    if (pipIdleTimerRef.current) clearTimeout(pipIdleTimerRef.current);
                  }}
                  onMouseLeave={() => {
                    setShowPipMenu(false);
                  }}
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
                    opacity: (pipControlsVisible || showPipMenu) ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                    pointerEvents: (pipControlsVisible || showPipMenu) ? 'auto' : 'none'
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
                          onClick={() => { 
                            if (shape === 'rectangle' && pipShape === 'circle') {
                              // Restore 16:9 ratio when switching back from circle
                              setPipSize(prev => ({ w: prev.w, h: Math.round(prev.w * 9 / 16) }));
                            }
                            setPipShape(shape); 
                            setShowPipMenu(false); 
                          }}
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
            {activeCall.status === 'ringing'
              ? (isCalleeRinging ? 'Ringing...' : 'Calling...')
              : formatDuration(callDuration)}
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

      {/* Top right buttons (Pin, etc.) */}
      <div style={{
        position: 'absolute', top: 16, right: 16,
        display: 'flex', alignItems: 'center', gap: 8,
        opacity: controlsVisible ? 1 : 0,
        transform: controlsVisible ? 'translateY(0)' : 'translateY(-12px)',
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        zIndex: 50,
      }}>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleToggleMiniMode}
          title={isMiniMode ? "Exit mini mode" : "Enter mini mode"}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background-color 0.2s',
            pointerEvents: 'auto',
          }}
        >
          {isMiniMode ? <PinOff size={18} /> : <Pin size={18} />}
        </button>
      </div>

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
        bottom: isMiniMode ? 10 : 24,
        left: '50%',
        transform: controlsVisible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(20px)',
        opacity: controlsVisible ? 1 : 0,
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        pointerEvents: controlsVisible ? 'auto' : 'none',
        zIndex: 100,
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
          onToggleGridView={() => setGridView(!gridView)}
          gridOrientation={gridOrientation}
          onToggleGridOrientation={() => setGridOrientation(v => v === 'horizontal' ? 'vertical' : 'horizontal')}
          isScreenSharing={isScreenSharing}
          onToggleScreenShare={handleToggleScreenShare}
          activeMicId={activeMicId}
          activeCamId={activeCamId}
          activeSpeakerId={activeSpeakerId}
          isMiniMode={isMiniMode}
        />
      </div>
      </div>{/* end video area */}

      {/* ── In-call chat sidebar ────────────────────────────────────── */}
      {showCallChat && callChat && (
        <>
          {/* Drag handle */}
          <div
            onPointerDown={handleResizePointerDown}
            style={{
              width: 5,
              height: '100%',
              cursor: 'col-resize',
              backgroundColor: 'transparent',
              flexShrink: 0,
              zIndex: 10,
              touchAction: 'none'
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
            {viewMode === 'list' ? (
              <InCallChatList 
                activeChatId={selectedChatId || undefined} 
                onChatSelect={(id) => {
                  setSelectedChatId(id);
                  setViewMode('chat');
                }}
                onClose={() => setShowCallChat(false)}
              />
            ) : (
              <ChatWindow 
                chatId={selectedChatId || callChat?.chatId} 
                onBack={() => {
                  if (window.innerWidth < 425) {
                    setShowCallChat(false);
                  } else {
                    setViewMode('list');
                  }
                }} 
              />
            )}
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
