/**
 * Call Audio Service
 * Manages ringtones for incoming and outgoing calls
 */

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
      this.incomingRingtone = new Audio('/assets/sounds/incoming_ring.mp3');
      this.incomingRingtone.loop = true;
      this.incomingRingtone.volume = 0.7;

      this.outgoingRingtone = new Audio('/assets/sounds/outgoing_ring.mp3');
      this.outgoingRingtone.loop = true;
      this.outgoingRingtone.volume = 0.6;
    } catch (error) {
      console.error('[CallAudio] Failed to preload ringtones:', error);
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
        this.incomingRingtone = new Audio('/assets/sounds/incoming_ring.mp3');
        this.incomingRingtone.loop = true;
        this.incomingRingtone.volume = 0.7;
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
        this.outgoingRingtone = new Audio('/assets/sounds/outgoing_ring.mp3');
        this.outgoingRingtone.loop = true;
        this.outgoingRingtone.volume = 0.6;
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