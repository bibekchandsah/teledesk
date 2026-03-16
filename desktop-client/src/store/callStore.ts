import { create } from 'zustand';
import { CallSession } from '@shared/types';
import callAudioService from '../services/callAudioService';

interface CallState {
  activeCall: CallSession | null;
  incomingCall: CallSession | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isCalleeRinging: boolean; // true once server confirms callee's device is ringing
  callDuration: number; // seconds
  callTimer: ReturnType<typeof setInterval> | null;
  isCallInPopup: boolean; // true when call is handled in a popup window
  showPopupBlockedNotification: boolean; // true when popup might be blocked

  setActiveCall: (call: CallSession | null) => void;
  setIncomingCall: (call: CallSession | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setMuted: (muted: boolean) => void;
  setVideoOff: (off: boolean) => void;
  setIsCalleeRinging: (ringing: boolean) => void;
  setIsCallInPopup: (inPopup: boolean) => void;
  setShowPopupBlockedNotification: (show: boolean) => void;
  startCallTimer: () => void;
  stopCallTimer: () => void;
  endCallCleanup: () => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  activeCall: null,
  incomingCall: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isVideoOff: false,
  isCalleeRinging: false,
  callDuration: 0,
  callTimer: null,
  isCallInPopup: false,
  showPopupBlockedNotification: false,

  setActiveCall: (call) => set({ activeCall: call }),
  setIncomingCall: (call) => set({ incomingCall: call }),
  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),
  setMuted: (muted) => set({ isMuted: muted }),
  setVideoOff: (off) => set({ isVideoOff: off }),
  setIsCalleeRinging: (ringing) => set({ isCalleeRinging: ringing }),
  setIsCallInPopup: (inPopup) => set({ isCallInPopup: inPopup }),
  setShowPopupBlockedNotification: (show) => set({ showPopupBlockedNotification: show }),

  startCallTimer: () => {
    const { callTimer } = get();
    // Prevent multiple timers
    if (callTimer) {
      console.warn('[CallStore] Timer already running, not starting another');
      return;
    }
    console.log('[CallStore] Starting call timer');
    const timer = setInterval(() => {
      set((state) => ({ callDuration: state.callDuration + 1 }));
    }, 1000);
    set({ callTimer: timer, callDuration: 0 });
  },

  stopCallTimer: () => {
    const { callTimer } = get();
    if (callTimer) clearInterval(callTimer);
    set({ callTimer: null, callDuration: 0 });
  },

  endCallCleanup: () => {
    const { callTimer, localStream } = get();
    if (callTimer) clearInterval(callTimer);
    localStream?.getTracks().forEach((t) => t.stop());
    
    // Stop all ringtones when cleaning up call
    callAudioService.stopAllRingtones();
    
    set({
      activeCall: null,
      incomingCall: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isVideoOff: false,
      isCalleeRinging: false,
      callTimer: null,
      callDuration: 0,
      isCallInPopup: false,
      showPopupBlockedNotification: false,
    });
  },
}));
