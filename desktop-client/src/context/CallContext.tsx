import React, { createContext, useContext, useEffect, useRef } from 'react';
import { getSocket } from '../services/socketService';
import { SOCKET_EVENTS } from '@shared/constants/events';
import { CallSession } from '@shared/types';
import {
  createInitiatorPeer,
  createReceiverPeer,
  processSignal,
  hangUp,
  hasPeer,
  setCallTarget,
  processRenegotiationOffer,
  processRenegotiationAnswer,
  processAnswer,
  getLocalStream,
  destroyPeer,
  stopLocalStream,
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
  ) => Promise<void>;
  continueCall: () => void;
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
    startCallTimerAt,
    stopCallTimer,
    endCallCleanup,
    callDuration,
    setIsCalleeRinging,
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


  /** Relay a socket event to the call window via Electron IPC */
  const relayToCallWindow = (event: string, data: unknown) => {
    window.electronAPI?.relayToCallWindow?.(event, data);
  };

  useEffect(() => {
    if (!currentUser) return;
    const socket = getSocket();
    if (!socket) return;

    // --------- Accept Call Confirmation ---------------------------------------------------------------------------------------------------------------
    const handleCallAccepted = (data: { callId: string; acceptorId: string }) => {
      if (activeCallRef.current?.callId !== data.callId) return;
      clearRingingTimer();
      callAudioService.stopOutgoingRingtone();
      setActiveCall({ ...activeCallRef.current!, status: 'active' });

      if (isElectron()) {
        // Electron: relay to call window which owns the WebRTC peer
        relayToCallWindow(SOCKET_EVENTS.ACCEPT_CALL, data);
        startCallTimer();
      } else {
        // Non-Electron fallback: create peer in this renderer
        startCallTimer();
        const stream = localStreamRef.current;
        if (!stream) {
          console.error('[Call] handleCallAccepted: localStream not ready yet, waiting...');
          // Stream not ready yet — wait for it with a timeout
          const checkStream = setInterval(() => {
            const s = localStreamRef.current;
            if (s) {
              clearInterval(checkStream);
              setCallTarget(activeCallRef.current!.receiverId, data.callId);
              createInitiatorPeer(
                s,
                data.callId,
                activeCallRef.current!.receiverId,
                (remoteStream) => { setRemoteStream(remoteStream); },
                (err) => {
                  console.error('[Call] Peer error:', err);
                  endCallCleanup();
                },
              );
            }
          }, 100);
          // Timeout after 5 seconds
          setTimeout(() => {
            clearInterval(checkStream);
            if (!localStreamRef.current) {
              console.error('[Call] Stream capture timeout');
              endCallCleanup();
            }
          }, 5000);
          return;
        }
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

    // --------- WebRTC Answer ------------------------------------------------------------------------------------------------------------------------------------------------
    const handleAnswer = (data: { from: string; callId: string; answer: RTCSessionDescriptionInit }) => {
      if (activeCallRef.current?.callId !== data.callId) return;
      if (isElectron()) {
        relayToCallWindow(SOCKET_EVENTS.ANSWER, data);
      } else {
        processAnswer(data.answer);
      }
    };

    // --------- ICE Candidates ---------------------------------------------------------------------------------------------------------------------------------------------
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

    // --------- Call Ended (remote side ended the call) ------------------------------------------------------------------
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

    // --------- Call Rejected ------------------------------------------------------------------------------------------------------------------------------------------------
    const handleCallRejected = (data: { callId: string }) => {
      const ac = activeCallRef.current;
      if (ac?.callId !== data.callId) return;
      clearRingingTimer();
      // Stop all ringtones when call is rejected
      callAudioService.stopAllRingtones();

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

    // --------- Renegotiation offer (e.g. screen share on voice call) ---------------------
    const handleRenegotiationOffer = (data: { from: string; callId: string; offer: RTCSessionDescriptionInit }) => {
      if (activeCallRef.current?.callId !== data.callId) return;
      if (isElectron()) {
        relayToCallWindow(SOCKET_EVENTS.OFFER, data);
      } else {
        if (!hasPeer()) return;
        processRenegotiationOffer(data.offer, data.from, data.callId);
      }
    };

    // ─── Receiver's phone is ringing (server confirmed delivery to callee) ───
    const handleCallRinging = (data: { callId: string }) => {
      if (activeCallRef.current?.callId !== data.callId) return;
      setActiveCall({ ...activeCallRef.current!, status: 'ringing' });
      setIsCalleeRinging(true);
      if (isElectron()) {
        relayToCallWindow(SOCKET_EVENTS.CALL_RINGING, data);
      }
    };

    // ─── Call Handled Elsewhere (accepted or rejected on another device) ───
    const handleCallHandledElsewhere = (data: { callId: string }) => {
      const ac = activeCallRef.current;
      const ic = incomingCallRef.current;
      if (ac?.callId !== data.callId && ic?.callId !== data.callId) return;

      clearRingingTimer();
      callAudioService.stopAllRingtones();
      
      if (isElectron()) {
        window.electronAPI?.closeCallWindow?.();
        window.electronAPI?.closeIncomingCallWindow?.();
      } else {
        // Web path: explicitly destroy the WebRTC peer so it doesn't answer
        // the new OFFER that the caller will send to the new device.
        // DO NOT use hangUp() here because that sends an END_CALL signal!
        destroyPeer();
        stopLocalStream();
      }
      
      endCallCleanup();
    };

    // ─── User Call State (sync active call from another device) ────────────
    const handleUserCallState = (data: CallSession) => {
      // If we are already in THIS call locally, don't overwrite it as external
      const currentCall = activeCallRef.current;
      if (currentCall?.callId === data.callId && !currentCall.isExternal) {
        return;
      }

      if (data.status === 'active') {
        const session = { ...data, isExternal: true };
        setActiveCall(session);
        activeCallRef.current = session;
        // Also stop any local ringing if we were ringing for this call
        if (incomingCallRef.current?.callId === data.callId) {
          clearRingingTimer();
          callAudioService.stopAllRingtones();
          setIncomingCall(null);
        }
      } else if (activeCallRef.current?.callId === data.callId) {
        // Call ended elsewhere
        endCallCleanup();
      }
    };

    socket.on(SOCKET_EVENTS.ACCEPT_CALL, handleCallAccepted);
    socket.on(SOCKET_EVENTS.ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
    socket.on(SOCKET_EVENTS.CALL_ENDED, handleCallEnded);
    socket.on(SOCKET_EVENTS.CALL_REJECTED, handleCallRejected);
    socket.on(SOCKET_EVENTS.OFFER, handleRenegotiationOffer);
    socket.on(SOCKET_EVENTS.CALL_RINGING, handleCallRinging);
    socket.on(SOCKET_EVENTS.CALL_HANDLED_ELSEWHERE, handleCallHandledElsewhere);
    socket.on(SOCKET_EVENTS.CALL_USER_STATE, handleUserCallState);

    const handleCallMuteChanged = (data: { callId: string; from: string; isMuted: boolean }) => {
      if (activeCallRef.current?.callId !== data.callId) return;
      if (isElectron()) relayToCallWindow(SOCKET_EVENTS.CALL_MUTE_CHANGED, data);
    };
    const handleCallVideoChanged = (data: { callId: string; from: string; isVideoOff: boolean }) => {
      if (activeCallRef.current?.callId !== data.callId) return;
      if (isElectron()) relayToCallWindow(SOCKET_EVENTS.CALL_VIDEO_CHANGED, data);
    };

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
      socket.off(SOCKET_EVENTS.CALL_HANDLED_ELSEWHERE, handleCallHandledElsewhere);
      socket.off(SOCKET_EVENTS.CALL_USER_STATE, handleUserCallState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // --------- IPC bridge: events from call windows â†’ main window ------------------------------------------------------
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

  // --------- startCall ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const startCall = async (
    targetUserId: string,
    targetName: string,
    callType: 'video' | 'voice',
    targetAvatar?: string,
  ): Promise<void> => {
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
      
      // Emit CALL_USER immediately for Electron (window handles media)
      socket?.emit(SOCKET_EVENTS.CALL_USER, {
        targetUserId,
        callType,
        callId,
        callerName: currentUser.name,
        callerAvatar: currentUser.avatar,
      });
    } else {
      // Non-Electron: capture stream FIRST, then emit CALL_USER
      try {
        const stream = await getLocalStream(callType);
        localStreamRef.current = stream;
        setLocalStream(stream);
        
        // Now that we have the stream, emit CALL_USER
        socket?.emit(SOCKET_EVENTS.CALL_USER, {
          targetUserId,
          callType,
          callId,
          callerName: currentUser.name,
          callerAvatar: currentUser.avatar,
        });
      } catch (err) {
        console.error('[Call] getLocalStream failed:', err);
        endCallCleanup();
        return;
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
      }
      showNotification({ title: 'TeleDesk', body: 'No answer' });
    }, 30000);
  };

  // --------- acceptIncomingCall (non-Electron / in-app modal fallback) ------------------------------------
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

  // --------- rejectIncomingCall ---------------------------------------------------------------------------------------------------------------------------------------------------------
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

  // --------- endActiveCall ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
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

  // --------- continueCall (transfer call to this device) -----------------------------------------------------------------------------------------------------------------------------------
  const continueCall = (): void => {
    const call = activeCallRef.current;
    if (!call || !call.isExternal) return;

    const socket = getSocket();
    if (!socket) return;

    // Notify backend to take over (sends ACCEPT_CALL to peer)
    const targetUserId = call.callerId === currentUser?.uid ? call.receiverId : call.callerId;
    socket.emit(SOCKET_EVENTS.ACCEPT_CALL, {
      callId: call.callId,
      callerId: targetUserId,
    });

    // Mark as local active call
    const localCall = { ...call, isExternal: false, status: 'active' as const };
    setActiveCall(localCall);
    activeCallRef.current = localCall;

    // Sync the call timer to match the ongoing call's duration
    const initialSecs = call.startTime ? Math.floor((Date.now() - call.startTime) / 1000) : 0;

    // Open call window
    if (isElectron()) {
      const isOutgoingTransfer = call.callerId === currentUser?.uid;
      const targetUserId: string = (isOutgoingTransfer ? call.receiverId : call.callerId) || '';
      window.electronAPI!.openCallWindow!({
        callId: call.callId,
        callType: call.type,
        isOutgoing: isOutgoingTransfer,
        targetUserId,
        targetName: (isOutgoingTransfer ? call.receiverName : call.callerName) || 'User',
        targetAvatar: isOutgoingTransfer ? call.receiverAvatar : call.callerAvatar,
        startTime: call.startTime,
        isContinuing: true,
      });
    } else {
      // Web fallback: start the WebRTC connection and timer in sync
      startCallTimerAt(initialSecs);
    }
  };

  return (
    <CallContext.Provider value={{ startCall, continueCall, acceptIncomingCall, rejectIncomingCall, endActiveCall }}>
      {children}
    </CallContext.Provider>
  );
};

const noOpCallContext: CallContextValue = {
  startCall: async () => { },
  continueCall: () => { },
  acceptIncomingCall: () => { },
  rejectIncomingCall: () => { },
  endActiveCall: () => { },
};

export const useCallContext = (): CallContextValue => {
  const ctx = useContext(CallContext);
  return ctx ?? noOpCallContext;
};
