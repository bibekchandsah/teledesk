import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Sp from 'simple-peer';
import type { Instance as SimplePeerInstance } from 'simple-peer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SimplePeer = ((Sp as any).default ?? Sp) as typeof Sp;
import { WEBRTC_CONFIG } from '../config/webrtc';
import { SOCKET_EVENTS } from '@shared/constants/events';
import VideoStream from '../components/VideoStream';
import UserAvatar from '../components/UserAvatar';
import CallControls from '../components/CallControls';
import ScreenPickerModal from '../components/ScreenPickerModal';
import ChatWindow from './ChatWindow';
import { formatDuration } from '../utils/formatters';
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff, Pin, PinOff, Minus, Square, Copy, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { listenToUserChats } from '../services/firebaseService';
import { getChats, getUserById } from '../services/apiService';
import callAudioService from '../services/callAudioService';
import InCallChatList from '../components/InCallChatList';

interface CallWindowInitData {
  callId: string;
  callType: 'video' | 'voice';
  isOutgoing: boolean;
  targetUserId: string;
  targetName: string;
  targetAvatar?: string;
  startTime?: number;
  isContinuing?: boolean;
}

// Parse init data from URL query param (passed by Electron main process)
function parseCallWindowData(): CallWindowInitData | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('d');
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw)) as CallWindowInitData;
  } catch {
    return null;
  }
}

type CallStatus = 'ringing' | 'active' | 'ended';

const ICE_SERVERS = [...WEBRTC_CONFIG.ICE_SERVERS] as RTCIceServer[];
const PEER_CONFIG = {
  iceServers: ICE_SERVERS,
  iceTransportPolicy: WEBRTC_CONFIG.ICE_TRANSPORT_POLICY,
  bundlePolicy: WEBRTC_CONFIG.BUNDLE_POLICY,
  rtcpMuxPolicy: WEBRTC_CONFIG.RTCP_MUX_POLICY,
};

// ─── PiP drag/resize helpers ──────────────────────────────────────────────────
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

function getPipResizeCursor(
  edges: { left: boolean; right: boolean; top: boolean; bottom: boolean } | null,
): string {
  if (!edges) return 'grab';
  const { left, right, top, bottom } = edges;
  if ((top && left) || (bottom && right)) return 'nw-resize';
  if ((top && right) || (bottom && left)) return 'ne-resize';
  if (top || bottom) return 'ns-resize';
  if (left || right) return 'ew-resize';
  return 'grab';
}

const CallWindowPage: React.FC = () => {
  // callData is available synchronously from URL params — no IPC round-trip
  const [callData] = useState<CallWindowInitData | null>(() => parseCallWindowData());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>(() =>
    parseCallWindowData()?.isContinuing ? 'active' : 'ringing'
  );
  const [isRinging, setIsRinging] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isLocalVideoEnabled, setIsLocalVideoEnabled] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showScreenPicker, setShowScreenPicker] = useState(false);
  const [localIsMain, setLocalIsMain] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isAccepted, setIsAccepted] = useState(() =>
    parseCallWindowData()?.isContinuing ?? false
  );
  const [isMiniMode, setIsMiniMode] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [volumeBars, setVolumeBars] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [gridView, setGridView] = useState(false);
  const [gridOrientation, setGridOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [gridSwapped, setGridSwapped] = useState(false);
  const [gridSplit, setGridSplit] = useState(50);
  const [pipPos, setPipPos] = useState<{ top: number; left: number } | null>(null);
  const [pipShape, setPipShape] = useState<'rectangle' | 'circle'>('rectangle');
  const [pipSize, setPipSize] = useState<{ w: number; h: number }>({ w: 240, h: 135 });
  const [pipCursor, setPipCursor] = useState('grab');
  const [pipHidden, setPipHidden] = useState(false);
  const [pipControlsVisible, setPipControlsVisible] = useState(false);
  const [showPipMenu, setShowPipMenu] = useState(false);
  const [showCallChat, setShowCallChat] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(380);
  const [viewMode, setViewMode] = useState<'chat' | 'list'>('chat');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  // Remote peer's mute/video status (received via relayed socket events)
  const [peerIsMuted, setPeerIsMuted] = useState(false);
  const [peerIsVideoOff, setPeerIsVideoOff] = useState(false);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [iceState, setIceState] = useState<RTCIceConnectionState>('new');
  const [activeMicId, setActiveMicId] = useState(localStorage.getItem('selectedMicId') ?? '');
  const [activeCamId, setActiveCamId] = useState(localStorage.getItem('selectedCameraId') ?? '');
  const [activeSpeakerId, setActiveSpeakerId] = useState(localStorage.getItem('selectedSpeakerId') ?? 'default');

  const { currentUser } = useAuthStore();
  const { chats, setChats, setUserProfile, nicknames } = useChatStore();
  const displayName = (callData && nicknames[callData.targetUserId]) || callData?.targetName || '';

  const chatResizingRef = useRef(false);
  const peerRef = useRef<SimplePeerInstance | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Initialize ref from URL params immediately so mount effect can use it
  const callDataRef = useRef<CallWindowInitData | null>(parseCallWindowData());
  const firstRemoteStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pipIdleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callDurationRef = useRef(0);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  // Queue ICE candidates that arrive before the peer is constructed
  const pendingSignalsRef = useRef<Array<import('simple-peer').SignalData>>([]);
  const hasReceivedInitialAnswerRef = useRef(false);
  // Buffer peer-creation intent when OFFER/ACCEPT_CALL arrives before stream is ready
  const pendingPeerRef = useRef<{
    isInitiator: boolean;
    callId: string;
    targetUserId: string;
    offer?: RTCSessionDescriptionInit;
  } | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pipDragRef = useRef<{ startX: number; startY: number; origTop: number; origLeft: number } | null>(null);
  const pipMovedRef = useRef(false);
  const gridResizingRef = useRef(false);

  // ─── Bootstrap chats + user profiles for the in-call chat sidebar ──────────
  useEffect(() => {
    if (!currentUser) return;
    
    let isSubscribed = false;
    let chatUnsub: (() => void) | null = null;

    const loadData = async () => {
      if (isSubscribed) return;
      isSubscribed = true;

      // Eagerly fetch chats via REST API
      try {
        const res = await getChats();
        if (res.success && res.data) {
          setChats(res.data);
          const memberIds = new Set<string>();
          res.data.forEach((c) => c.members.forEach((m) => memberIds.add(m)));
          memberIds.delete(currentUser.uid);
          for (const uid of memberIds) {
            const r = await getUserById(uid);
            if (r.success && r.data) setUserProfile(r.data);
          }
        }
      } catch (err) {
        console.error('[CallWindow] Failed to load initial chats:', err);
      }

      // Start realtime listener
      try {
        chatUnsub = listenToUserChats(currentUser.uid, async (updatedChats) => {
          setChats(updatedChats);
          const memberIds = new Set<string>();
          updatedChats.forEach((c) => c.members.forEach((m) => memberIds.add(m)));
          memberIds.delete(currentUser.uid);
          for (const uid of memberIds) {
            const r = await getUserById(uid);
            if (r.success && r.data) setUserProfile(r.data);
          }
        });
      } catch (err) {
        console.error('[CallWindow] Failed to start chat listener:', err);
      }
    };

    loadData();

    return () => {
      chatUnsub?.();
    };
  }, [currentUser?.uid, setChats, setUserProfile]);

  // ─── Play incoming ringtone ───────────────────────────────────────────────
  useEffect(() => {
    const cd = callDataRef.current;
    if (cd && !cd.isOutgoing && !isAccepted) {
      callAudioService.playIncomingRingtone();
    }
    return () => {
      callAudioService.stopIncomingRingtone();
    };
  }, [isAccepted]);

  // ─── Derived: 1-on-1 chat between the two call participants ────────────────
  const callChat = useMemo(() => {
    if (!callData || !currentUser) return undefined;
    return chats.find((c) => c.type === 'private' && c.members.includes(currentUser.uid) && c.members.includes(callData.targetUserId));
  }, [chats, callData, currentUser]);

  // Set initial selectedChatId when callChat is first resolved
  useEffect(() => {
    if (callChat && !selectedChatId) {
      setSelectedChatId(callChat.chatId);
    }
  }, [callChat, selectedChatId]);

  // ─── Chat panel resize drag ─────────────────────────────────────────────────
  const handleChatResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    chatResizingRef.current = true;
    const startX = e.clientX;
    const startWidth = chatPanelWidth;
    const onMove = (ev: PointerEvent) => {
      if (!chatResizingRef.current) return;
      setChatPanelWidth(Math.min(700, Math.max(280, startWidth - (ev.clientX - startX))));
    };
    const onUp = () => {
      chatResizingRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ─── IPC signal sender (routes socket events through main window) ──────────
  const sendSocketEvent = useCallback((event: string, data: unknown) => {
    window.electronAPI?.emitSocketFromCallWindow?.(event, data);
  }, []);

  // ─── Capture local media stream ───────────────────────────────────────────
  const captureLocalStream = async (callType: 'video' | 'voice'): Promise<MediaStream> => {
    const savedMicId = localStorage.getItem('selectedMicId');
    const savedCamId = localStorage.getItem('selectedCameraId');
    const audioConstraint: MediaTrackConstraints = savedMicId
      ? { deviceId: { ideal: savedMicId } }
      : {};

    if (callType !== 'video') {
      return navigator.mediaDevices.getUserMedia({ audio: audioConstraint || true, video: false });
    }

    // For video: try preferred settings first, fall back progressively if the
    // camera source is busy or the constraints are rejected by the device.
    const videoWithPrefs: MediaTrackConstraints = savedCamId
      ? { deviceId: { ideal: savedCamId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };

    try {
      return await navigator.mediaDevices.getUserMedia({ audio: audioConstraint || true, video: videoWithPrefs });
    } catch {
      // Last resort: drop all video constraints and let the browser/OS pick any camera.
      return navigator.mediaDevices.getUserMedia({ audio: audioConstraint || true, video: true });
    }
  };

  // ─── Auto-accept when continuing a call on a new device ──────────────────
  // (callStatus and isAccepted are already initialized correctly via useState)

  // ─── Start call timer ─────────────────────────────────────────────────────
  const startTimer = (initialDuration = 0) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCallDuration(initialDuration);
    callDurationRef.current = initialDuration;
    timerRef.current = setInterval(() => {
      setCallDuration((d) => d + 1);
      callDurationRef.current += 1;
    }, 1000);
  };

  // ─── Cleanup everything ───────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    firstRemoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus('ended');
    pendingSignalsRef.current = [];
    hasReceivedInitialAnswerRef.current = false;
    callAudioService.stopAllRingtones();
  }, []);

  // ─── Create WebRTC initiator peer (caller side) ───────────────────────────
  const createInitiatorPeer = useCallback(
    (stream: MediaStream, callId: string, targetUserId: string) => {
      if (peerRef.current) peerRef.current.destroy();
      // Reset state for fresh handshake (important for device transfer)
      pendingSignalsRef.current = [];
      hasReceivedInitialAnswerRef.current = false;

      const peer = new SimplePeer({
        initiator: true,
        stream,
        trickle: true,
        config: PEER_CONFIG,
      });

      peer.on('signal', (data) => {
        if ((data as { type?: string }).type === 'offer') {
          sendSocketEvent(SOCKET_EVENTS.OFFER, {
            to: targetUserId,
            callId,
            offer: { type: (data as { type: string; sdp?: string }).type, sdp: (data as { sdp?: string }).sdp },
          });
        } else if ((data as { candidate?: unknown }).candidate) {
          sendSocketEvent(SOCKET_EVENTS.ICE_CANDIDATE, {
            to: targetUserId,
            callId,
            candidate: data,
          });
        }
      });

      peer.on('stream', (stream: MediaStream) => {
        firstRemoteStreamRef.current = stream;
        setRemoteStream(stream);
      });

      // Merge new video tracks added via renegotiation (e.g. remote enables camera during voice call)
      peer.on('track', (track: MediaStreamTrack) => {
        if (track.kind === 'video' && firstRemoteStreamRef.current) {
          firstRemoteStreamRef.current.getVideoTracks().forEach((t) => {
            if (t.id !== track.id) firstRemoteStreamRef.current!.removeTrack(t);
          });
          if (!firstRemoteStreamRef.current.getTrackById(track.id)) {
            firstRemoteStreamRef.current.addTrack(track);
          }
          const updated = new MediaStream(firstRemoteStreamRef.current.getTracks());
          firstRemoteStreamRef.current = updated;
          setRemoteStream(updated);
        }
      });

      peer.on('error', (err) => console.error('[CallWindow] Initiator peer error:', err));
      peer.on('close', () => console.log('[CallWindow] Initiator peer closed'));

      peerRef.current = peer;

      // Flush queued ICE candidates
      pendingSignalsRef.current.forEach((sig) => peer.signal(sig));
      pendingSignalsRef.current = [];
    },
    [sendSocketEvent],
  );

  // ─── Create WebRTC receiver peer (callee side) ───────────────────────────
  const createReceiverPeer = useCallback(
    (
      stream: MediaStream,
      callId: string,
      callerId: string,
      offer: RTCSessionDescriptionInit,
    ) => {
      if (peerRef.current) peerRef.current.destroy();

      const peer = new SimplePeer({
        initiator: false,
        stream,
        trickle: true,
        config: PEER_CONFIG,
      });

      peer.on('signal', (data) => {
        if ((data as { type?: string }).type === 'answer') {
          sendSocketEvent(SOCKET_EVENTS.ANSWER, {
            to: callerId,
            callId,
            answer: { type: (data as { type: string; sdp?: string }).type, sdp: (data as { sdp?: string }).sdp },
          });
        } else if ((data as { candidate?: unknown }).candidate) {
          sendSocketEvent(SOCKET_EVENTS.ICE_CANDIDATE, {
            to: callerId,
            callId,
            candidate: data,
          });
        }
      });

      peer.on('stream', (stream: MediaStream) => {
        firstRemoteStreamRef.current = stream;
        setRemoteStream(stream);
      });

      // Merge new video tracks added via renegotiation (e.g. remote enables camera during voice call)
      peer.on('track', (track: MediaStreamTrack) => {
        if (track.kind === 'video' && firstRemoteStreamRef.current) {
          firstRemoteStreamRef.current.getVideoTracks().forEach((t) => {
            if (t.id !== track.id) firstRemoteStreamRef.current!.removeTrack(t);
          });
          if (!firstRemoteStreamRef.current.getTrackById(track.id)) {
            firstRemoteStreamRef.current.addTrack(track);
          }
          const updated = new MediaStream(firstRemoteStreamRef.current.getTracks());
          firstRemoteStreamRef.current = updated;
          setRemoteStream(updated);
        }
      });

      peer.on('error', (err) => console.error('[CallWindow] Receiver peer error:', err));
      peer.on('close', () => console.log('[CallWindow] Receiver peer closed'));

      peerRef.current = peer;

      // Signal the initial offer
      peer.signal(offer as import('simple-peer').SignalData);

      // Flush queued ICE candidates
      pendingSignalsRef.current.forEach((sig) => peer.signal(sig));
      pendingSignalsRef.current = [];
    },
    [sendSocketEvent],
  );

  // ─── Handle a relayed socket event from main window ───────────────────────
  const handleSocketEvent = useCallback(
    (event: string, data: unknown) => {
      const cd = callDataRef.current;
      const localSt = localStreamRef.current;

      if (event === SOCKET_EVENTS.ACCEPT_CALL) {
        if (cd?.isOutgoing) {
          // Caller side: remote accepted — create initiator peer
          if (localSt && cd) {
            const initialDur = cd.startTime ? Math.floor((Date.now() - cd.startTime) / 1000) : 0;
            createInitiatorPeer(localSt, cd.callId, cd.targetUserId);
            startTimer(initialDur);
            setCallStatus('active');
          } else if (cd && !localSt) {
            // Stream not captured yet — buffer for when it arrives
            pendingPeerRef.current = { isInitiator: true, callId: cd.callId, targetUserId: cd.targetUserId };
          }
        } else {
          // Receiver side: caller just re-joined from another device (transfer/continue)
          // Destroy our current peer so we can accept the NEW offer that will follow
          if (peerRef.current) {
            console.log('[CallWindow] Peer transferred — restarting webRTC connection');
            peerRef.current.destroy();
            peerRef.current = null;
          }
          // IMPORTANT: Clear any pending signals for the old session
          pendingSignalsRef.current = [];
          hasReceivedInitialAnswerRef.current = false;
        }
        return;
      }

      if (event === SOCKET_EVENTS.OFFER) {
        const offerData = data as { offer: RTCSessionDescriptionInit; callId: string };

        if (!cd?.isOutgoing && !peerRef.current) {
          // Callee side receiving the initial offer — create receiver peer
          if (localSt && cd) {
            const initialDur = cd.startTime ? Math.floor((Date.now() - cd.startTime) / 1000) : 0;
            createReceiverPeer(localSt, cd.callId, cd.targetUserId, offerData.offer);
            startTimer(initialDur);
            setCallStatus('active');
          } else if (cd && !localSt) {
            // Stream not captured yet — buffer the offer for when it arrives
            pendingPeerRef.current = { isInitiator: false, callId: cd.callId, targetUserId: cd.targetUserId, offer: offerData.offer };
          }
        } else if (peerRef.current && !(peerRef.current as unknown as { destroyed: boolean }).destroyed) {
          // Renegotiation offer for either side (e.g. screen share)
          const pc: RTCPeerConnection = (peerRef.current as unknown as { _pc: RTCPeerConnection })._pc;
          if (pc) {
            pc.setRemoteDescription(new RTCSessionDescription(offerData.offer))
              .then(() => pc.createAnswer())
              .then((answer) => {
                pc.setLocalDescription(answer);
                sendSocketEvent(SOCKET_EVENTS.ANSWER, {
                  to: cd!.targetUserId,
                  callId: cd!.callId,
                  answer: { type: answer.type, sdp: answer.sdp },
                });
              })
              .catch((err) => console.error('[CallWindow] Renegotiation answer failed:', err));
          }
        }
        return;
      }

      if (event === SOCKET_EVENTS.ANSWER) {
        const answerData = data as { answer: import('simple-peer').SignalData };
        if (peerRef.current && !(peerRef.current as unknown as { destroyed: boolean }).destroyed) {
          // Only the Initiator ever receives an *initial* answer.
          // The Receiver only ever receives answers during renegotiation.
          if (cd?.isOutgoing && !hasReceivedInitialAnswerRef.current) {
            hasReceivedInitialAnswerRef.current = true;
            peerRef.current.signal(answerData.answer);
          } else {
            const pc: RTCPeerConnection = (peerRef.current as unknown as { _pc: RTCPeerConnection })._pc;
            if (pc) {
              pc.setRemoteDescription(new RTCSessionDescription(answerData.answer as RTCSessionDescriptionInit)).catch((err) =>
                console.error('[CallWindow] setRemoteDescription(answer) failed:', err),
              );
            }
          }
        }
        return;
      }

      if (event === SOCKET_EVENTS.ICE_CANDIDATE) {
        const icData = data as { candidate: import('simple-peer').SignalData };
        if (peerRef.current && !(peerRef.current as unknown as { destroyed: boolean }).destroyed) {
          peerRef.current.signal(icData.candidate);
        } else {
          // Queue until peer is created
          pendingSignalsRef.current.push(icData.candidate);
        }
        return;
      }

      if (event === SOCKET_EVENTS.CALL_ENDED || event === SOCKET_EVENTS.CALL_REJECTED) {
        cleanup();
        // Delay slightly to let cleanup() settle before IPC
        setTimeout(() => window.electronAPI?.hangupCallWindow?.(), 200);
        return;
      }

      if (event === SOCKET_EVENTS.CALL_RINGING) {
        // Server confirmed the callee's device is ringing
        setIsRinging(true);
        return;
      }

      if (event === SOCKET_EVENTS.CALL_MUTE_CHANGED) {
        const d = data as { callId: string; isMuted: boolean };
        if (cd && d.callId === cd.callId) setPeerIsMuted(d.isMuted);
        return;
      }

      if (event === SOCKET_EVENTS.CALL_VIDEO_CHANGED) {
        const d = data as { callId: string; isVideoOff: boolean };
        if (cd && d.callId === cd.callId) setPeerIsVideoOff(d.isVideoOff);
        return;
      }
    },
    [createInitiatorPeer, createReceiverPeer, sendSocketEvent, cleanup],
  );

  // ─── Mount: register IPC relay listener and immediately start capturing media ─────
  useEffect(() => {
    // Register socket relay listener  first, THEN signal ready so no events are missed
    const unsubSocket = window.electronAPI?.onRelayedSocketEvent?.((event, data) => {
      handleSocketEvent(event, data);
    });

    // Signal that the renderer is ready — flushes buffered relay events from main
    window.electronAPI?.requestCallWindowReady?.();


    // callData is already set from URL params — start capturing media now
    const cd = callDataRef.current;
    if (cd) {
      captureLocalStream(cd.callType)
        .then((stream) => {
          setLocalStream(stream);
          localStreamRef.current = stream;

          // Sync active device IDs from the acquired tracks
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            const currentMicId = audioTrack.getSettings().deviceId;
            if (currentMicId) {
              setActiveMicId(currentMicId);
              if (!localStorage.getItem('selectedMicId')) localStorage.setItem('selectedMicId', currentMicId);
            }
          }
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            const currentCamId = videoTrack.getSettings().deviceId;
            if (currentCamId) {
              setActiveCamId(currentCamId);
              if (!localStorage.getItem('selectedCameraId')) localStorage.setItem('selectedCameraId', currentCamId);
            }
          }
          const savedSpeaker = localStorage.getItem('selectedSpeakerId');
          if (savedSpeaker) setActiveSpeakerId(savedSpeaker);

          // Flush any peer creation that was buffered while waiting for stream
          const pp = pendingPeerRef.current;
          if (pp) {
            pendingPeerRef.current = null;
            const initialDur = cd.startTime ? Math.floor((Date.now() - cd.startTime) / 1000) : 0;
            if (pp.isInitiator) {
              createInitiatorPeer(stream, pp.callId, pp.targetUserId);
            } else if (pp.offer) {
              createReceiverPeer(stream, pp.callId, pp.targetUserId, pp.offer);
            }
            startTimer(initialDur);
            setCallStatus('active');
          }
        })
        .catch((err) => {
          const msg =
            err?.message ||
            'Cannot access camera/microphone. Please check app permissions.';
          console.error('[CallWindow] Media error:', err);
          setMediaError(msg);
        });
    }

    return () => {
      unsubSocket?.();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Play remote stream through DOM <audio> element ───────────────────
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
        console.error('[CallWindow] Audio autoplay failed:', e);
      }
    });
  }, [remoteStream]);

  // ─── Audio visualiser — analyses remote stream volume ────────────────────
  useEffect(() => {
    // If there is no remote stream or it has no audio tracks, skip creating an AudioContext.
    if (!remoteStream || remoteStream.getAudioTracks().length === 0) return;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    audioCtx.resume().catch(() => { });
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
  }, [remoteStream]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Clamp PiP position on window resize ─────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      setPipPos((prev) => {
        if (!prev) return prev;
        const PIP_W = pipSize.w;
        const PIP_H = pipShape === 'circle' ? pipSize.w : pipSize.h;
        return {
          top: Math.max(0, Math.min(window.innerHeight - PIP_H, prev.top)),
          left: Math.max(0, Math.min(window.innerWidth - PIP_W, prev.left)),
        };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pipShape, pipSize]);

  // ─── Sync window maximization state ──────────────────────────────────
  useEffect(() => {
    const unsubMax = window.electronAPI?.onCallWindowMaximized?.(() => setIsWindowMaximized(true));
    const unsubUnmax = window.electronAPI?.onCallWindowUnmaximized?.(() => setIsWindowMaximized(false));
    return () => {
      unsubMax?.();
      unsubUnmax?.();
    };
  }, []);

  // ─── Auto-hide controls after 5s of mouse idle ───────────────────────────
  useEffect(() => {
    const showAndReset = () => {
      setControlsVisible(true);
      setPipControlsVisible(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
        setPipControlsVisible(false);
      }, 5000);
    };
    showAndReset();
    window.addEventListener('mousemove', showAndReset);
    window.addEventListener('touchstart', showAndReset, { passive: true });
    return () => {
      window.removeEventListener('mousemove', showAndReset);
      window.removeEventListener('touchstart', showAndReset);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // ─── Control handlers ─────────────────────────────────────────────────────
  const handleToggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !newMuted;
    });
    const cd = callDataRef.current;
    if (cd && callStatus === 'active') {
      sendSocketEvent(SOCKET_EVENTS.CALL_MUTE_CHANGED, {
        to: cd.targetUserId,
        callId: cd.callId,
        isMuted: newMuted,
      });
    }
  };

  const handleToggleVideo = async () => {
    if (!peerRef.current || (peerRef.current as unknown as { destroyed: boolean }).destroyed) return;
    const pc: RTCPeerConnection = (peerRef.current as unknown as { _pc: RTCPeerConnection })._pc;
    if (!pc) return;

    const cd = callDataRef.current;

    if (cd?.callType === 'video') {
      // ── Standard video call: toggle existing video track ──────────────────
      const newOff = !isVideoOff;
      setIsVideoOff(newOff);
      const tracks = localStreamRef.current?.getVideoTracks() ?? [];
      tracks.forEach((t) => { t.enabled = !newOff; });

      const transceiver = pc.getTransceivers().find(
        (t) =>
          t.sender.track?.kind === 'video' ||
          (t.sender.track === null && t.receiver.track?.kind === 'video'),
      );

      if (transceiver) {
        await (newOff
          ? transceiver.sender.replaceTrack(null)
          : transceiver.sender.replaceTrack(tracks[0] ?? null)
        ).catch((err) => console.error('[CallWindow] toggleVideo replaceTrack failed:', err));
      }
      if (callStatus === 'active' && cd) {
        sendSocketEvent(SOCKET_EVENTS.CALL_VIDEO_CHANGED, {
          to: cd.targetUserId,
          callId: cd.callId,
          isVideoOff: newOff,
        });
      }
    } else {
      // ── Voice call: upgrade to video / downgrade back ─────────────────────
      const sendRenego = async () => {
        const savedHandler = pc.onnegotiationneeded;
        pc.onnegotiationneeded = null;
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (cd) {
            sendSocketEvent(SOCKET_EVENTS.OFFER, {
              to: cd.targetUserId,
              callId: cd.callId,
              offer: { type: offer.type, sdp: offer.sdp },
            });
          }
        } catch (e) {
          console.error('[CallWindow] voice-video renegotiate:', e);
        } finally {
          setTimeout(() => { pc.onnegotiationneeded = savedHandler; }, 0);
        }
      };

      if (isLocalVideoEnabled) {
        // ── Disable camera ───────────────────────────────────────
        const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(null).catch((e) => console.error('[CallWindow] disableCallVideo:', e));
          const tc = pc.getTransceivers().find((t) => t.sender === videoSender);
          if (tc) tc.direction = tc.direction === 'sendrecv' ? 'recvonly' : 'inactive';
        }
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach((t) => { t.stop(); localStreamRef.current!.removeTrack(t); });
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        }
        await sendRenego();
        setIsLocalVideoEnabled(false);
        if (callStatus === 'active' && cd) {
          sendSocketEvent(SOCKET_EVENTS.CALL_VIDEO_CHANGED, {
            to: cd.targetUserId,
            callId: cd.callId,
            isVideoOff: true,
          });
        }
      } else {
        // ── Enable camera ──────────────────────────────────────────
        try {
          const savedCamId = localStorage.getItem('selectedCameraId');
          const videoConstraint: MediaTrackConstraints = savedCamId
            ? { deviceId: { ideal: savedCamId }, width: 1280, height: 720 }
            : { width: 1280, height: 720 };

          const camStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraint });
          const videoTrack = camStream.getVideoTracks()[0];
          if (!videoTrack) return;

          if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach((t) => { t.stop(); localStreamRef.current!.removeTrack(t); });
            localStreamRef.current.addTrack(videoTrack);
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
          }

          const existingTc = pc.getTransceivers().find(
            (t) => t.sender.track?.kind === 'video' || (t.sender.track === null && t.receiver.track?.kind === 'video'),
          );

          if (existingTc) {
            // Reuse existing transceiver: just replace the track and update direction
            await existingTc.sender.replaceTrack(videoTrack).catch((e) => console.error('[CallWindow] enableCallVideo replaceTrack:', e));
            if (existingTc.direction === 'recvonly') existingTc.direction = 'sendrecv';
            if (existingTc.direction === 'inactive') existingTc.direction = 'sendonly';
            await sendRenego();
          } else {
            // New transceiver: suppress simple-peer's handler, addTrack, then renegotiate
            const savedHandler = pc.onnegotiationneeded;
            pc.onnegotiationneeded = null;
            pc.addTrack(videoTrack, localStreamRef.current!);
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              if (cd) {
                sendSocketEvent(SOCKET_EVENTS.OFFER, {
                  to: cd.targetUserId,
                  callId: cd.callId,
                  offer: { type: offer.type, sdp: offer.sdp },
                });
              }
            } catch (e) {
              console.error('[CallWindow] enableCallVideo addTrack:', e);
            } finally {
              setTimeout(() => { pc.onnegotiationneeded = savedHandler; }, 0);
            }
          }


          setIsLocalVideoEnabled(true);
          if (callStatus === 'active' && cd) {
            sendSocketEvent(SOCKET_EVENTS.CALL_VIDEO_CHANGED, {
              to: cd.targetUserId,
              callId: cd.callId,
              isVideoOff: false,
            });
          }
        }
        catch (e) {
          console.error('[CallWindow] enableCallVideo:', e);
        }
      }
    }
  };

  const handleHangup = () => {
    const cd = callDataRef.current;
    if (cd) {
      sendSocketEvent(SOCKET_EVENTS.END_CALL, {
        to: cd.targetUserId,
        callId: cd.callId,
      });
    }
    cleanup();
    window.electronAPI?.hangupCallWindow?.();
  };

  // ─── Incoming call: user taps Accept ──────────────────────────────────────
  const handleAcceptCall = () => {
    const cd = callDataRef.current;
    if (!cd) return;
    sendSocketEvent(SOCKET_EVENTS.ACCEPT_CALL, { callId: cd.callId, callerId: cd.targetUserId });
    window.electronAPI?.sendWindowEvent?.('incoming-accepted');
    setIsAccepted(true);
  };

  // ─── Incoming call: user taps Decline ────────────────────────────────────
  const handleRejectCall = () => {
    const cd = callDataRef.current;
    if (!cd) return;
    sendSocketEvent(SOCKET_EVENTS.REJECT_CALL, { callId: cd.callId, callerId: cd.targetUserId });
    window.electronAPI?.sendWindowEvent?.('incoming-rejected');
    if (window.electronAPI) {
      window.electronAPI.closeCallWindow?.();
    } else {
      window.close();
    }
  };

  // ─── Device switch handlers ───────────────────────────────────────────────
  const handleSwitchMic = async (deviceId: string) => {
    localStorage.setItem('selectedMicId', deviceId);
    setActiveMicId(deviceId);
    try {
      const ns = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video: false });
      const newTrack = ns.getAudioTracks()[0];
      if (!newTrack) return;
      if (peerRef.current && !(peerRef.current as unknown as { destroyed: boolean }).destroyed) {
        const pc: RTCPeerConnection = (peerRef.current as unknown as { _pc: RTCPeerConnection })._pc;
        const sender = pc?.getSenders().find((s) => s.track?.kind === 'audio');
        if (sender) await sender.replaceTrack(newTrack);
      }
      const oldTrack = localStreamRef.current?.getAudioTracks()[0];
      if (oldTrack && localStreamRef.current) { oldTrack.stop(); localStreamRef.current.removeTrack(oldTrack); localStreamRef.current.addTrack(newTrack); }
    } catch (e) { console.error('[CallWindow] switchMic failed', e); }
  };

  const handleSwitchCamera = async (deviceId: string) => {
    localStorage.setItem('selectedCameraId', deviceId);
    setActiveCamId(deviceId);
    try {
      const ns = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: deviceId } } });
      const newTrack = ns.getVideoTracks()[0];
      if (!newTrack) return;
      if (peerRef.current && !(peerRef.current as unknown as { destroyed: boolean }).destroyed) {
        const pc: RTCPeerConnection = (peerRef.current as unknown as { _pc: RTCPeerConnection })._pc;
        const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
      }
      const oldTrack = localStreamRef.current?.getVideoTracks()[0];
      if (oldTrack && localStreamRef.current) { oldTrack.stop(); localStreamRef.current.removeTrack(oldTrack); localStreamRef.current.addTrack(newTrack); }
      if (localStreamRef.current) setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } catch (e) { console.error('[CallWindow] switchCamera failed', e); }
  };

  const handleSwitchSpeaker = async (deviceId: string) => {
    localStorage.setItem('selectedSpeakerId', deviceId);
    setActiveSpeakerId(deviceId);
    const audio = remoteAudioRef.current as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (audio?.setSinkId) {
      try { await audio.setSinkId(deviceId); } catch (e) { console.error('[CallWindow] setSinkId failed', e); }
    }
  };

  const handleToggleMiniMode = () => {
    const nextMode = !isMiniMode;
    setIsMiniMode(nextMode);
    window.electronAPI?.setCallMiniMode(nextMode);
    // Adjust PiP size and position for mini mode
    if (nextMode) {
      setPipSize({ w: 112, h: 63 });
      setPipPos(null); // Reset to default (which will use mini-mode offsets)
      setControlsVisible(false);
      setPipControlsVisible(false);
    } else {
      setPipSize({ w: 240, h: 135 });
      setPipPos(null);
    }
  };

  // ─── Grid resize ──────────────────────────────────────────────────────────
  const handleGridResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    gridResizingRef.current = true;
    const containerEl = (e.currentTarget as HTMLElement).parentElement;
    const onMove = (ev: PointerEvent) => {
      if (!gridResizingRef.current || !containerEl) return;
      const rect = containerEl.getBoundingClientRect();
      if (gridOrientation === 'horizontal') {
        setGridSplit(Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100)));
      } else {
        setGridSplit(Math.min(80, Math.max(20, ((ev.clientY - rect.top) / rect.height) * 100)));
      }
    };
    const onUp = () => { gridResizingRef.current = false; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else if (window.electronAPI) {
      setShowScreenPicker(true);
    } else {
      const wasSharing = await startScreenShare();
      if (wasSharing) setIsScreenSharing(true);
    }
  };

  const stopScreenShare = async () => {
    const cd = callDataRef.current;
    const origStream = localStreamRef.current;
    if (!peerRef.current || !cd || !origStream) return;

    const pc: RTCPeerConnection = (peerRef.current as unknown as { _pc: RTCPeerConnection })._pc;
    if (!pc) return;

    const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
    const origVideoTrack =
      callData?.callType === 'video' ? origStream.getVideoTracks()[0] ?? null : null;

    if (videoSender) {
      await videoSender
        .replaceTrack(origVideoTrack)
        .catch((err) => console.error('[CallWindow] stopScreenShare replaceTrack failed:', err));
    }
    setIsScreenSharing(false);
    // Re-apply muted state
    if (origVideoTrack) origVideoTrack.enabled = !isVideoOff;
  };

  const startScreenShare = async (captureStream?: MediaStream): Promise<boolean> => {
    const cd = callDataRef.current;
    if (!peerRef.current || !cd) return false;

    const pc: RTCPeerConnection = (peerRef.current as unknown as { _pc: RTCPeerConnection })._pc;
    if (!pc) return false;

    try {
      let screenStream = captureStream;
      if (!screenStream) {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      }
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) return false;

      const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      }
      screenTrack.onended = () => {
        stopScreenShare();
      };
      return true;
    } catch {
      return false;
    }
  };

  const handleScreenPickerSelect = async (sourceId: string) => {
    setShowScreenPicker(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
          },
        } as MediaTrackConstraints,
      });
      const started = await startScreenShare(stream);
      if (started) setIsScreenSharing(true);
    } catch (e) {
      console.error('[CallWindow] screen pick failed:', e);
    }
  };

  // ─── Derived display values ─────────────────────────────────────────────────
  const isVideoCall = callData?.callType === 'video';
  const remoteHasVideo =
    !!remoteStream && remoteStream.getVideoTracks().some((t) => t.readyState !== 'ended' && !t.muted);
  const localHasVideo = (isVideoCall && !isVideoOff) || isLocalVideoEnabled;
  const effectiveIsVideo = localHasVideo || remoteHasVideo || isScreenSharing;

  // ─── Media error screen ───────────────────────────────────────────────
  if (mediaError) {
    return (
      <div
        style={{
          height: '100vh',
          backgroundColor: '#0f172a',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          color: '#f87171',
          fontFamily: 'system-ui, sans-serif',
          padding: 32,
          textAlign: 'center',
        }}
      >
        {/* Draggable area */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 36,
          zIndex: 100,
          ['WebkitAppRegion' as any]: 'drag',
          ...(window.electronAPI?.platform === 'win32' && { paddingRight: 138 }),
        }} />

        <MicOff size={48} />
        <p style={{ fontSize: 16, maxWidth: 320 }}>{mediaError}</p>
        <button
          onClick={handleHangup}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: '#ef4444',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Close
        </button>
      </div>
    );
  }

  if (!callData) {
    const getStatusText = () => {
      if (iceState === 'checking') return 'Negotiating connection…';
      if (iceState === 'disconnected') return 'Connection lost. Reconnecting…';
      if (iceState === 'failed') return 'Connection failed.';
      if (connectionState === 'connecting') return 'Establishing secure link…';
      return 'Connecting…';
    };

    return (
      <div
        style={{
          height: '100vh',
          backgroundColor: '#0f172a',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
          fontFamily: 'system-ui, sans-serif',
          gap: 16,
        }}
      >
        {/* Draggable area */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 36,
          zIndex: 100,
          ['WebkitAppRegion' as any]: 'drag',
          ...(window.electronAPI?.platform === 'win32' && { paddingRight: 138 }),
        }} />

        <div
          className="loader"
          style={{
            width: 40,
            height: 40,
            border: '3px solid rgba(99,102,241,0.2)',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        {getStatusText()}
      </div>
    );
  }

  // ─── Incoming call UI (shown until the callee taps Accept) ───────────────
  if (!callData.isOutgoing && !isAccepted) {
    return (
      <div
        style={{
          height: '100vh',
          backgroundColor: '#0f172a',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          userSelect: 'none',
          gap: 36,
        }}
      >
        {/* Draggable area */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 36,
          zIndex: 100,
          ['WebkitAppRegion' as any]: 'drag',
          ...(window.electronAPI?.platform === 'win32' && { paddingRight: 138 }),
        }} />

        {/* Avatar with pulsing rings */}
        <div style={{ position: 'relative', width: 170, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            position: 'absolute', width: 130, height: 130, borderRadius: '50%',
            border: '2px solid #6366f1', opacity: 0.4,
            animation: 'callPulse 1.5s ease-out infinite',
            top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          }} />
          <div style={{
            position: 'absolute', width: 160, height: 160, borderRadius: '50%',
            border: '2px solid #6366f1', opacity: 0.2,
            animation: 'callPulse 1.5s ease-out infinite 0.4s',
            top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          }} />
          <UserAvatar name={displayName} avatar={callData.targetAvatar} size={100} />
        </div>

        {/* Caller info */}
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>
            {displayName}
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {callData.callType === 'video' ? <Video size={14} /> : <Phone size={14} />}
            Incoming {callData.callType} call
          </p>
        </div>

        {/* Decline / Accept buttons */}
        <div style={{ display: 'flex', gap: 56, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleRejectCall}
              style={{
                width: 68, height: 68, borderRadius: '50%', border: 'none',
                backgroundColor: '#ef4444', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
              }}
            >
              <PhoneOff size={26} />
            </button>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Decline</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleAcceptCall}
              style={{
                width: 68, height: 68, borderRadius: '50%', border: 'none',
                backgroundColor: '#22c55e', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(34,197,94,0.4)',
              }}
            >
              {callData.callType === 'video' ? <Video size={26} /> : <Phone size={26} />}
            </button>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Accept</span>
          </div>
        </div>

      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1,
        backgroundColor: '#0f172a',
        display: 'flex',
        overflow: 'hidden',
        cursor: isMiniMode ? 'move' : 'default',
        userSelect: 'none',
        ['WebkitAppRegion' as any]: isMiniMode ? 'drag' : 'no-drag',
      }}
    >
      {/* ── Custom Title Bar (normal mode only) ───────────────────── */}
      {!isMiniMode && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 36,
          display: 'flex', alignItems: 'center',
          zIndex: 100,
          ['WebkitAppRegion' as any]: 'drag',
          opacity: controlsVisible ? 1 : 0,
          transition: 'opacity 0.4s ease',
          ...(window.electronAPI?.platform === 'win32' && { paddingRight: 138 }),
        }}>
          {/* Title text (centred, unselectable) */}
          <span style={{
            flex: 1, textAlign: 'left', fontSize: 12, color: 'rgba(255,255,255,0.45)',
            userSelect: 'none', letterSpacing: '0.03em', marginLeft: 10,
          }}>
            {/* show profile picture */}
            <img src={callData?.targetAvatar} alt="" style={{ width: 20, height: 20, borderRadius: '50%', marginRight: 10 }} />
            {callData?.targetName ?? ''} {callData?.callType === 'video' ? '(Video Call)' : '(Voice Call)'}
          </span>
          {/* Win-style control buttons — hidden if using native titleBarOverlay */}
          {window.electronAPI?.platform !== 'win32' && (
            <div style={{ display: 'flex', ['WebkitAppRegion' as any]: 'no-drag' }}>
            {/* Minimize */}
            <button
              onClick={() => window.electronAPI?.minimizeCallWindow?.()}
              style={{
                width: 46, height: 36, border: 'none', background: 'transparent',
                color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
              }}
              title="Minimize"
            >
              <Minus size={14} />
            </button>
            {/* Maximize / Restore */}
            <button
              onClick={() => window.electronAPI?.maximizeCallWindow?.()}
              style={{
                width: 46, height: 36, border: 'none', background: 'transparent',
                color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
              }}
              title={isWindowMaximized ? "Restore" : "Maximize"}
            >
              {isWindowMaximized ? <Copy size={12} style={{ transform: 'rotate(180deg)' }} /> : <Square size={12} />}
            </button>
            {/* Close */}
            <button
              onClick={handleHangup}
              style={{
                width: 46, height: 36, border: 'none', background: 'transparent',
                color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#e81123';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
              }}
              title="End call & close"
            >
              <X size={16} />
            </button>
          </div>
          )}
        </div>
      )}

      {/* ── Hidden DOM Audio Element for Remote Stream ────────────── */}
      <audio ref={remoteAudioRef} autoPlay muted={false} style={{ display: 'none' }} />

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
          minWidth: 0,
        }}
      >
        {/* ── GRID VIEW ─────────────────────────────────────────────── */}
        {effectiveIsVideo && gridView && callStatus !== 'ringing' ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: gridOrientation === 'horizontal' ? 'row' : 'column' }}>
            {(() => {
              const leftStream  = gridSwapped ? localStream  : remoteStream;
              const rightStream = gridSwapped ? remoteStream : localStream;
              const leftLabel   = gridSwapped ? 'You'        : displayName;
              const rightLabel  = gridSwapped ? displayName : 'You';
              const leftMuted   = gridSwapped; // Mute local, unmute remote
              const rightMuted  = !gridSwapped;
              const leftMirror  = gridSwapped;
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
                    <div style={{ position: 'absolute', top: 10, left: 12, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>{leftLabel}</div>
                  </div>
                  <div
                    onPointerDown={handleGridResizePointerDown}
                    style={{ 
                      width: gridOrientation === 'horizontal' ? 6 : '100%', 
                      height: gridOrientation === 'horizontal' ? '100%' : 6, 
                      cursor: gridOrientation === 'horizontal' ? 'col-resize' : 'row-resize', 
                      flexShrink: 0, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, position: 'relative',
                      touchAction: 'none'
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.5)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                  >
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setGridSwapped((v) => !v)} title="Swap sides"
                      style={{ position: 'absolute', width: 32, height: 32, borderRadius: '50%', background: 'rgba(15,23,42,0.9)', border: '1.5px solid rgba(255,255,255,0.25)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, padding: 0, zIndex: 10 }}
                    >⇄</button>
                  </div>
                  <div style={{ flex: 1, position: 'relative', backgroundColor: '#000' }}>
                    <VideoStream stream={rightStream} label={rightLabel} muted={rightMuted} mirror={rightMirror}
                    objectFit="contain"
                    style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, borderRadius: 0 }} />
                    <div style={{ position: 'absolute', top: 10, left: 12, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>{rightLabel}</div>
                  </div>
                </>
              );
            })()}
          </div>

        ) : effectiveIsVideo && callStatus === 'ringing' ? (
          /* ── VIDEO RINGING: dim local camera behind callee avatar ─── */
          <>
            {localStream && (
              <VideoStream
                stream={localStream}
                muted
                mirror
                objectFit="cover"
                style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, borderRadius: 0, filter: 'brightness(0.45)' }}
              />
            )}
            {/* Callee avatar + name centered */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
            }}>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', border: '2px solid #6366f1', opacity: 0.5, animation: 'callPulse 1.5s ease-out infinite', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                <div style={{ position: 'absolute', width: 158, height: 158, borderRadius: '50%', border: '2px solid #6366f1', opacity: 0.25, animation: 'callPulse 1.5s ease-out infinite 0.45s', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                <UserAvatar name={displayName} avatar={callData.targetAvatar} size={110} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: '#f1f5f9', textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>{displayName}</h2>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 16, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                  {callData.isOutgoing ? (isRinging ? 'Ringing\u2026' : 'Calling\u2026') : 'Connecting\u2026'}
                </p>
              </div>
            </div>
          </>

        ) : effectiveIsVideo && callStatus !== 'ringing' ? (
          /* ── PiP VIEW ────────────────────────────────────────────── */
          <>
            <VideoStream
              stream={localIsMain ? localStream : remoteStream}
              label={localIsMain ? 'You' : displayName}
              muted={localIsMain}
              mirror={localIsMain}
              objectFit="contain"
              style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, borderRadius: 0 }}
            />
            {(localIsMain ? remoteStream : localStream) && (() => {
              const pipStream = localIsMain ? remoteStream : localStream;
              if (!pipStream?.getVideoTracks().some((t) => t.readyState !== 'ended')) return null;
              const PIP_W = pipSize.w;
              const PIP_H = pipShape === 'circle' ? pipSize.w : pipSize.h;
              const borderRad = pipShape === 'circle' ? '50%' : 12;
              const defaultBottomGap = isMiniMode ? 10 : 100;
              const defaultRightGap = isMiniMode ? 10 : 20;
              const pos = pipPos ?? { top: window.innerHeight - PIP_H - defaultBottomGap, left: window.innerWidth - PIP_W - defaultRightGap };

              const handlePipPointerDown = (e: React.PointerEvent) => {
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
                  setPipPos({ top: Math.max(0, Math.min(window.innerHeight - PIP_H, pipDragRef.current.origTop + dy)), left: Math.max(0, Math.min(window.innerWidth - PIP_W, pipDragRef.current.origLeft + dx)) });
                };
                const onUp = () => { pipDragRef.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
                window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
              };

              if (pipHidden) {
                const onRight = pos.left + PIP_W / 2 > window.innerWidth / 2;
                return (
                  <button key="pip-reveal" onClick={() => setPipHidden(false)} title="Show camera preview"
                    style={{ position: 'fixed', top: pos.top + PIP_H / 2 - 18,
                      ...(onRight ? { right: 0, left: 'auto' as const, borderRadius: '8px 0 0 8px', borderRight: 'none', borderLeft: '1px solid rgba(255,255,255,0.18)' }
                        : { left: 0, right: 'auto' as const, borderRadius: '0 8px 8px 0', borderLeft: 'none', borderRight: '1px solid rgba(255,255,255,0.18)' }),
                      width: 28, height: 36, background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.18)',
                      color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, fontSize: 16, padding: 0 }}
                  >{onRight ? '‹' : '›'}</button>
                );
              }

              return (
                <div key="pip"
                  onPointerDown={handlePipPointerDown}
                  onMouseMove={(e) => { 
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); 
                    const cur = getPipResizeCursor(getPipResizeEdges(e.clientX - r.left, e.clientY - r.top, PIP_W, PIP_H, pipShape === 'circle')); 
                    if (cur !== pipCursor) setPipCursor(cur); 
                  }}
                  onMouseLeave={() => { 
                    if (pipCursor !== 'grab') setPipCursor('grab');
                  }}
                  onClick={() => { if (!pipMovedRef.current) setLocalIsMain((v) => !v); }}
                  title="Drag · Click to swap"
                  style={{ position: 'fixed', top: pos.top, left: pos.left, width: PIP_W, height: PIP_H, zIndex: 20, userSelect: 'none', cursor: pipCursor, touchAction: 'none', ['WebkitAppRegion' as any]: 'no-drag' }}
                >
                  <div style={{ position: 'absolute', inset: 0, borderRadius: borderRad, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', transition: 'border-radius 0.35s ease' }}>
                    <VideoStream
                    stream={localIsMain ? remoteStream : localStream}
                    muted={!localIsMain} // Mute local stream in PiP, unmute remote
                    mirror={!localIsMain}
                    label={localIsMain ? displayName : 'You'}
                    style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
                  </div>
                  <div 
                    onMouseEnter={() => {
                      setShowPipMenu(true);
                      if (pipIdleTimerRef.current) clearTimeout(pipIdleTimerRef.current);
                    }} 
                    onMouseLeave={() => {
                      setShowPipMenu(false);
                    }}
                    onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
                    style={{ 
                      position: 'absolute', bottom: pipShape === 'circle' ? '10%' : 6, left: '50%', transform: 'translateX(-50%)', 
                      zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center',
                      opacity: (pipControlsVisible || showPipMenu) ? 1 : 0,
                      transition: 'opacity 0.3s ease',
                      pointerEvents: (pipControlsVisible || showPipMenu) ? 'auto' : 'none'
                    }}
                  >
                    <div style={{ background: 'rgba(0,0,0,0.65)', borderRadius: 10, padding: '1px 9px 3px', cursor: 'default', color: 'rgba(255,255,255,0.9)', fontSize: 20, lineHeight: 1, letterSpacing: 3 }}>···</div>
                    {showPipMenu && (
                      <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '4px 0', width: 162, boxShadow: '0 6px 24px rgba(0,0,0,0.7)', zIndex: 10 }}>
                        {(['circle', 'rectangle'] as const).map((shape) => (
                          <button key={shape} 
                            onClick={() => { 
                              if (shape === 'rectangle' && pipShape === 'circle') {
                                // Restore 16:9 ratio when switching back from circle
                                setPipSize(prev => ({ w: prev.w, h: Math.round(prev.w * 9 / 16) }));
                              }
                              setPipShape(shape); 
                              setShowPipMenu(false); 
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', color: pipShape === shape ? '#6366f1' : '#e2e8f0', fontSize: 13, fontWeight: pipShape === shape ? 600 : 400, textAlign: 'left', whiteSpace: 'nowrap' }}
                          >
                            <span style={{ fontSize: 15 }}>{shape === 'circle' ? '◯' : '▭'}</span>
                            <span>{shape === 'circle' ? 'Circle view' : 'Rectangle view'}</span>
                            {pipShape === shape && <span style={{ marginLeft: 'auto', color: '#6366f1', fontSize: 12 }}>✓</span>}
                          </button>
                        ))}
                        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                        <button onClick={() => { setPipHidden(true); setShowPipMenu(false); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0', fontSize: 13, textAlign: 'left', whiteSpace: 'nowrap' }}
                        ><span style={{ fontSize: 15 }}>✕</span><span>Hide view</span></button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </>

        ) : isScreenSharing ? (
          /* Voice call — local screen share preview */
          <VideoStream stream={localStream} muted
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, borderRadius: 0 }}
            objectFit="contain" />

        ) : (
          /* ── Voice call avatar + status + visualiser ─────────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff', gap: isMiniMode ? 12 : 20, padding: isMiniMode ? 0 : '0 32px' }}>
            <div style={{ position: 'relative' }}>
              {callStatus === 'ringing' && !isMiniMode && (
                <>
                  <div style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', border: '2px solid #6366f1', opacity: 0.4, animation: 'callPulse 1.5s ease-out infinite', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                  <div style={{ position: 'absolute', width: 155, height: 155, borderRadius: '50%', border: '2px solid #6366f1', opacity: 0.2, animation: 'callPulse 1.5s ease-out infinite 0.4s', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                </>
              )}
              <UserAvatar name={displayName} avatar={callData.targetAvatar} size={isMiniMode ? 64 : 110} />
            </div>
            <div style={{ textAlign: 'center' }}>
              {!isMiniMode && <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>{displayName}</h2>}
              <p style={{ margin: 0, color: isMiniMode ? '#fff' : '#94a3b8', fontSize: isMiniMode ? 14 : 16, fontWeight: isMiniMode ? 600 : 400 }}>
                {callStatus === 'active' ? formatDuration(callDuration) : callData.isOutgoing ? (isRinging ? 'Ringing…' : 'Calling…') : 'Connecting…'}
              </p>
            </div>
            {callStatus === 'active' && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: isMiniMode ? 2 : 3, height: isMiniMode ? 24 : 32, marginTop: isMiniMode ? 0 : 4 }}>
                {volumeBars.map((h, i) => (
                  <div key={i} style={{ width: isMiniMode ? 3 : 4, borderRadius: 2, height: `${Math.max(4, h * (isMiniMode ? 0.24 : 0.32))}px`, backgroundColor: h > 20 ? '#6366f1' : '#475569', transition: 'height 0.08s ease' }} />
                ))}
              </div>
            )}
            {/* Local mute status (hide in mini-mode to save space, but controls will show mute state) */}
            {isMuted && callStatus === 'active' && !isMiniMode && (
              <div style={{ fontSize: 13, color: '#f87171', background: 'rgba(239,68,68,0.15)', padding: '4px 12px', borderRadius: 20 }}>
                You are muted
              </div>
            )}
            {/* Remote mute status */}
            {peerIsMuted && callStatus === 'active' && !isMiniMode && (
              <div style={{ fontSize: 13, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '4px 12px', borderRadius: 20 }}>
                {displayName} is muted
              </div>
            )}
          </div>
        )}

        {/* Peer info overlay (active call only, shown on hover in mini-mode or video mode) */}
        {callStatus !== 'ringing' && (isMiniMode || effectiveIsVideo) && (
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
            zIndex: 45,
          }}>
            {!isMiniMode && <UserAvatar name={displayName} avatar={callData.targetAvatar} size={30} />}
            <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>{displayName}</span>
          </div>
        )}
        {/* Duration badge (video calls, active) */}
        {effectiveIsVideo && callStatus === 'active' && !isMiniMode && (
          <div style={{
            position: 'absolute', top: 16, left: '50%',
            transform: controlsVisible ? 'translateX(-50%)' : 'translateX(-50%) translateY(-12px)',
            backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', padding: '4px 14px', borderRadius: 20,
            fontSize: 14, fontWeight: 600, opacity: controlsVisible ? 1 : 0,
            transition: 'opacity 0.4s ease, transform 0.4s ease',
            pointerEvents: controlsVisible ? 'auto' : 'none', zIndex: 10,
          }}>
            {formatDuration(callDuration)}
          </div>
        )}

        {/* Pin icon (for entering Mini Mode) */}
        {callStatus !== 'ringing' && (
          <div style={{
            position: 'absolute', top: isMiniMode ? 16 : 48, right: 16,
            display: 'flex', alignItems: 'center', gap: 8,
            zIndex: 35,
            opacity: controlsVisible ? 1 : 0,
            transition: 'opacity 0.4s ease, top 0.4s ease',
            pointerEvents: controlsVisible ? 'auto' : 'none',
            ['WebkitAppRegion' as any]: 'no-drag',
          }}>
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleMiniMode(); }}
              className="control-btn"
              title={isMiniMode ? "Restore Window" : "Pin to Mini Mode"}
              style={{
                width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
                backgroundColor: isMiniMode ? '#6366f1' : 'rgba(0,0,0,0.4)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                backdropFilter: 'blur(8px)', transition: 'all 0.2s'
              }}
            >
              {isMiniMode ? <PinOff size={16} /> : <Pin size={16} />}
            </button>
          </div>
        )}

        {/* Mute / video-off status badges (video mode, active call) */}
        {effectiveIsVideo && callStatus === 'active' && !isMiniMode && (isMuted || peerIsMuted || !localHasVideo || !remoteHasVideo) && (
          <div style={{
            position: 'absolute', top: 56, left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            zIndex: 12, pointerEvents: 'none',
          }}>
            {isMuted && (
              <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(0,0,0,0.6)', padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                You are muted
              </div>
            )}
            {peerIsMuted && (
              <div style={{ fontSize: 12, color: '#fbbf24', background: 'rgba(0,0,0,0.6)', padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                {displayName} is muted
              </div>
            )}
            {!localHasVideo && (
              <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(0,0,0,0.6)', padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                Your camera is off
              </div>
            )}
            {!remoteHasVideo && (
              <div style={{ fontSize: 12, color: '#fbbf24', background: 'rgba(0,0,0,0.6)', padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                {displayName}'s camera is off
              </div>
            )}
          </div>
        )}

        {/* ── Mini Mode Dedicated Controls ────────────────────────── */}
        {isMiniMode && (
          <div 
            onClick={(e) => e.stopPropagation()} 
            style={{
              position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.6)',
              padding: '6px 12px', borderRadius: 30, zIndex: 40, border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(6px)',
              opacity: controlsVisible ? 1 : 0,
              transition: 'opacity 0.4s ease',
              pointerEvents: controlsVisible ? 'auto' : 'none',
              ['WebkitAppRegion' as any]: 'no-drag',
            }}
          >
            <button 
              onClick={handleToggleMute} 
              title={isMuted ? 'Unmute' : 'Mute'}
              style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', backgroundColor: isMuted ? '#ef4444' : 'rgba(255,255,255,0.15)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            {/* Camera toggle: always show to allow upgrading voice call to video */}
            <button 
              onClick={handleToggleVideo} 
              title={isVideoCall ? (isVideoOff ? 'Turn on camera' : 'Turn off camera') : 'Turn on camera'}
              style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', backgroundColor: (isVideoCall ? isVideoOff : !isLocalVideoEnabled) ? '#ef4444' : 'rgba(255,255,255,0.15)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              {(isVideoCall ? isVideoOff : !isLocalVideoEnabled) ? <VideoOff size={16} /> : <Video size={16} />}
            </button>
            <button 
              onClick={handleHangup} 
              title="End call"
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', backgroundColor: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
               <Phone size={18} style={{ transform: 'rotate(135deg)' }} />
            </button>
          </div>
        )}

        {/* Controls */}
        {!isMiniMode && (
          <div style={{
            position: 'absolute', bottom: 24, left: '50%',
            transform: controlsVisible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(20px)',
            opacity: controlsVisible ? 1 : 0,
            transition: 'opacity 0.4s ease, transform 0.4s ease',
            pointerEvents: controlsVisible ? 'auto' : 'none',
            zIndex: 30,
          }}>
            <CallControls
              isMuted={isMuted}
              isVideoOff={isVideoCall ? isVideoOff : !isLocalVideoEnabled}
              callType={callData.callType}
              onToggleMute={handleToggleMute}
              onToggleVideo={handleToggleVideo}
              onEndCall={handleHangup}
              onSwitchMic={handleSwitchMic}
              onSwitchCamera={effectiveIsVideo ? handleSwitchCamera : undefined}
              onSwitchSpeaker={handleSwitchSpeaker}
              isGridView={gridView}
              onToggleGridView={effectiveIsVideo ? () => setGridView((v) => !v) : undefined}
              gridOrientation={gridOrientation}
              onToggleGridOrientation={() => setGridOrientation(v => v === 'horizontal' ? 'vertical' : 'horizontal')}
              isScreenSharing={isScreenSharing}
              onToggleScreenShare={handleToggleScreenShare}
              isChatOpen={showCallChat}
              onToggleChat={callChat ? () => setShowCallChat((v) => !v) : undefined}
              activeMicId={activeMicId}
              activeCamId={activeCamId}
              activeSpeakerId={activeSpeakerId}
              isMiniMode={isMiniMode}
            />
          </div>
        )}
      </div>

      {/* ── In-call chat sidebar ─────────────────────────────────────────── */}
      {showCallChat && !isMiniMode && (
        <>
          <div
            onPointerDown={handleChatResizePointerDown}
            style={{ width: 5, height: '100%', cursor: 'col-resize', backgroundColor: 'transparent', flexShrink: 0, zIndex: 10, touchAction: 'none' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(99,102,241,0.5)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
          />
          <div style={{ width: chatPanelWidth, minWidth: 280, maxWidth: 700, height: '100%', borderLeft: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
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

      {showScreenPicker && (
        <ScreenPickerModal
          onSelect={handleScreenPickerSelect}
          onCancel={() => setShowScreenPicker(false)}
        />
      )}
    </div>
  );
};

export default CallWindowPage;
