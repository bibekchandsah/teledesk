import Sp from 'simple-peer';
import type { Instance as SimplePeerInstance } from 'simple-peer';
// Handle Vite CJS/ESM interop — simple-peer exports as CJS module.exports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SimplePeer = ((Sp as any).default ?? Sp) as typeof Sp;
import { WEBRTC_CONFIG } from '@shared/constants/config';
import { sendOffer, sendAnswer, sendIceCandidate, endCall as endCallSignal } from './socketService';

export interface PeerConnection {
  peer: SimplePeerInstance;
  stream: MediaStream | null;
  remoteStream: MediaStream | null;
}

let currentPeer: SimplePeerInstance | null = null;
let localStream: MediaStream | null = null;

// ─── Media Stream ──────────────────────────────────────────────────────────

/**
 * Get local media stream based on call type
 */
export const getLocalStream = async (callType: 'video' | 'voice'): Promise<MediaStream> => {
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
  }
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: callType === 'video' ? { width: 1280, height: 720 } : false,
  });
  return localStream;
};

export const stopLocalStream = (): void => {
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
};

// ─── Peer Connection ───────────────────────────────────────────────────────

/**
 * Create an initiator peer (caller side)
 */
export const createInitiatorPeer = (
  stream: MediaStream,
  callId: string,
  targetUserId: string,
  onRemoteStream: (stream: MediaStream) => void,
  onError: (err: Error) => void,
): SimplePeerInstance => {
  destroyPeer();

  currentPeer = new SimplePeer({
    initiator: true,
    stream,
    trickle: true,
    config: { iceServers: [...WEBRTC_CONFIG.ICE_SERVERS] as RTCIceServer[] },
  });

  currentPeer.on('signal', (data) => {
    if (data.type === 'offer') {
      sendOffer(targetUserId, callId, { type: data.type, sdp: (data as { type: string; sdp?: string }).sdp });
    } else if ((data as unknown as { candidate?: unknown }).candidate) {
      const c = data as unknown as { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null };
      sendIceCandidate(targetUserId, callId, { candidate: c.candidate, sdpMLineIndex: c.sdpMLineIndex, sdpMid: c.sdpMid });
    }
  });

  currentPeer.on('stream', (remoteStream) => {
    onRemoteStream(remoteStream);
  });

  currentPeer.on('error', (err) => {
    console.error('[WebRTC] Peer error:', err);
    onError(err);
  });

  return currentPeer;
};

/**
 * Create a receiver peer (callee side)
 */
export const createReceiverPeer = (
  stream: MediaStream,
  callId: string,
  callerId: string,
  offer: RTCSessionDescriptionInit,
  onRemoteStream: (stream: MediaStream) => void,
  onError: (err: Error) => void,
): SimplePeerInstance => {
  destroyPeer();

  currentPeer = new SimplePeer({
    initiator: false,
    stream,
    trickle: true,
    config: { iceServers: [...WEBRTC_CONFIG.ICE_SERVERS] as RTCIceServer[] },
  });

  // Process the incoming offer immediately
  currentPeer.signal(offer as unknown as import('simple-peer').SignalData);

  currentPeer.on('signal', (data) => {
    if (data.type === 'answer') {
      sendAnswer(callerId, callId, { type: data.type, sdp: (data as { type: string; sdp?: string }).sdp });
    } else if ((data as unknown as { candidate?: unknown }).candidate) {
      const c = data as unknown as { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null };
      sendIceCandidate(callerId, callId, { candidate: c.candidate, sdpMLineIndex: c.sdpMLineIndex, sdpMid: c.sdpMid });
    }
  });

  currentPeer.on('stream', (remoteStream) => {
    onRemoteStream(remoteStream);
  });

  currentPeer.on('error', (err) => {
    console.error('[WebRTC] Peer error:', err);
    onError(err);
  });

  return currentPeer;
};

/**
 * Pass ICE candidate or answer signal to current peer
 */
export const processSignal = (data: { type?: string; sdp?: string } | { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null }): void => {
  currentPeer?.signal(data as unknown as import('simple-peer').SignalData);
};

/**
 * Toggle audio track mute
 */
export const toggleAudio = (enabled: boolean): void => {
  localStream?.getAudioTracks().forEach((t) => {
    t.enabled = enabled;
  });
};

/**
 * Toggle video track
 */
export const toggleVideo = (enabled: boolean): void => {
  localStream?.getVideoTracks().forEach((t) => {
    t.enabled = enabled;
  });
};

/**
 * Destroy current peer connection
 */
export const destroyPeer = (): void => {
  if (currentPeer && !currentPeer.destroyed) {
    currentPeer.destroy();
  }
  currentPeer = null;
};

/**
 * Hang up: destroy peer, stop streams, send end-call signal
 */
export const hangUp = (targetUserId: string, callId: string): void => {
  endCallSignal(targetUserId, callId);
  destroyPeer();
  stopLocalStream();
};
