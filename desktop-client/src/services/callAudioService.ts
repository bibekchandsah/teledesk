/**
 * Call Audio Service
 * Manages ringtones for incoming and outgoing calls
 */

import { getSoundPath } from '../utils/assetPaths';

/**
 * Generate a simple beep sound using Web Audio API as fallback
 */
function createBeepSound(frequency: number = 800, duration: number = 200): HTMLAudioElement {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
    
    // Create a dummy audio element for compatibility
    const audio = new Audio();
    audio.play = () => {
      const newOscillator = audioContext.createOscillator();
      const newGainNode = audioContext.createGain();
      
      newOscillator.connect(newGainNode);
      newGainNode.connect(audioContext.destination);
      
      newOscillator.frequency.value = frequency;
      newOscillator.type = 'sine';
      
      newGainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      newGainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
      
      newOscillator.start(audioContext.currentTime);
      newOscillator.stop(audioContext.currentTime + duration / 1000);
      
      return Promise.resolve();
    };
    
    return audio;
  } catch (error) {
    console.error('[CallAudio] Failed to create beep sound:', error);
    return new Audio(); // Return empty audio element
  }
}

class CallAudioService {
  private incomingRingtone: HTMLAudioElement | null = null;
  private outgoingRingtone: HTMLAudioElement | null = null;
  private isIncomingPlaying = false;
  private isOutgoingPlaying = false;

  constructor() {
    // Preload audio files for instant playback
    this.preloadAudio();
  }

  private preloadAudio() {
    try {
      const incomingPath = getSoundPath('incoming_ring.mp3');
      const outgoingPath = getSoundPath('outgoing_ring.mp3');
      
      console.log('[CallAudio] Loading sounds from:', { incomingPath, outgoingPath });
      
      this.incomingRingtone = new Audio(incomingPath);
      this.incomingRingtone.loop = true;
      this.incomingRingtone.volume = 0.7;
      
      // Add error handling for audio loading
      this.incomingRingtone.addEventListener('error', (e) => {
        console.error('[CallAudio] Failed to load incoming ringtone, using fallback beep:', e);
        this.incomingRingtone = createBeepSound(900, 300); // Higher pitch for incoming
      });
      this.incomingRingtone.addEventListener('canplay', () => {
        console.log('[CallAudio] Incoming ringtone loaded successfully');
      });

      this.outgoingRingtone = new Audio(outgoingPath);
      this.outgoingRingtone.loop = true;
      this.outgoingRingtone.volume = 0.6;
      
      // Add error handling for audio loading
      this.outgoingRingtone.addEventListener('error', (e) => {
        console.error('[CallAudio] Failed to load outgoing ringtone, using fallback beep:', e);
        this.outgoingRingtone = createBeepSound(700, 400); // Lower pitch for outgoing
      });
      this.outgoingRingtone.addEventListener('canplay', () => {
        console.log('[CallAudio] Outgoing ringtone loaded successfully');
      });
    } catch (error) {
      console.error('[CallAudio] Failed to preload ringtones:', error);
      // Create fallback beep sounds
      this.incomingRingtone = createBeepSound(900, 300);
      this.outgoingRingtone = createBeepSound(700, 400);
    }
  }

  /**
   * Play incoming call ringtone
   */
  playIncomingRingtone(): void {
    if (this.isIncomingPlaying) return;

    try {
      // Stop outgoing ringtone if playing
      this.stopOutgoingRingtone();

      if (!this.incomingRingtone) {
        try {
          this.incomingRingtone = new Audio(getSoundPath('incoming_ring.mp3'));
          this.incomingRingtone.loop = true;
          this.incomingRingtone.volume = 0.7;
          
          this.incomingRingtone.addEventListener('error', () => {
            console.warn('[CallAudio] Fallback to beep for incoming ringtone');
            this.incomingRingtone = createBeepSound(900, 300);
          });
        } catch (error) {
          console.warn('[CallAudio] Using beep fallback for incoming ringtone');
          this.incomingRingtone = createBeepSound(900, 300);
        }
      }

      // Ensure the audio is ready before playing
      if (this.incomingRingtone.readyState >= 2) {
        // Audio is loaded enough to play
        this.incomingRingtone.currentTime = 0;
        this.incomingRingtone.play().then(() => {
          this.isIncomingPlaying = true;
        }).catch((err) => {
          console.warn('[CallAudio] Failed to play incoming ringtone:', err);
        });
      } else {
        // Wait for audio to load
        const playWhenReady = () => {
          this.incomingRingtone!.currentTime = 0;
          this.incomingRingtone!.play().then(() => {
            this.isIncomingPlaying = true;
          }).catch((err) => {
            console.warn('[CallAudio] Failed to play incoming ringtone after load:', err);
          });
          this.incomingRingtone!.removeEventListener('canplay', playWhenReady);
        };
        this.incomingRingtone.addEventListener('canplay', playWhenReady);
      }
    } catch (error) {
      console.error('[CallAudio] Error playing incoming ringtone:', error);
    }
  }

  /**
   * Stop incoming call ringtone
   */
  stopIncomingRingtone(): void {
    if (!this.isIncomingPlaying) return;

    try {
      if (this.incomingRingtone) {
        this.incomingRingtone.pause();
        this.incomingRingtone.currentTime = 0;
      }
      this.isIncomingPlaying = false;
    } catch (error) {
      console.error('[CallAudio] Error stopping incoming ringtone:', error);
    }
  }

  /**
   * Play outgoing call ringtone
   */
  playOutgoingRingtone(): void {
    if (this.isOutgoingPlaying) return;

    try {
      // Stop incoming ringtone if playing
      this.stopIncomingRingtone();

      if (!this.outgoingRingtone) {
        try {
          this.outgoingRingtone = new Audio(getSoundPath('outgoing_ring.mp3'));
          this.outgoingRingtone.loop = true;
          this.outgoingRingtone.volume = 0.6;
          
          this.outgoingRingtone.addEventListener('error', () => {
            console.warn('[CallAudio] Fallback to beep for outgoing ringtone');
            this.outgoingRingtone = createBeepSound(700, 400);
          });
        } catch (error) {
          console.warn('[CallAudio] Using beep fallback for outgoing ringtone');
          this.outgoingRingtone = createBeepSound(700, 400);
        }
      }

      this.outgoingRingtone.currentTime = 0;
      this.outgoingRingtone.play().catch((err) => {
        console.warn('[CallAudio] Failed to play outgoing ringtone:', err);
      });
      this.isOutgoingPlaying = true;
    } catch (error) {
      console.error('[CallAudio] Error playing outgoing ringtone:', error);
    }
  }

  /**
   * Stop outgoing call ringtone
   */
  stopOutgoingRingtone(): void {
    if (!this.isOutgoingPlaying) return;

    try {
      if (this.outgoingRingtone) {
        this.outgoingRingtone.pause();
        this.outgoingRingtone.currentTime = 0;
      }
      this.isOutgoingPlaying = false;
    } catch (error) {
      console.error('[CallAudio] Error stopping outgoing ringtone:', error);
    }
  }

  /**
   * Stop all ringtones
   */
  stopAllRingtones(): void {
    this.stopIncomingRingtone();
    this.stopOutgoingRingtone();
  }

  /**
   * Check if any ringtone is currently playing
   */
  isPlaying(): boolean {
    return this.isIncomingPlaying || this.isOutgoingPlaying;
  }

  /**
   * Adjust volume for all ringtones
   */
  setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    if (this.incomingRingtone) {
      this.incomingRingtone.volume = clampedVolume * 0.7;
    }
    if (this.outgoingRingtone) {
      this.outgoingRingtone.volume = clampedVolume * 0.6;
    }
  }

  /**
   * Get current volume setting
   */
  getVolume(): number {
    return this.incomingRingtone?.volume || 0.7;
  }

  /**
   * Mute/unmute all ringtones
   */
  setMuted(muted: boolean): void {
    if (this.incomingRingtone) {
      this.incomingRingtone.muted = muted;
    }
    if (this.outgoingRingtone) {
      this.outgoingRingtone.muted = muted;
    }
  }

  /**
   * Check if ringtones are muted
   */
  isMuted(): boolean {
    return this.incomingRingtone?.muted || false;
  }

  /**
   * Cleanup audio resources
   */
  cleanup(): void {
    this.stopAllRingtones();
    
    if (this.incomingRingtone) {
      this.incomingRingtone.src = '';
      this.incomingRingtone = null;
    }
    
    if (this.outgoingRingtone) {
      this.outgoingRingtone.src = '';
      this.outgoingRingtone = null;
    }
  }
}

// Singleton instance
const callAudioService = new CallAudioService();

export default callAudioService;