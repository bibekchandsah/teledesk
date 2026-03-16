/**
 * Utility to synchronize signaling across multiple tabs/windows using localStorage.
 * Only one window should hold the "Active Signaling" lock for a specific callId.
 */
class SignalingLock {
  private windowId: string;

  constructor() {
    this.windowId = Math.random().toString(36).substring(7);
  }

  /**
   * Tries to acquire the lock for a specific callId.
   * Returns true if this window successfully acquired the lock or already holds it.
   */
  acquire(callId: string): boolean {
    const lockKey = `call_lock_${callId}`;
    const now = Date.now();
    const lockData = localStorage.getItem(lockKey);

    if (lockData) {
      try {
        const { id, timestamp } = JSON.parse(lockData);
        // If the lock is held by another window and it's not expired (last updated < 5s ago)
        if (id !== this.windowId && now - timestamp < 5000) {
          return false;
        }
      } catch (e) {
        // Corrupt lock data, ignore and overwrite
      }
    }

    // Acquire or refresh the lock
    localStorage.setItem(lockKey, JSON.stringify({ id: this.windowId, timestamp: now }));
    return true;
  }

  /**
   * Periodically refreshes the lock to keep it alive.
   */
  keepAlive(callId: string) {
    const lockKey = `call_lock_${callId}`;
    localStorage.setItem(lockKey, JSON.stringify({ id: this.windowId, timestamp: Date.now() }));
  }

  /**
   * Releases the lock.
   */
  release(callId: string) {
    const lockKey = `call_lock_${callId}`;
    const lockData = localStorage.getItem(lockKey);
    if (lockData) {
      try {
        const { id } = JSON.parse(lockData);
        if (id === this.windowId) {
          localStorage.removeItem(lockKey);
        }
      } catch (e) {}
    }
  }
}

export const signalingLock = new SignalingLock();
