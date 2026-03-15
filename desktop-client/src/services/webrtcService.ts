import Sp from 'simple-peer';
import type { Instance as SimplePeerInstance } from 'simple-peer';
// Handle Vite CJS/ESM interop — simple-peer exports as CJS module.exports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SimplePeer = ((Sp as any).default ?? Sp) as typeof Sp;
import { WEBRTC_CONFIG } from '../config/webrtc';
import { sendOffer, sendAnswer, sendIceCandidate, endCall as endCallSignal } from './socketService';
import { addConnectionDiagnostics } from './webrtcDiagnostics';

export interface PeerConnection {
  peer: SimplePeerInstance;
  stream: MediaStream | null;
  remoteStream: MediaStream | null;
}

let currentPeer: SimplePeerInstance | null = null;
let localStream: MediaStream | null = null;
// Tracks the first (main) remote stream so renegotiation streams (e.g. screen share)
// can merge their video tracks in without replacing the original audio stream.
let firstRemoteStream: MediaStream | null = null;
// Module-level remote stream callback — stored so processRenegotiationOffer can update
// the UI when video tracks are removed (e.g. remote peer stops screen sharing).
let remoteStreamCallback: ((stream: MediaStream) => void) | null = null;
// Signaling targets — needed so startScreenShare can send renegotiation offers directly.
let currentTargetUserId: string | null = null;
let currentCallId: string | null = null;

export const hasPeer = (): boolean => currentPeer !== null && !(currentPeer as any).destroyed;

/** Called by CallContext once a call session is established so renegotiation can use the IDs. */
export const setCallTarget = (targetUserId: string, callId: string): void => {
  currentTargetUserId = targetUserId;
  currentCallId = callId;
};

// ─── Media Stream ──────────────────────────────────────────────────────────

/**
 * Get local media stream based on call type
 */
export const getLocalStream = async (callType: 'video' | 'voice'): Promise<MediaStream> => {
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
  }
  const savedMicId = localStorage.getItem('selectedMicId');
  const savedCamId = localStorage.getItem('selectedCameraId');
  
  // Use 'ideal' constraints for better compatibility
  const audioConstraint: MediaTrackConstraints = savedMicId
    ? { deviceId: { ideal: savedMicId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    
  const videoConstraint: MediaTrackConstraints | boolean =
    callType === 'video'
      ? savedCamId
        ? { deviceId: { ideal: savedCamId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
      : false;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraint,
      video: videoConstraint,
    });
    return localStream;
  } catch (err) {
    console.error('[WebRTC] getUserMedia failed, falling back to basic constraints:', err);
    // Fallback: try with just basic audio/video
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video'
    });
    return localStream;
  }
};

export const stopLocalStream = (): void => {
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
};

// ─── Peer Connection ───────────────────────────────────────────────────────

/**
 * Merges video tracks from a renegotiation stream into firstRemoteStream so that
 * the original audio track is preserved while the new video (screen share) appears.
 * Creates a new MediaStream object so React detects the change via reference equality.
 */
function mergeRenegotiationStream(
  newStream: MediaStream,
  onRemoteStream: (stream: MediaStream) => void,
): void {
  if (!firstRemoteStream) return;
  // Remove existing video tracks (e.g. previous screen share)
  firstRemoteStream.getVideoTracks().forEach((t) => firstRemoteStream!.removeTrack(t));
  // Add incoming video tracks
  newStream.getVideoTracks().forEach((track) => {
    firstRemoteStream!.addTrack(track);
    // When the remote side stops screen sharing, remove the track and notify
    track.onended = () => {
      firstRemoteStream?.removeTrack(track);
      if (firstRemoteStream) {
        const updated = new MediaStream(firstRemoteStream.getTracks());
        firstRemoteStream = updated;
        onRemoteStream(updated);
      }
    };
  });
  // Clone to a new reference so React re-renders
  const updated = new MediaStream(firstRemoteStream.getTracks());
  firstRemoteStream = updated;
  onRemoteStream(updated);
}

/**
 * Forces renegotiation by creating an offer directly on the RTCPeerConnection
 * and sending it via the signaling channel. Used for voice-call screen share
 * where simple-peer's own renegotiation mechanism may not trigger reliably.
 *
 * @param trackOp  Optional track mutation (addTrack / removeTrack) to execute
 *                 AFTER suppressing simple-peer's negotiationneeded handler but
 *                 BEFORE creating the offer. This prevents simple-peer from racing
 *                 us by creating a competing offer when the negotiationneeded event
 *                 fires, which would overwrite our localDescription and make the
 *                 incoming answer invalid on subsequent cycles.
 */
async function forceRenegotiation(pc: RTCPeerConnection, trackOp?: () => void): Promise<void> {
  if (!currentTargetUserId || !currentCallId) {
    console.warn('[WebRTC] forceRenegotiation: missing target info, falling back to simple-peer');
    if (currentPeer && !(currentPeer as any).destroyed) {
      (currentPeer as any)._needsNegotiation?.();
    }
    return;
  }
  // Suppress simple-peer's handler SYNCHRONOUSLY — before any await — so the
  // already-queued negotiationneeded task fires with a null handler and is a no-op.
  const savedHandler = pc.onnegotiationneeded;
  pc.onnegotiationneeded = null;
  // Run the track mutation now that the handler is suppressed.
  trackOp?.();
  try {
    const offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);
    sendOffer(currentTargetUserId, currentCallId, { type: 'offer', sdp: offer.sdp! });
  } catch (err) {
    console.error('[WebRTC] forceRenegotiation failed:', err);
  } finally {
    // Restore after one tick: any pending negotiationneeded tasks will have fired
    // by then (seeing null → no-op), so restoring here is safe for future events.
    setTimeout(() => { pc.onnegotiationneeded = savedHandler; }, 0);
  }
}

/**
 * Initiates an ICE restart to repair a broken connection.
 */
export const restartIce = async (): Promise<void> => {
  if (!currentPeer || (currentPeer as any).destroyed) return;
  const pc: RTCPeerConnection = (currentPeer as any)._pc;
  if (!pc) return;

  console.log('[WebRTC] Initiating ICE restart...');
  await forceRenegotiation(pc);
};

/**
 * Processes a renegotiation offer on the receiver side (user B) by using the raw
 * RTCPeerConnection directly, bypassing simple-peer's state machine. Sends the
 * answer back through the signaling channel.
 */
export const processRenegotiationOffer = async (
  offer: RTCSessionDescriptionInit,
  sendToUserId: string,
  callId: string,
): Promise<void> => {
  if (!currentPeer || (currentPeer as any).destroyed) return;
  const pc: RTCPeerConnection = (currentPeer as any)._pc;
  if (!pc) return;
  try {
    // If we receive an offer while simple-peer is in a transition state,
    // we bypass its signal() method and handle the SDP directly on the PC.
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendAnswer(sendToUserId, callId, { type: 'answer', sdp: answer.sdp! });

    console.log('[WebRTC] Handled renegotiation offer successfully');

    // Detect whether the remote peer is currently sending video.
    // When they paused (replaceTrack(null) + renegotiate), the video m-line direction
    // becomes 'recvonly' or 'inactive' from our perspective.
    // IMPORTANT: we do NOT remove the track from firstRemoteStream here — we keep it
    // so that when the peer resumes (replaceTrack(newTrack), no renegotiation) the
    // existing receiver track simply unmutes and the video reappears automatically.
    // We only remove the track if the m-line is completely gone from the SDP.
    if (firstRemoteStream && firstRemoteStream.getVideoTracks().length > 0 && remoteStreamCallback) {
      const offerSdp = offer.sdp ?? '';
      const hasVideoSection = offerSdp.includes('m=video');
      if (!hasVideoSection) {
        // No video m-line at all — safe to discard the track entirely.
        firstRemoteStream.getVideoTracks().forEach((t) => { t.stop(); firstRemoteStream!.removeTrack(t); });
        const updated = new MediaStream(firstRemoteStream.getTracks());
        firstRemoteStream = updated;
        remoteStreamCallback(updated);
      } else {
        // Video m-line present but direction changed (peer paused) — just re-notify
        // React so it can re-evaluate remoteHasVideo (track may be muted now).
        const clone = new MediaStream(firstRemoteStream.getTracks());
        firstRemoteStream = clone;
        remoteStreamCallback(clone);
      }
    }
  } catch (err) {
    console.error('[WebRTC] processRenegotiationOffer failed:', err);
  }
};

/**
 * Attaches a direct RTCPeerConnection 'track' event listener that catches
 * renegotiation video tracks simple-peer's 'stream' event misses, and hooks
 * 'onunmute' for replaceTrack(null) → replaceTrack(newTrack) resume cycles.
 * Must be called for BOTH initiator and receiver peers.
 */
function attachRenegotiationTrackListener(
  onRemoteStream: (stream: MediaStream) => void,
): void {
  const pc: RTCPeerConnection = (currentPeer as any)._pc;
  if (!pc) return;
  pc.addEventListener('track', (event: RTCTrackEvent) => {
    if (!firstRemoteStream) return; // initial stream not set yet — simple-peer handles it
    const track = event.track;
    if (track.kind !== 'video') return;

    // Hook onunmute: fired when the remote peer calls replaceTrack(newTrack) after
    // a previous replaceTrack(null). No renegotiation happens for that, so this
    // is the only signal we get that video is flowing again.
    track.onunmute = () => {
      if (!firstRemoteStream || !remoteStreamCallback) return;
      if (!firstRemoteStream.getTrackById(track.id)) {
        firstRemoteStream.addTrack(track);
      }
      const clone = new MediaStream(firstRemoteStream.getTracks());
      firstRemoteStream = clone;
      remoteStreamCallback(clone);
    };

    // Track already known — nothing else to do (onunmute above handles resume).
    if (firstRemoteStream.getTrackById(track.id)) return;
    // New renegotiation track — merge it into firstRemoteStream.
    const src = event.streams[0] ?? new MediaStream([track]);
    mergeRenegotiationStream(src, onRemoteStream);
  });
}

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
  firstRemoteStream = null;
  remoteStreamCallback = onRemoteStream;

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

  // Attach after simple-peer has set up its own listeners (next tick).
  // Catches renegotiation video tracks A receives from B (e.g. B enables camera).
  setTimeout(() => attachRenegotiationTrackListener(onRemoteStream), 0);

  // Add connection diagnostics
  setTimeout(() => addConnectionDiagnostics(currentPeer, onError, 'Initiator'), 0);

  currentPeer.on('stream', (remoteStream) => {
    if (!firstRemoteStream) {
      firstRemoteStream = remoteStream;
      // Attach onunmute to existing video tracks so re-enable cycles (replaceTrack after
      // replaceTrack(null)) trigger a React re-render even without renegotiation.
      remoteStream.getVideoTracks().forEach((track) => {
        track.onunmute = () => {
          if (!firstRemoteStream || !remoteStreamCallback) return;
          const clone = new MediaStream(firstRemoteStream.getTracks());
          firstRemoteStream = clone;
          remoteStreamCallback(clone);
        };
      });
      onRemoteStream(remoteStream);
    } else {
      mergeRenegotiationStream(remoteStream, onRemoteStream);
    }
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
  firstRemoteStream = null;
  remoteStreamCallback = onRemoteStream;

  currentPeer = new SimplePeer({
    initiator: false,
    stream,
    trickle: true,
    config: { iceServers: [...WEBRTC_CONFIG.ICE_SERVERS] as RTCIceServer[] },
  });

  // Attach after simple-peer has set up its own listeners (next tick).
  // Shared helper handles both renegotiation tracks and onunmute resume cycles.
  setTimeout(() => attachRenegotiationTrackListener(onRemoteStream), 0);

  // Add connection diagnostics
  setTimeout(() => addConnectionDiagnostics(currentPeer, onError, 'Receiver'), 0);

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
    if (!firstRemoteStream) {
      firstRemoteStream = remoteStream;
      // Attach onunmute to initial video tracks for replaceTrack resume cycles.
      remoteStream.getVideoTracks().forEach((track) => {
        track.onunmute = () => {
          if (!firstRemoteStream || !remoteStreamCallback) return;
          const clone = new MediaStream(firstRemoteStream.getTracks());
          firstRemoteStream = clone;
          remoteStreamCallback(clone);
        };
      });
      onRemoteStream(remoteStream);
    } else {
      mergeRenegotiationStream(remoteStream, onRemoteStream);
    }
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
 * Process a renegotiation answer directly on the initiator's RTCPeerConnection.
 * Used when renegotiation was triggered manually (e.g. voice-call screen share).
 */
export const processRenegotiationAnswer = async (answer: RTCSessionDescriptionInit): Promise<void> => {
  if (!currentPeer || (currentPeer as any).destroyed) return;
  const pc: RTCPeerConnection = (currentPeer as any)._pc;
  if (!pc) return;
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (err) {
    console.error('[WebRTC] processRenegotiationAnswer failed:', err);
  }
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
 * Toggle video track.
 * Uses replaceTrack(null/track) on the RTP sender so the remote peer sees
 * track.muted change (not just black frames), which lets the remote UI detect
 * when both users have disabled their cameras and revert to voice-call mode.
 * The track stays in localStream with enabled=false for local preview purposes.
 */
export const toggleVideo = async (enabled: boolean): Promise<void> => {
  const tracks = localStream?.getVideoTracks() ?? [];
  // Keep local preview consistent (black when off).
  tracks.forEach((t) => { t.enabled = enabled; });

  if (!currentPeer || (currentPeer as any).destroyed) return;
  const pc: RTCPeerConnection = (currentPeer as any)._pc;
  if (!pc) return;

  // Find the video transceiver even when its sender track has been nulled out
  // (sender.track === null after a previous replaceTrack(null)).
  const transceiver = pc.getTransceivers().find(
    (t) => t.sender.track?.kind === 'video' ||
            (t.sender.track === null && t.receiver.track?.kind === 'video'),
  );
  if (!transceiver) return;

  if (enabled) {
    // Restore the actual track so remote goes from muted → live.
    const track = tracks[0] ?? null;
    if (track) await transceiver.sender.replaceTrack(track);
  } else {
    // Null the sender — remote track.muted becomes true, triggering UI revert.
    await transceiver.sender.replaceTrack(null);
  }
};

/**
 * Switch microphone live during a call.
 * Replaces the audio track in both the local stream and the peer connection.
 */
export const switchMicrophone = async (deviceId: string): Promise<void> => {
  const newStream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: deviceId } },
    video: false,
  });
  const newTrack = newStream.getAudioTracks()[0];
  if (!newTrack) return;

  // Replace in peer connection
  if (currentPeer) {
    // @ts-ignore — simple-peer exposes _pc (RTCPeerConnection) internally
    const pc: RTCPeerConnection = (currentPeer as any)._pc;
    if (pc) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(newTrack);
    }
  }

  // Replace in local stream reference
  if (localStream) {
    localStream.getAudioTracks().forEach((t) => { t.stop(); localStream!.removeTrack(t); });
    localStream.addTrack(newTrack);
  }

  localStorage.setItem('selectedMicId', deviceId);
};

/**
 * Switch camera live during a video call.
 * Replaces the video track in both the local stream and the peer connection.
 */
export const switchCamera = async (deviceId: string): Promise<void> => {
  const newStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { deviceId: { exact: deviceId }, width: 1280, height: 720 },
  });
  const newTrack = newStream.getVideoTracks()[0];
  if (!newTrack) return;

  if (currentPeer) {
    // @ts-ignore
    const pc: RTCPeerConnection = (currentPeer as any)._pc;
    if (pc) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newTrack);
    }
  }

  if (localStream) {
    localStream.getVideoTracks().forEach((t) => { t.stop(); localStream!.removeTrack(t); });
    localStream.addTrack(newTrack);
  }

  localStorage.setItem('selectedCameraId', deviceId);
};

let screenStream: MediaStream | null = null;
let savedCameraTrack: MediaStreamTrack | null = null;

/**
 * Start screen sharing. Replaces the video track sent to the remote peer
 * and updates localStream so the UI shows the shared screen.
 *
 * @param onEnded    Called when the user stops sharing (browser stop button or track ended).
 * @param extStream  Pre-acquired MediaStream (used in Electron via desktopCapturer IPC).
 *                   When omitted, falls back to navigator.mediaDevices.getDisplayMedia().
 */
export const startScreenShare = async (onEnded?: () => void, extStream?: MediaStream): Promise<void> => {
  screenStream = extStream ?? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  const screenTrack = screenStream.getVideoTracks()[0];
  if (!screenTrack) return;

  // Replace or add track in peer connection
  if (currentPeer) {
    // @ts-ignore — simple-peer exposes _pc (RTCPeerConnection) internally
    const pc: RTCPeerConnection = (currentPeer as any)._pc;
    if (pc) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        // Video call: replace existing camera track with screen track (no renegotiation needed)
        await sender.replaceTrack(screenTrack);
      } else {
        // Voice call: no video sender — add a new track and force renegotiation manually.
        // Pass addTrack as a callback so it runs inside forceRenegotiation's suppression
        // window, preventing simple-peer from creating a competing offer.
        await forceRenegotiation(pc, () => pc.addTrack(screenTrack, screenStream!));
      }
    }
  }

  // Swap track in local stream so the local preview shows the screen
  if (localStream) {
    savedCameraTrack = localStream.getVideoTracks()[0] ?? null;
    localStream.getVideoTracks().forEach((t) => localStream!.removeTrack(t));
    localStream.addTrack(screenTrack);
  }

  // When the user clicks the browser's native "Stop sharing" button
  screenTrack.onended = () => {
    stopScreenShare();
    onEnded?.();
  };
};

/**
 * Stop screen sharing and restore the camera video track.
 */
export const stopScreenShare = async (): Promise<void> => {
  if (!screenStream) return;

  screenStream.getTracks().forEach((t) => t.stop());
  screenStream = null;

  if (!localStream) return;

  // Remove the (now-stopped) screen track from local stream
  localStream.getVideoTracks().forEach((t) => { t.stop(); localStream!.removeTrack(t); });

  // If this was a voice call (no saved camera), we're done — just remove the screen track
  if (!savedCameraTrack) {
    // Remove the video sender we added during screen share and renegotiate
    if (currentPeer) {
      // @ts-ignore
      const pc: RTCPeerConnection = (currentPeer as any)._pc;
      if (pc) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          pc.removeTrack(sender);
          await forceRenegotiation(pc);
        }
      }
    }
    return;
  }

  // Video call: restore camera track
  let camTrack: MediaStreamTrack | null = null;
  if (savedCameraTrack && savedCameraTrack.readyState !== 'ended') {
    camTrack = savedCameraTrack;
  } else {
    const cameraDeviceId = localStorage.getItem('selectedCameraId') ?? undefined;
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: cameraDeviceId
        ? { deviceId: { exact: cameraDeviceId }, width: 1280, height: 720 }
        : { width: 1280, height: 720 },
    });
    camTrack = newStream.getVideoTracks()[0] ?? null;
  }
  savedCameraTrack = null;

  if (!camTrack) return;

  if (currentPeer) {
    // @ts-ignore
    const pc: RTCPeerConnection = (currentPeer as any)._pc;
    if (pc) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(camTrack);
    }
  }

  localStream.addTrack(camTrack);
};

/**
 * Enable camera during a voice call (upgrade to video).
 * Acquires a camera track, adds it to both localStream and the peer connection,
 * then triggers renegotiation (first time only) so the remote side receives the
 * new video track. On subsequent cycles the transceiver is reused via replaceTrack
 * so no renegotiation is needed and m-line counts stay stable.
 */
export const enableCallVideo = async (): Promise<void> => {
  if (!currentPeer || (currentPeer as any).destroyed) return;
  const pc: RTCPeerConnection = (currentPeer as any)._pc;
  if (!pc) return;

  const cameraDeviceId = localStorage.getItem('selectedCameraId') ?? undefined;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: cameraDeviceId
      ? { deviceId: { ideal: cameraDeviceId }, width: 1280, height: 720 }
      : { width: 1280, height: 720 },
  });
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return;

  // Update local stream preview
  if (localStream) {
    localStream.getVideoTracks().forEach((t) => { t.stop(); localStream!.removeTrack(t); });
    localStream.addTrack(videoTrack);
  }

  // Find any existing video transceiver — including recvonly ones that were created
  // when the remote peer added video first (our direction is recvonly in that case).
  const existingTransceiver = pc.getTransceivers().find(
    (t) => t.receiver.track?.kind === 'video' ||
            t.sender.track?.kind === 'video' ||
            // null-track sender paired with a video receiver = paused or recvonly
            (t.sender.track === null && t.receiver.track?.kind === 'video'),
  );

  if (existingTransceiver) {
    // replaceTrack does NOT trigger negotiationneeded, so it is safe to await before
    // entering forceRenegotiation's suppression window.
    await existingTransceiver.sender.replaceTrack(videoTrack);

    const dir = existingTransceiver.direction;
    if (dir === 'recvonly' || dir === 'inactive') {
      // Direction change triggers negotiationneeded — do it INSIDE forceRenegotiation
      // so simple-peer's competing offer is suppressed.
      const newDir = dir === 'recvonly' ? 'sendrecv' : 'sendonly';
      await forceRenegotiation(pc, () => { existingTransceiver.direction = newDir; });
    }
    // If direction is already sendrecv/sendonly, replaceTrack alone is sufficient.
  } else {
    // No video transceiver at all — add one and renegotiate.
    await forceRenegotiation(pc, () => pc.addTrack(videoTrack, localStream ?? stream));
  }
};

/**
 * Disable camera during a call that was upgraded to video.
 * Uses replaceTrack(null) instead of removeTrack so the video transceiver stays
 * alive. This prevents m-line accumulation across enable/disable cycles and means
 * re-enabling just calls replaceTrack again — no renegotiation ever needed.
 */
export const disableCallVideo = async (): Promise<void> => {
  if (!currentPeer || (currentPeer as any).destroyed) return;
  const pc: RTCPeerConnection = (currentPeer as any)._pc;
  if (!pc) return;

  // Stop and remove from local stream
  if (localStream) {
    localStream.getVideoTracks().forEach((t) => { t.stop(); localStream!.removeTrack(t); });
  }

  const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
  if (sender) {
    // replaceTrack(null) stops RTP without removing the transceiver.
    await sender.replaceTrack(null);
    // Update direction inside forceRenegotiation's suppression window so simple-peer
    // cannot race us with a competing offer triggered by the direction change.
    const transceiver = pc.getTransceivers().find((t) => t.sender === sender);
    await forceRenegotiation(pc, () => {
      if (transceiver) {
        const dir = transceiver.direction;
        // Preserve receive side: sendrecv → recvonly, sendonly → inactive.
        if (dir === 'sendrecv') transceiver.direction = 'recvonly';
        else if (dir === 'sendonly') transceiver.direction = 'inactive';
      }
    });
  }
};

/**
 * Destroy current peer connection
 */
export const destroyPeer = (): void => {
  if (currentPeer && !currentPeer.destroyed) {
    currentPeer.destroy();
  }
  currentPeer = null;
  firstRemoteStream = null;
  remoteStreamCallback = null;
};

/**
 * Hang up: destroy peer, stop streams, send end-call signal
 */
export const hangUp = (targetUserId: string, callId: string): void => {
  endCallSignal(targetUserId, callId);
  destroyPeer();
  stopLocalStream();
};

// Export connectivity test for UI
export { testConnectivity } from './webrtcDiagnostics';