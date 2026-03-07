import React, { createContext, useContext, useEffect, useRef } from 'react';
import { getSocket } from '../services/socketService';
import { SOCKET_EVENTS } from '@shared/constants/events';
import {
  createInitiatorPeer,
  createReceiverPeer,
  processSignal,
  hangUp,
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
    localStream: MediaStream,
  ) => void;
  acceptIncomingCall: (localStream: MediaStream) => void;
  rejectIncomingCall: () => void;
  endActiveCall: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

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

  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const clearRingingTimer = () => {
    if (ringingTimerRef.current !== null) {
      clearTimeout(ringingTimerRef.current);
      ringingTimerRef.current = null;
    }
  };

  // Helper: post a call summary message into the shared chat.
  // ONLY the CALLER should call this to avoid duplicate messages.
  // receiverStatus lets the two sides show different labels (e.g. no_answer vs missed).
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
      content = `[${typeName}] ${typeName} call · ${dStr}`;
    } else if (status === 'no_answer') {
      content = `[${typeName}] ${typeName} call — no answer`;
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

  // This effect registers stable socket handlers that use refs throughout.
  // It only re-runs when the current user (and thus the socket) changes.
  // Keeping it stable prevents handlers being torn down during WebRTC signaling
  // (e.g. when callDuration ticks every second or activeCall state updates).
  useEffect(() => {
    if (!currentUser) return;
    const socket = getSocket();
    if (!socket) return;

    // ─── Accept Call Confirmation ───────────────────────────────────────
    const handleCallAccepted = (data: { callId: string; acceptorId: string }) => {
      if (activeCallRef.current?.callId !== data.callId) return;
      clearRingingTimer();
      setActiveCall({ ...activeCallRef.current!, status: 'active' });
      startCallTimer();

      // Create initiator peer here — AFTER receiver has registered its OFFER
      // listener in acceptIncomingCall — so the offer isn't sent too early.
      const stream = localStreamRef.current;
      if (!stream) return;
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
    };

    // ─── Receive WebRTC Answer (caller gets this) ───────────────────────
    // Uses ref so it never has a stale callId, and is never torn down mid-negotiation.
    const handleAnswer = (data: { from: string; callId: string; answer: RTCSessionDescriptionInit }) => {
      if (activeCallRef.current?.callId !== data.callId) return;
      processSignal(data.answer);
    };

    // ─── ICE Candidates ─────────────────────────────────────────────────
    // Never filtered by callId — simple-peer queues extras gracefully.
    const handleIceCandidate = (data: {
      from: string;
      callId: string;
      candidate: { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null };
    }) => {
      processSignal(data.candidate);
    };

    // ─── Call Ended ─────────────────────────────────────────────────────
    const handleCallEnded = (data: { callId: string }) => {
      const ac = activeCallRef.current;
      const ic = incomingCallRef.current;
      if (ac?.callId === data.callId || ic?.callId === data.callId) {
        const wasActive = ac?.status === 'active';
        clearRingingTimer();
        stopCallTimer();
        endCallCleanup();
        showNotification({ title: 'TeleDesk', body: wasActive ? 'Call ended' : 'Call cancelled' });
      }
    };

    // ─── Call Rejected ──────────────────────────────────────────────────
    const handleCallRejected = (data: { callId: string }) => {
      const ac = activeCallRef.current;
      if (ac?.callId === data.callId) {
        clearRingingTimer();
        sendCallSummary(ac, 'declined', 0, 'declined');
        stopCallTimer();
        endCallCleanup();
        showNotification({ title: 'TeleDesk', body: 'Call was declined' });
      }
    };

    socket.on(SOCKET_EVENTS.ACCEPT_CALL, handleCallAccepted);
    socket.on(SOCKET_EVENTS.ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
    socket.on(SOCKET_EVENTS.CALL_ENDED, handleCallEnded);
    socket.on(SOCKET_EVENTS.CALL_REJECTED, handleCallRejected);

    return () => {
      socket.off(SOCKET_EVENTS.ACCEPT_CALL, handleCallAccepted);
      socket.off(SOCKET_EVENTS.ANSWER, handleAnswer);
      socket.off(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
      socket.off(SOCKET_EVENTS.CALL_ENDED, handleCallEnded);
      socket.off(SOCKET_EVENTS.CALL_REJECTED, handleCallRejected);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const startCall = (
    targetUserId: string,
    targetName: string,
    callType: 'video' | 'voice',
    localStream: MediaStream,
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
      type: callType,
      status: 'ringing' as const,
    };

    // Persist stream so CallScreen shows local preview and handleCallAccepted can use it
    localStreamRef.current = localStream;
    setLocalStream(localStream);

    setActiveCall(callSession);
    activeCallRef.current = callSession; // sync ref immediately for timer

    socket?.emit(SOCKET_EVENTS.CALL_USER, {
      targetUserId,
      callType,
      callId,
      callerName: currentUser.name,
      callerAvatar: currentUser.avatar,
    });

    // Auto-cancel after 30 s if receiver doesn't pick up
    clearRingingTimer();
    ringingTimerRef.current = setTimeout(() => {
      const call = activeCallRef.current;
      if (!call || call.callId !== callId || call.status !== 'ringing') return;
      // Hang up to dismiss the receiver's incoming call screen
      hangUp(targetUserId, callId);
      // Caller sees "no answer", receiver sees "missed"
      sendCallSummary(call, 'no_answer', 0, 'missed');
      stopCallTimer();
      endCallCleanup();
      showNotification({ title: 'TeleDesk', body: 'No answer' });
    }, 30000);

    // Peer is created in handleCallAccepted after receiver accepts.
  };

  const acceptIncomingCall = (localStream: MediaStream): void => {
    if (!incomingCall || !currentUser) return;
    const socket = getSocket();

    // Persist stream so CallScreen shows local preview
    localStreamRef.current = localStream;
    setLocalStream(localStream);

    socket?.emit(SOCKET_EVENTS.ACCEPT_CALL, {
      callId: incomingCall.callId,
      callerId: incomingCall.callerId,
    });

    setActiveCall({ ...incomingCall, status: 'active' });
    setIncomingCall(null);
    startCallTimer(); // B's timer starts the moment they accept

    // Listen for the offer from the caller
    const handleOffer = (data: {
      from: string;
      callId: string;
      offer: RTCSessionDescriptionInit;
    }) => {
      if (data.callId !== incomingCall.callId) return;
      socket?.off(SOCKET_EVENTS.OFFER, handleOffer);

      createReceiverPeer(
        localStream,
        incomingCall.callId,
        incomingCall.callerId,
        data.offer,
        (remoteStream) => {
          setRemoteStream(remoteStream);
          // Timer already started in acceptIncomingCall
        },
        (err) => {
          console.error('[Call] Receiver peer error:', err);
          endCallCleanup();
        },
      );
    };

    socket?.on(SOCKET_EVENTS.OFFER, handleOffer);
  };

  const rejectIncomingCall = (): void => {
    if (!incomingCall) return;
    const socket = getSocket();
    // Do NOT send a call summary here — the caller will receive CALL_REJECTED
    // and post the single summary from their side, avoiding duplicate messages.
    socket?.emit(SOCKET_EVENTS.REJECT_CALL, {
      callId: incomingCall.callId,
      callerId: incomingCall.callerId,
    });
    setIncomingCall(null);
  };

  const endActiveCall = (): void => {
    if (!activeCall) return;
    const targetId =
      activeCall.callerId === currentUser?.uid
        ? activeCall.receiverId
        : activeCall.callerId;

    clearRingingTimer();
    localStreamRef.current = null;
    const dur = activeCall.status === 'active' ? callDuration : 0;
    const status = activeCall.status === 'active' ? 'completed' : 'cancelled';
    // Both sides see the same label (cancelled or completed)
    sendCallSummary(activeCall, status, dur, status);

    hangUp(targetId, activeCall.callId);
    stopCallTimer();
    endCallCleanup();
  };

  return (
    <CallContext.Provider value={{ startCall, acceptIncomingCall, rejectIncomingCall, endActiveCall }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCallContext = (): CallContextValue => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCallContext must be used within CallProvider');
  return ctx;
};
