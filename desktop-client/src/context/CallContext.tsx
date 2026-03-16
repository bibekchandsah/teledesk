import React, { createContext, useContext, useEffect, useRef } from 'react';
import { getSocket } from '../services/socketService';
import { SOCKET_EVENTS } from '@shared/constants/events';
import {
  createInitiatorPeer,
  createReceiverPeer,
  processSignal,
  hangUp,
  hasPeer,
  setCallTarget,
  processRenegotiationOffer,
  processRenegotiationAnswer,
  getLocalStream,
} from '../services/webrtcService';
import { useCallStore } from '../store/callStore';
import { useAuthStore } from '../store/authStore';
import { showNotification } from '../services/notificationService';
import { sendMessage } from '../services/socketService';
import { useChatStore } from '../store/chatStore';
import callAudioService from '../services/callAudioService';
import { signalingLock } from '../utils/SignalingLock';

interface CallContextValue {
  startCall: (
    targetUserId: string,
    targetName: string,
    callType: 'video' | 'voice',
    targetAvatar?: string,
  ) => void;
  acceptIncomingCall: (localStream: MediaStream) => void;
  rejectIncomingCall: () => void;
  endActiveCall: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

/** True when running inside Electron with call-window IPC available */
const isElectron = (): boolean => !!window.electronAPI?.openCallWindow;

/** Open call in popup window for web browsers */
const openCallPopup = (params: {
  callId: string;
  callType: 'video' | 'voice';
  isOutgoing: boolean;
  targetUserId: string;
  targetName: string;
  targetAvatar?: string;
}): Window | null => {
  const encoded = encodeURIComponent(JSON.stringify(params));
  const url = `/call-window?d=${encoded}`;
  const width = 960;
  const height = 680;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;
  
  try {
    console.log('[Call] Opening popup window:', url);
    const popup = window.open(
      url,
      'TeleDesk Call',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,status=no,menubar=no,toolbar=no,location=no`
    );
    
    // Immediate checks for popup blocking
    if (!popup) {
      console.warn('[Call] window.open returned null - popup blocked');
      return null;
    }
    
    if (popup.closed) {
      console.warn('[Call] Popup was closed immediately - likely blocked');
      return null;
    }
    
    // More aggressive check - if popup exists but can't navigate, it's likely blocked
    setTimeout(() => {
      try {
        if (popup.closed) {
          console.warn('[Call] Popup was closed after 100ms - likely blocked');
          return;
        }
        
        // Check if popup is still at about:blank after some time - indicates blocking
        if (popup.location && popup.location.href === 'about:blank') {
          console.warn('[Call] Popup still at about:blank after 100ms - popup blocked');
          popup.close();
          return null; // This won't work in setTimeout, need different approach
        } else {
          console.log('[Call] Popup appears to be working after 100ms');
        }
      } catch (e) {
        // Cross-origin error is actually good - means popup navigated successfully
        console.log('[Call] Cross-origin error (popup navigated successfully)');
      }
    }, 100);
    
    // Immediate check for about:blank - treat as blocked
    setTimeout(() => {
      try {
        if (popup.location && popup.location.href === 'about:blank') {
          console.warn('[Call] Popup location is about:blank immediately - popup blocked');
          popup.close();
          // Can't return null from setTimeout, so we'll handle this in the delayed check
        }
      } catch (e) {
        // Cross-origin error is expected and normal for working popups
        console.log('[Call] Cross-origin error (normal for working popup):', (e as Error).message);
      }
    }, 50); // Very short delay to let popup initialize
    
    return popup;
  } catch (error) {
    console.warn('[Call] Failed to open popup:', error);
    return null;
  }
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    activeCall,
    incomingCall,
    setActiveCall,
    setIncomingCall,
    setLocalStream,
    setRemoteStream,
    startCallTimer,
    stopCallTimer,
    endCallCleanup,
    callDuration,
    setIsCalleeRinging,
    setIsCallInPopup,
    setShowPopupBlockedNotification,
    remoteStream,
  } = useCallStore();
  const { currentUser } = useAuthStore();
  const { activeChat, chats, nicknames } = useChatStore();

  // Refs so timer callbacks always read the current value (no stale closures)
  const activeCallRef = useRef(activeCall);
  const incomingCallRef = useRef(incomingCall);
  const activeChatRef = useRef(activeChat);
  const chatsRef = useRef(chats);
  const currentUserRef = useRef(currentUser);
  const ringingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Track call duration at the time the call window closes (for summary)
  const callDurationRef = useRef(callDuration);
  // Track popup window reference for web calls
  const callPopupRef = useRef<Window | null>(null);
  const popupReadyRef = useRef<boolean>(false);
  const relayBufferRef = useRef<Array<{ event: string; data: any }>>([]);
  
  // Global remote audio element that persists across component lifecycles
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Handle remote audio playback at provider level (persists across CallScreen mounts/unmounts)
  useEffect(() => {
    if (!remoteStream) {
      console.log('[CallProvider] No remote stream');
      return;
    }
    
    console.log('[CallProvider] Setting up remote audio:', {
      hasAudio: remoteStream.getAudioTracks().length > 0,
      hasVideo: remoteStream.getVideoTracks().length > 0
    });
    
    if (!remoteAudioRef.current) {
      const audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current = audio;
      console.log('[CallProvider] Created audio element');
    }
    
    remoteAudioRef.current.srcObject = remoteStream;
    remoteAudioRef.current.play()
      .then(() => console.log('[CallProvider] Audio playing'))
      .catch((err: Error) => console.error('[CallProvider] Audio play failed:', err));
    
    return () => {
      // Only cleanup when provider unmounts (app closes), not on every stream change
      if (!activeCall && !incomingCall) {
        console.log('[CallProvider] Cleaning up audio (no active calls)');
        if (remoteAudioRef.current) {
          remoteAudioRef.current.pause();
          remoteAudioRef.current.srcObject = null;
        }
      }
    };
  }, [remoteStream, activeCall, incomingCall]);

  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { chatsRef.current = chats; }, [chats]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { callDurationRef.current = callDuration; }, [callDuration]);

  const clearRingingTimer = () => {
    if (ringingTimerRef.current !== null) {
      clearTimeout(ringingTimerRef.current);
      ringingTimerRef.current = null;
    }
  };

  // Helper: post a call summary message into the shared chat.
  const sendCallSummary = (
    call: NonNullable<typeof activeCall>,
    status: 'completed' | 'missed' | 'cancelled' | 'no_answer' | 'declined',
    durationSeconds: number,
    receiverStatus?: 'completed' | 'missed' | 'cancelled' | 'no_answer' | 'declined',
  ) => {
    const user = currentUserRef.current;
    if (!user) return;
    const otherId = call.callerId === user.uid ? call.receiverId : call.callerId;

    // Prefer the currently-open chat, but fall back to searching all known chats.
    // This handles the case where the caller starts the call from outside the chat window.
    const activeC = activeChatRef.current;
    const chat =
      activeC?.members.includes(otherId)
        ? activeC
        : chatsRef.current.find(
            (c) => c.type === 'private' && c.members.includes(user.uid) && c.members.includes(otherId),
          ) ?? null;
    const chatId = chat?.chatId ?? null;
    if (!chatId) return;

    const typeName = call.type === 'video' ? 'Video' : 'Voice';
    let content: string;
    if (status === 'completed') {
      const m = Math.floor(durationSeconds / 60);
      const s = durationSeconds % 60;
      const dStr = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
      content = `[${typeName}] ${typeName} call Â· ${dStr}`;
    } else if (status === 'no_answer') {
      content = `[${typeName}] ${typeName} call â€” no answer`;
    } else if (status === 'missed') {
      content = `[${typeName}] Missed ${call.type} call`;
    } else {
      content = `[${typeName}] ${typeName} call cancelled`;
    }

    sendMessage({
      chatId,
      content,
      type: 'call',
      senderName: user.name,
      senderAvatar: user.avatar,
      callType: call.type,
      callDuration: durationSeconds,
      callStatus: status,
      callStatusReceiver: receiverStatus ?? status,
    });
  };

  // Relay a socket event to the call window (Electron IPC or Web postMessage)
  const relayToCallWindow = (event: string, data: unknown) => {
    if (isElectron()) {
      window.electronAPI?.relayToCallWindow?.(event, data);
    } else if (callPopupRef.current && !callPopupRef.current.closed) {
      if (popupReadyRef.current) {
        callPopupRef.current.postMessage({ type: 'relayed-socket-event', event, data }, window.location.origin);
      } else {
        relayBufferRef.current.push({ event, data });
      }
    }
  };

  // ─── Web Popup Bridge: listen for messages from the popup ────────────────
  useEffect(() => {
    if (isElectron()) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      const { type, event: socketEvent, data } = event.data;
      if (type === 'call-window-ready') {
        popupReadyRef.current = true;
        if (relayBufferRef.current.length > 0) {
          relayBufferRef.current.forEach(({ event: ev, data: dt }) => {
            callPopupRef.current?.postMessage({ type: 'relayed-socket-event', event: ev, data: dt }, window.location.origin);
          });
          relayBufferRef.current = [];
        }
        return;
      }
      
      if (type === 'call-window-socket-emit' && socketEvent) {
        getSocket()?.emit(socketEvent, data);
        
        // Handle specific UI-synced events (like hangup, accept, reject)
        if (socketEvent === SOCKET_EVENTS.ACCEPT_CALL) {
          const ic = incomingCallRef.current;
          if (ic) {
            // Stop incoming ringtone when accepting from popup
            callAudioService.stopIncomingRingtone();
            setActiveCall({ ...ic, status: 'active' });
            setIncomingCall(null);
            startCallTimer();
          }
        } else if (socketEvent === SOCKET_EVENTS.REJECT_CALL) {
          // Stop incoming ringtone when rejecting from popup
          callAudioService.stopIncomingRingtone();
          setIncomingCall(null);
        } else if (socketEvent === SOCKET_EVENTS.END_CALL) {
          // Popup initiated END_CALL; the main socket will handle CALL_ENDED.
          // Just stop local timers/audio and cleanup UI state here.
          const call = activeCallRef.current || incomingCallRef.current;
          clearRingingTimer();
          callAudioService.stopAllRingtones();
          stopCallTimer();
          endCallCleanup();
          setIsCallInPopup(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Web popup close detection
    const interval = setInterval(() => {
      if (callPopupRef.current && callPopupRef.current.closed) {
        const call = activeCallRef.current || incomingCallRef.current;
        if (call) {
          const socket = getSocket();
          const targetId = call.callerId === currentUserRef.current?.uid 
            ? call.receiverId 
            : call.callerId;

          // Notify the other party that the call ended; the usual CALL_ENDED
          // flow will drive summary creation on the caller side.
          socket?.emit(SOCKET_EVENTS.END_CALL, { 
            to: targetId, 
            callId: call.callId 
          });
        }

        // Clean up popup references
        clearInterval(interval);
        callPopupRef.current = null;
        popupReadyRef.current = false;
        relayBufferRef.current = [];
        clearRingingTimer();
        // Stop all ringtones when popup is closed
        callAudioService.stopAllRingtones();
        stopCallTimer();
        endCallCleanup();
        setIsCallInPopup(false);
      }
    }, 250); // Check more frequently for better responsiveness

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(interval);
    };
  }, []);

  // ─── Socket event handlers ──────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const socket = getSocket();
    if (!socket) return;

    // â”€â”€â”€ Accept Call Confirmation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleCallAccepted = (data: { callId: string; acceptorId: string; isSecondary?: boolean }) => {
      const ac = activeCallRef.current;
      const ic = incomingCallRef.current;
      if (ac?.callId !== data.callId && ic?.callId !== data.callId) return;
      
      if (data.isSecondary) {
        console.log('[Call] Call accepted on another device/tab, cleaning up local ringing');
        clearRingingTimer();
        callAudioService.stopAllRingtones();
        setIncomingCall(null);
        return;
      }
      
      clearRingingTimer();
      // Stop all ringtones when call is accepted
      callAudioService.stopAllRingtones();
      
      if (ic?.callId === data.callId) {
        setActiveCall({ ...ic, status: 'active' });
        setIncomingCall(null);
      } else if (ac) {
        setActiveCall({ ...ac, status: 'active' });
      }

      // Always relay to call window (Electron or Web Popup)
      relayToCallWindow(SOCKET_EVENTS.ACCEPT_CALL, data);
      startCallTimer();

      // If call is handled in a popup (Web) or in Electron (which always uses popup),
      // do NOT create a peer in the main window context.
      if (isElectron() || callPopupRef.current) {
        console.log('[Call] Call is in popup or Electron, skipping local peer creation in main window');
        return;
      }

      // MULTI-TAB SYNC: Only one tab should process signaling for this call.
      if (!signalingLock.acquire(data.callId)) {
        console.log('[Call] Another tab is handling signaling for this call, skipping local peer creation');
        return;
      }

      if (!isElectron() && !callPopupRef.current) {
        // Check if peer already exists to prevent duplicates
        if (hasPeer()) {
          console.log('[Call] Peer already exists, skipping creation');
          return;
        }
        
        // Non-Electron fallback (in-app modal): create peer in this renderer
        const stream = localStreamRef.current;
        if (!stream) {
          console.error('[Call] No local stream available when call accepted');
          return;
        }
        
        // Determine the peer user ID (the other person in the call)
        const call = activeCallRef.current;
        if (!call) {
          console.error('[Call] No active call when creating peer');
          return;
        }
        
        const peerUserId = call.callerId === currentUser?.uid ? call.receiverId : call.callerId;
        console.log('[Call] Creating initiator peer for accepted call, peer:', peerUserId);
        
        setCallTarget(peerUserId, data.callId);
        createInitiatorPeer(
          stream,
          data.callId,
          peerUserId,
          (remoteStream) => { 
            console.log('[Call] Remote stream received:', {
              hasAudio: remoteStream.getAudioTracks().length > 0,
              hasVideo: remoteStream.getVideoTracks().length > 0
            });
            setRemoteStream(remoteStream); 
          },
          (err) => {
            console.error('[Call] Peer error:', err);
            endCallCleanup();
          },
        );
      }
    };

    // â”€â”€â”€ WebRTC Answer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleAnswer = (data: { from: string; callId: string; answer: RTCSessionDescriptionInit }) => {
      if (activeCallRef.current?.callId !== data.callId && incomingCallRef.current?.callId !== data.callId) return;
      relayToCallWindow(SOCKET_EVENTS.ANSWER, data);
      
      if (isElectron() || callPopupRef.current) return;
      
      // MULTI-TAB SYNC: Only the window holding the lock processes signaling
      if (!signalingLock.acquire(data.callId)) return;

      if (!isElectron() && !callPopupRef.current) {
        processRenegotiationAnswer(data.answer);
      }
    };

    // â”€â”€â”€ ICE Candidates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleIceCandidate = (data: {
      from: string;
      callId: string;
      candidate: { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null };
    }) => {
      if (activeCallRef.current?.callId !== data.callId && incomingCallRef.current?.callId !== data.callId) return;
      relayToCallWindow(SOCKET_EVENTS.ICE_CANDIDATE, data);

      if (isElectron() || callPopupRef.current) return;

      // MULTI-TAB SYNC: Only the window holding the lock processes signaling
      if (!signalingLock.acquire(data.callId)) return;

      if (!isElectron() && !callPopupRef.current) {
        processSignal(data.candidate);
      }
    };

    // â”€â”€â”€ Call Ended (remote side ended the call) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleCallEnded = (data: { callId: string; byDisconnect?: boolean }) => {
      const ac = activeCallRef.current;
      const ic = incomingCallRef.current;
      if (ac?.callId !== data.callId && ic?.callId !== data.callId) return;
      const wasActive = ac?.status === 'active';
      clearRingingTimer();
      // Stop all ringtones when call ends
      callAudioService.stopAllRingtones();
      
      // The other side hung up. Only the caller sends the call summary so it
      // always appears on the right side (outgoing) in both views.
      // Exception: if the caller disconnected (byDisconnect), the receiver sends it.
      const isCallerSide = ac && ac.callerId === currentUserRef.current?.uid;
      const isReceiverSideAndCallerDisconnected = ac && !isCallerSide && data.byDisconnect;
      if (isCallerSide || isReceiverSideAndCallerDisconnected) {
        const dur = wasActive ? callDurationRef.current : 0;
        const status = wasActive ? 'completed' : 'cancelled';
        sendCallSummary(ac!, status, dur, status);
      }
      
      relayToCallWindow(SOCKET_EVENTS.CALL_ENDED, data);
      
      if (isElectron()) {
        window.electronAPI?.closeCallWindow?.();
        window.electronAPI?.closeIncomingCallWindow?.();
      } else if (callPopupRef.current) {
        callPopupRef.current.close();
        callPopupRef.current = null;
        setIsCallInPopup(false);
      }
      
      stopCallTimer();
      endCallCleanup();
      showNotification({ title: 'TeleDesk', body: wasActive ? 'Call ended' : 'Call cancelled' });
    };

    // â”€â”€â”€ Call Rejected â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleCallRejected = (data: { callId: string; isSecondary?: boolean }) => {
      const ac = activeCallRef.current;
      const ic = incomingCallRef.current;
      if (ac?.callId !== data.callId && ic?.callId !== data.callId) return;

      if (data.isSecondary) {
        console.log('[Call] Call rejected on another device/tab, cleaning up local ringing');
        clearRingingTimer();
        callAudioService.stopAllRingtones();
        setIncomingCall(null);
        return;
      }
      clearRingingTimer();
      // Stop all ringtones when call is rejected
      callAudioService.stopAllRingtones();
      
      const session = ac || ic;
      // Only the original caller should emit the summary for a declined call.
      if (session && session.callerId === currentUserRef.current?.uid) {
        sendCallSummary(session, 'declined', 0, 'declined');
      }
      
      relayToCallWindow(SOCKET_EVENTS.CALL_REJECTED, data);
      
      if (isElectron()) {
        window.electronAPI?.closeCallWindow?.();
        window.electronAPI?.closeIncomingCallWindow?.();
      } else if (callPopupRef.current) {
        callPopupRef.current.close();
        callPopupRef.current = null;
        setIsCallInPopup(false);
      }
      
      stopCallTimer();
      endCallCleanup();
      showNotification({ title: 'TeleDesk', body: 'Call was declined' });
    };

    // â”€â”€â”€ Renegotiation offer (e.g. screen share on voice call) â”€â”€â”€â”€â”€â”€â”€
    const handleRenegotiationOffer = (data: { from: string; callId: string; offer: RTCSessionDescriptionInit }) => {
      if (activeCallRef.current?.callId !== data.callId && incomingCallRef.current?.callId !== data.callId) return;
      relayToCallWindow(SOCKET_EVENTS.OFFER, data);

      if (isElectron() || callPopupRef.current) return;

      // MULTI-TAB SYNC: Only the window holding the lock processes signaling
      if (!signalingLock.acquire(data.callId)) return;

      if (!isElectron() && !callPopupRef.current) {
        if (!hasPeer()) return;
        processRenegotiationOffer(data.offer, data.from, data.callId);
      }
    };

    // ─── Receiver's phone is ringing (server confirmed delivery to callee) ───
    const handleCallRinging = (data: { callId: string }) => {
      if (activeCallRef.current?.callId !== data.callId && incomingCallRef.current?.callId !== data.callId) return;
      setActiveCall({ ...activeCallRef.current!, status: 'ringing' });
      setIsCalleeRinging(true);
      relayToCallWindow(SOCKET_EVENTS.CALL_RINGING, data);
    };

    socket.on(SOCKET_EVENTS.ACCEPT_CALL, handleCallAccepted);
    socket.on(SOCKET_EVENTS.ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
    socket.on(SOCKET_EVENTS.CALL_ENDED, handleCallEnded);
    socket.on(SOCKET_EVENTS.CALL_REJECTED, handleCallRejected);
    socket.on(SOCKET_EVENTS.OFFER, handleRenegotiationOffer);
    socket.on(SOCKET_EVENTS.CALL_RINGING, handleCallRinging);

    const handleCallMuteChanged = (data: { callId: string; from: string; isMuted: boolean }) => {
      if (activeCallRef.current?.callId !== data.callId && incomingCallRef.current?.callId !== data.callId) return;
      relayToCallWindow(SOCKET_EVENTS.CALL_MUTE_CHANGED, data);
    };
    const handleCallVideoChanged = (data: { callId: string; from: string; isVideoOff: boolean }) => {
      if (activeCallRef.current?.callId !== data.callId && incomingCallRef.current?.callId !== data.callId) return;
      relayToCallWindow(SOCKET_EVENTS.CALL_VIDEO_CHANGED, data);
    };

    // ─── Incoming Call Event ─────────────────────────────────────────────
    const handleIncomingCall = (data: {
      callId: string;
      callerId: string;
      callerName: string;
      callerAvatar?: string;
      callType: 'video' | 'voice';
    }) => {
      setIncomingCall({
        callId: data.callId,
        callerId: data.callerId,
        callerName: data.callerName,
        callerAvatar: data.callerAvatar,
        receiverId: currentUser.uid,
        type: data.callType,
        status: 'ringing',
      });

      // Play incoming ringtone (will be handled by IncomingCallModal component)
      // But also play here as a fallback in case modal doesn't render immediately
      callAudioService.playIncomingRingtone();

      // In Electron: open a single merged call window for the incoming call
      if (isElectron()) {
        window.electronAPI!.openCallWindow!({
          callId: data.callId,
          callType: data.callType,
          isOutgoing: false,
          targetUserId: data.callerId,
          targetName: nicknames[data.callerId] || data.callerName,
          targetAvatar: data.callerAvatar,
        });
      } else {
        // Web: use in-app IncomingCallModal (popup has service worker issues)
        console.log('[Call] Using in-app IncomingCallModal for incoming call');
        setIsCallInPopup(false);
        
        // Pre-capture media for faster accept when using in-app modal
        getLocalStream(data.callType)
          .then((stream) => {
            localStreamRef.current = stream;
            console.log('[Call] Pre-captured media for incoming call');
          })
          .catch((err) => {
            console.warn('[Call] Pre-capture failed for incoming call:', err);
          });
      }

      showNotification({
        title: `Incoming ${data.callType} call`,
        body: `${nicknames[data.callerId] || data.callerName} is calling...`,
        icon: (data.callerAvatar && data.callerAvatar.trim()) || `https://ui-avatars.com/api/?name=${encodeURIComponent(nicknames[data.callerId] || data.callerName || 'C')}&background=6366f1&color=fff`,
      });
    };

    socket.on(SOCKET_EVENTS.ACCEPT_CALL, handleCallAccepted);
    socket.on(SOCKET_EVENTS.ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
    socket.on(SOCKET_EVENTS.CALL_ENDED, handleCallEnded);
    socket.on(SOCKET_EVENTS.CALL_REJECTED, handleCallRejected);
    socket.on(SOCKET_EVENTS.OFFER, handleRenegotiationOffer);
    socket.on(SOCKET_EVENTS.CALL_RINGING, handleCallRinging);
    socket.on(SOCKET_EVENTS.INCOMING_CALL, handleIncomingCall);
    socket.on(SOCKET_EVENTS.CALL_MUTE_CHANGED, handleCallMuteChanged);
    socket.on(SOCKET_EVENTS.CALL_VIDEO_CHANGED, handleCallVideoChanged);

    return () => {
      socket.off(SOCKET_EVENTS.ACCEPT_CALL, handleCallAccepted);
      socket.off(SOCKET_EVENTS.ANSWER, handleAnswer);
      socket.off(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
      socket.off(SOCKET_EVENTS.CALL_ENDED, handleCallEnded);
      socket.off(SOCKET_EVENTS.CALL_REJECTED, handleCallRejected);
      socket.off(SOCKET_EVENTS.OFFER, handleRenegotiationOffer);
      socket.off(SOCKET_EVENTS.CALL_MUTE_CHANGED, handleCallMuteChanged);
      socket.off(SOCKET_EVENTS.CALL_VIDEO_CHANGED, handleCallVideoChanged);
      socket.off(SOCKET_EVENTS.CALL_RINGING, handleCallRinging);
      socket.off(SOCKET_EVENTS.INCOMING_CALL, handleIncomingCall);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // â”€â”€â”€ IPC bridge: events from call windows â†’ main window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!window.electronAPI) return;

    // Call window sends socket emit requests â†’ execute on main socket
    const unsubSocketEmit = window.electronAPI.onCallWindowSocketEmit?.((event, data) => {
      const socket = getSocket();
      socket?.emit(event, data);
    });

    // Call window lifecycle events
    const unsubWindowEvent = window.electronAPI.onCallWindowEvent?.((event) => {
      if (event === 'hangup') {
        // Call window user clicked end call (already sent END_CALL socket via emitSocket)
        // Only the caller sends the summary so the message always appears on the
        // right side (outgoing). The receiver's side is handled by handleCallEnded.
        const call = activeCallRef.current;
        if (call && call.callerId === currentUserRef.current?.uid) {
          const dur = call.status === 'active' ? callDurationRef.current : 0;
          const status = call.status === 'active' ? 'completed' : 'cancelled';
          sendCallSummary(call, status, dur, status);
        }
        clearRingingTimer();
        // Stop all ringtones when hanging up from call window
        callAudioService.stopAllRingtones();
        stopCallTimer();
        endCallCleanup();
      } else if (event === 'closed') {
        // Window was closed via OS (e.g. clicking X) without going through hangup
        const call = activeCallRef.current;
        if (call) {
          const socket = getSocket();
          const targetId = call.callerId === currentUserRef.current?.uid
            ? call.receiverId
            : call.callerId;
          socket?.emit(SOCKET_EVENTS.END_CALL, { to: targetId, callId: call.callId });
          // Only caller sends the summary
          if (call.callerId === currentUserRef.current?.uid) {
            const dur = call.status === 'active' ? callDurationRef.current : 0;
            const status = call.status === 'active' ? 'completed' : 'cancelled';
            sendCallSummary(call, status, dur, status);
          }
        }
        clearRingingTimer();
        // Stop all ringtones when call window is closed
        callAudioService.stopAllRingtones();
        stopCallTimer();
        endCallCleanup();
      } else if (event === 'incoming-accepted') {
        // The merged call window user accepted — sync state here, window handles socket
        const ic = incomingCallRef.current;
        if (!ic) return;
        // Stop incoming ringtone when accepting from call window
        callAudioService.stopIncomingRingtone();
        const acceptedSession = { ...ic, status: 'active' as const };
        setActiveCall(acceptedSession);
        activeCallRef.current = acceptedSession;
        setIncomingCall(null);
        startCallTimer();
      } else if (event === 'incoming-rejected') {
        // The merged call window user rejected — window already sent REJECT_CALL socket
        // Stop incoming ringtone when rejecting from call window
        callAudioService.stopIncomingRingtone();
        setIncomingCall(null);
      }
    });

    return () => {
      unsubSocketEmit?.();
      unsubWindowEvent?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // â”€â”€â”€ startCall â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const startCall = async (
    targetUserId: string,
    targetName: string,
    callType: 'video' | 'voice',
    targetAvatar?: string,
  ): Promise<void> => {
    if (!currentUser) return;
    const callId = `${currentUser.uid}_${targetUserId}_${Date.now()}`;
    const socket = getSocket();

    // #region agent log
    fetch('http://127.0.0.1:7473/ingest/5ae8654d-2f22-4424-ad8a-024ec157c042', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '914519',
      },
      body: JSON.stringify({
        sessionId: '914519',
        runId: 'pre-fix',
        hypothesisId: 'H1',
        location: 'CallContext.tsx:startCall',
        message: 'startCall invoked',
        data: {
          callId,
          targetUserId,
          callType,
          callerId: currentUser.uid,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    try {
      // Ensure local media is ready before notifying the callee so ACCEPT_CALL
      // never races ahead of localStreamRef being available.
      const stream = await getLocalStream(callType);
      localStreamRef.current = stream;
      setLocalStream(stream);
      console.log('[Call] Media captured for outgoing call:', {
        hasAudio: stream.getAudioTracks().length > 0,
        hasVideo: stream.getVideoTracks().length > 0,
        callId,
      });

      const callSession = {
        callId,
        callerId: currentUser.uid,
        callerName: currentUser.name,
        receiverId: targetUserId,
        receiverName: targetName,
        receiverAvatar: targetAvatar,
        type: callType,
        status: 'ringing' as const,
      };

      setActiveCall(callSession);
      activeCallRef.current = callSession;

      // Start playing outgoing ringtone for the caller
      callAudioService.playOutgoingRingtone();

      socket?.emit(SOCKET_EVENTS.CALL_USER, {
        targetUserId,
        callType,
        callId,
        callerName: currentUser.name,
        callerAvatar: currentUser.avatar,
      });

      if (isElectron()) {
        // Electron: open the call window – it captures its own stream and handles WebRTC
        window.electronAPI!.openCallWindow!({
          callId,
          callType,
          isOutgoing: true,
          targetUserId,
          targetName: nicknames[targetUserId] || targetName,
          targetAvatar,
        });
      } else {
        // Web: use in-app CallScreen (popup has service worker issues)
        console.log('[Call] Using in-app CallScreen for outgoing call');
        setIsCallInPopup(false);
      }

      // Auto-cancel after 30 s if receiver doesn't answer
      clearRingingTimer();
      ringingTimerRef.current = setTimeout(() => {
        const call = activeCallRef.current;
        if (!call || call.callId !== callId || call.status !== 'ringing') return;
        const socket2 = getSocket();

        // Stop outgoing ringtone when call times out
        callAudioService.stopOutgoingRingtone();

        socket2?.emit(SOCKET_EVENTS.END_CALL, { to: targetUserId, callId });
        if (!isElectron()) hangUp(targetUserId, callId);
        sendCallSummary(call, 'no_answer', 0, 'missed');
        stopCallTimer();
        endCallCleanup();
        if (isElectron()) {
          window.electronAPI?.closeCallWindow?.();
        } else if (callPopupRef.current && !callPopupRef.current.closed) {
          // Close web popup window
          callPopupRef.current.close();
          callPopupRef.current = null;
          setIsCallInPopup(false);
        }
        showNotification({ title: 'TeleDesk', body: 'No answer' });
      }, 30000);
    } catch (err) {
      console.error('[Call] getLocalStream failed for outgoing call:', err);
      callAudioService.stopOutgoingRingtone();
      endCallCleanup();
    }
  };

  // â”€â”€â”€ acceptIncomingCall (non-Electron / in-app modal fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const acceptIncomingCall = (localStream: MediaStream): void => {
    if (!incomingCall || !currentUser) return;
    const socket = getSocket();

    // Stop incoming ringtone when accepting
    callAudioService.stopIncomingRingtone();

    console.log('[CallContext] Accepting incoming call with stream:', {
      hasAudio: localStream.getAudioTracks().length > 0,
      hasVideo: localStream.getVideoTracks().length > 0,
      callId: incomingCall.callId
    });

    localStreamRef.current = localStream;
    setLocalStream(localStream);

    socket?.emit(SOCKET_EVENTS.ACCEPT_CALL, {
      callId: incomingCall.callId,
      callerId: incomingCall.callerId,
    });

    setActiveCall({ ...incomingCall, status: 'active' });
    setIncomingCall(null);
    startCallTimer();

    const handleOffer = (data: {
      from: string;
      callId: string;
      offer: RTCSessionDescriptionInit;
    }) => {
      if (data.callId !== incomingCall.callId) return;
      socket?.off(SOCKET_EVENTS.OFFER, handleOffer);
      setCallTarget(incomingCall.callerId, incomingCall.callId);
      createReceiverPeer(
        localStream,
        incomingCall.callId,
        incomingCall.callerId,
        data.offer,
        (remoteStream) => { setRemoteStream(remoteStream); },
        (err) => {
          console.error('[Call] Receiver peer error:', err);
          endCallCleanup();
        },
      );
    };

    socket?.on(SOCKET_EVENTS.OFFER, handleOffer);
  };

  // â”€â”€â”€ rejectIncomingCall â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const rejectIncomingCall = (): void => {
    if (!incomingCall) return;
    const socket = getSocket();
    
    // Stop incoming ringtone when rejecting
    callAudioService.stopIncomingRingtone();
    
    socket?.emit(SOCKET_EVENTS.REJECT_CALL, {
      callId: incomingCall.callId,
      callerId: incomingCall.callerId,
    });
    setIncomingCall(null);
  };

  // â”€â”€â”€ endActiveCall â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const endActiveCall = (): void => {
    if (!activeCall) return;
    const targetId =
      activeCall.callerId === currentUser?.uid
        ? activeCall.receiverId
        : activeCall.callerId;

    clearRingingTimer();
    // Stop all ringtones when ending call
    callAudioService.stopAllRingtones();

    const socket = getSocket();
    socket?.emit(SOCKET_EVENTS.END_CALL, { to: targetId, callId: activeCall.callId });

    if (isElectron()) {
      window.electronAPI?.closeCallWindow?.();
      window.electronAPI?.closeIncomingCallWindow?.();
    } else {
      localStreamRef.current = null;
      hangUp(targetId, activeCall.callId);
    }

    stopCallTimer();
    signalingLock.release(activeCall.callId);
    endCallCleanup();
  };

  return (
    <CallContext.Provider value={{ startCall, acceptIncomingCall, rejectIncomingCall, endActiveCall }}>
      {children}
    </CallContext.Provider>
  );
};

const noOpCallContext: CallContextValue = {
  startCall: () => {},
  acceptIncomingCall: () => {},
  rejectIncomingCall: () => {},
  endActiveCall: () => {},
};

export const useCallContext = (): CallContextValue => {
  const ctx = useContext(CallContext);
  return ctx ?? noOpCallContext;
};
