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
  } = useCallStore();
  const { currentUser } = useAuthStore();
  const { activeChat } = useChatStore();

  // Refs so timer callbacks always read the current value (no stale closures)
  const activeCallRef = useRef(activeCall);
  const incomingCallRef = useRef(incomingCall);
  const activeChatRef = useRef(activeChat);
  const currentUserRef = useRef(currentUser);
  const ringingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Track call duration at the time the call window closes (for summary)
  const callDurationRef = useRef(callDuration);

  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
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
    const chat = activeChatRef.current;
    if (!user) return;
    const otherId = call.callerId === user.uid ? call.receiverId : call.callerId;
    const chatId = chat?.members.includes(otherId) ? chat.chatId : null;
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

  /** Relay a socket event to the call window via Electron IPC */
  const relayToCallWindow = (event: string, data: unknown) => {
    window.electronAPI?.relayToCallWindow?.(event, data);
  };

  // â”€â”€â”€ Socket event handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!currentUser) return;
    const socket = getSocket();
    if (!socket) return;

    // â”€â”€â”€ Accept Call Confirmation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleCallAccepted = (data: { callId: string; acceptorId: string }) => {
      if (activeCallRef.current?.callId !== data.callId) return;
      clearRingingTimer();
      setActiveCall({ ...activeCallRef.current!, status: 'active' });

      if (isElectron()) {
        // Electron: relay to call window which owns the WebRTC peer
        relayToCallWindow(SOCKET_EVENTS.ACCEPT_CALL, data);
        startCallTimer();
      } else {
        // Non-Electron fallback: create peer in this renderer
        startCallTimer();
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
      if (activeCallRef.current?.callId !== data.callId) return;
      if (isElectron()) {
        relayToCallWindow(SOCKET_EVENTS.ANSWER, data);
      } else {
        processRenegotiationAnswer(data.answer);
      }
    };

    // â”€â”€â”€ ICE Candidates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleIceCandidate = (data: {
      from: string;
      callId: string;
      candidate: { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null };
    }) => {
      if (isElectron()) {
        relayToCallWindow(SOCKET_EVENTS.ICE_CANDIDATE, data);
      } else {
        processSignal(data.candidate);
      }
    };

    // â”€â”€â”€ Call Ended (remote side ended the call) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleCallEnded = (data: { callId: string }) => {
      const ac = activeCallRef.current;
      const ic = incomingCallRef.current;
      if (ac?.callId !== data.callId && ic?.callId !== data.callId) return;
      const wasActive = ac?.status === 'active';
      clearRingingTimer();
      if (isElectron()) {
        // Relay to call window so it can clean up WebRTC, then force-close
        relayToCallWindow(SOCKET_EVENTS.CALL_ENDED, data);
        window.electronAPI?.closeCallWindow?.();
        window.electronAPI?.closeIncomingCallWindow?.();
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
      sendCallSummary(ac, 'declined', 0, 'declined');
      if (isElectron()) {
        relayToCallWindow(SOCKET_EVENTS.CALL_REJECTED, data);
        window.electronAPI?.closeCallWindow?.();
        window.electronAPI?.closeIncomingCallWindow?.();
      }
      stopCallTimer();
      endCallCleanup();
      showNotification({ title: 'TeleDesk', body: 'Call was declined' });
    };

    // â”€â”€â”€ Renegotiation offer (e.g. screen share on voice call) â”€â”€â”€â”€â”€â”€â”€
    const handleRenegotiationOffer = (data: { from: string; callId: string; offer: RTCSessionDescriptionInit }) => {
      if (activeCallRef.current?.callId !== data.callId) return;
      if (isElectron()) {
        relayToCallWindow(SOCKET_EVENTS.OFFER, data);
      } else {
        if (!hasPeer()) return;
        processRenegotiationOffer(data.offer, data.from, data.callId);
      }
    };

    socket.on(SOCKET_EVENTS.ACCEPT_CALL, handleCallAccepted);
    socket.on(SOCKET_EVENTS.ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
    socket.on(SOCKET_EVENTS.CALL_ENDED, handleCallEnded);
    socket.on(SOCKET_EVENTS.CALL_REJECTED, handleCallRejected);
    socket.on(SOCKET_EVENTS.OFFER, handleRenegotiationOffer);

    return () => {
      socket.off(SOCKET_EVENTS.ACCEPT_CALL, handleCallAccepted);
      socket.off(SOCKET_EVENTS.ANSWER, handleAnswer);
      socket.off(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
      socket.off(SOCKET_EVENTS.CALL_ENDED, handleCallEnded);
      socket.off(SOCKET_EVENTS.CALL_REJECTED, handleCallRejected);
      socket.off(SOCKET_EVENTS.OFFER, handleRenegotiationOffer);
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
        const call = activeCallRef.current;
        if (call) {
          const dur = call.status === 'active' ? callDurationRef.current : 0;
          const status = call.status === 'active' ? 'completed' : 'cancelled';
          sendCallSummary(call, status, dur, status);
        }
        clearRingingTimer();
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
          const dur = call.status === 'active' ? callDurationRef.current : 0;
          const status = call.status === 'active' ? 'completed' : 'cancelled';
          sendCallSummary(call, status, dur, status);
        }
        clearRingingTimer();
        stopCallTimer();
        endCallCleanup();
      } else if (event === 'incoming-accepted') {
        // The merged call window user accepted — sync state here, window handles socket
        const ic = incomingCallRef.current;
        if (!ic) return;
        const acceptedSession = { ...ic, status: 'active' as const };
        setActiveCall(acceptedSession);
        activeCallRef.current = acceptedSession;
        setIncomingCall(null);
        startCallTimer();
      } else if (event === 'incoming-rejected') {
        // The merged call window user rejected — window already sent REJECT_CALL socket
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
        targetName,
        targetAvatar,
      });
    } else {
      // Non-Electron fallback: capture stream here and store for when ACCEPT_CALL arrives
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

    // Auto-cancel after 30 s if receiver doesn't answer
    clearRingingTimer();
    ringingTimerRef.current = setTimeout(() => {
      const call = activeCallRef.current;
      if (!call || call.callId !== callId || call.status !== 'ringing') return;
      const socket2 = getSocket();
      socket2?.emit(SOCKET_EVENTS.END_CALL, { to: targetUserId, callId });
      if (!isElectron()) hangUp(targetUserId, callId);
      sendCallSummary(call, 'no_answer', 0, 'missed');
      stopCallTimer();
      endCallCleanup();
      if (isElectron()) {
        window.electronAPI?.closeCallWindow?.();
      }
      showNotification({ title: 'TeleDesk', body: 'No answer' });
    }, 30000);
  };

  // â”€â”€â”€ acceptIncomingCall (non-Electron / in-app modal fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const acceptIncomingCall = (localStream: MediaStream): void => {
    if (!incomingCall || !currentUser) return;
    const socket = getSocket();

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
    const dur = activeCall.status === 'active' ? callDuration : 0;
    const status = activeCall.status === 'active' ? 'completed' : 'cancelled';
    sendCallSummary(activeCall, status, dur, status);

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
