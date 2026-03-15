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
  
  return window.open(
    url,
    'TeleDesk Call',
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,status=no,menubar=no,toolbar=no,location=no`
  );
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
          const call = activeCallRef.current || incomingCallRef.current;
          if (call) {
            if (call.callerId === currentUserRef.current?.uid) {
              const dur = call.status === 'active' ? callDurationRef.current : 0;
              const status = call.status === 'active' ? 'completed' : 'cancelled';
              sendCallSummary(call as any, status, dur, status);
            }
            clearRingingTimer();
            // Stop all ringtones when ending call from popup
            callAudioService.stopAllRingtones();
            stopCallTimer();
            endCallCleanup();
            setIsCallInPopup(false);
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Web popup close detection
    const interval = setInterval(() => {
      if (callPopupRef.current && callPopupRef.current.closed) {
        const call = activeCallRef.current;
        if (call) {
          getSocket()?.emit(SOCKET_EVENTS.END_CALL, { 
            to: call.callerId === currentUserRef.current?.uid ? call.receiverId : call.callerId, 
            callId: call.callId 
          });
          if (call.callerId === currentUserRef.current?.uid) {
            const dur = call.status === 'active' ? callDurationRef.current : 0;
            const status = call.status === 'active' ? 'completed' : 'cancelled';
            sendCallSummary(call, status, dur, status);
          }
        }
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
    }, 1000);

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
    const handleCallAccepted = (data: { callId: string; acceptorId: string }) => {
      const ac = activeCallRef.current;
      const ic = incomingCallRef.current;
      if (ac?.callId !== data.callId && ic?.callId !== data.callId) return;
      
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

      if (!isElectron() && !callPopupRef.current) {
        // Non-Electron fallback (in-app modal): create peer in this renderer
        const stream = localStreamRef.current;
        if (!stream) return;
        setCallTarget(activeCallRef.current!.receiverId, data.callId);
        createInitiatorPeer(
          stream,
          data.callId,
          activeCallRef.current!.receiverId,
          (remoteStream) => { setRemoteStream(remoteStream); },
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
    const handleCallRejected = (data: { callId: string }) => {
      const ac = activeCallRef.current;
      if (ac?.callId !== data.callId) return;
      clearRingingTimer();
      // Stop all ringtones when call is rejected
      callAudioService.stopAllRingtones();
      
      sendCallSummary(ac, 'declined', 0, 'declined');
      
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
        // Web: open incoming call in popup window
        const popup = openCallPopup({
          callId: data.callId,
          callType: data.callType,
          isOutgoing: false,
          targetUserId: data.callerId,
          targetName: nicknames[data.callerId] || data.callerName,
          targetAvatar: data.callerAvatar,
        });
        
        if (popup) {
          callPopupRef.current = popup;
          popupReadyRef.current = false;
          relayBufferRef.current = [];
          setIsCallInPopup(true);
        } else {
          console.warn('[Call] Popup blocked for incoming call, using in-app modal');
          setIsCallInPopup(false);
        }
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
  const startCall = (
    targetUserId: string,
    targetName: string,
    callType: 'video' | 'voice',
    targetAvatar?: string,
  ): void => {
    if (!currentUser) return;
    const callId = `${currentUser.uid}_${targetUserId}_${Date.now()}`;
    const socket = getSocket();

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
      // Electron: open the call window â€” it captures its own stream and handles WebRTC
      window.electronAPI!.openCallWindow!({
        callId,
        callType,
        isOutgoing: true,
        targetUserId,
        targetName: nicknames[targetUserId] || targetName,
        targetAvatar,
      });
    } else {
      // Web: open call in popup window
      const popup = openCallPopup({
        callId,
        callType,
        isOutgoing: true,
        targetUserId,
        targetName: nicknames[targetUserId] || targetName,
        targetAvatar,
      });
      
      if (popup) {
        // Store popup reference and set flag
        callPopupRef.current = popup;
        popupReadyRef.current = false;
        relayBufferRef.current = [];
        setIsCallInPopup(true);
      } else {
        // Popup blocked - fallback to in-app modal
        console.warn('[Call] Popup blocked, using in-app modal');
        setIsCallInPopup(false);
        getLocalStream(callType)
          .then((stream) => {
            localStreamRef.current = stream;
            setLocalStream(stream);
          })
          .catch((err) => {
            console.error('[Call] getLocalStream failed:', err);
            endCallCleanup();
          });
      }
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
  };

  // â”€â”€â”€ acceptIncomingCall (non-Electron / in-app modal fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const acceptIncomingCall = (localStream: MediaStream): void => {
    if (!incomingCall || !currentUser) return;
    const socket = getSocket();

    // Stop incoming ringtone when accepting
    callAudioService.stopIncomingRingtone();

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
    
    const dur = activeCall.status === 'active' ? callDuration : 0;
    const status = activeCall.status === 'active' ? 'completed' : 'cancelled';
    // Only caller sends the summary; if receiver ends the call here the caller
    // will send the summary from handleCallEnded when it receives CALL_ENDED.
    if (activeCall.callerId === currentUser?.uid) {
      sendCallSummary(activeCall, status, dur, status);
    }

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
