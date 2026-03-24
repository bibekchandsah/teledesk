// Shared authentication service for multiple Electron instances
// Uses IPC to communicate with main process for shared auth storage

interface SharedAuthData {
  firebaseUser: any | null;
  currentUser: any | null;
  isAuthenticated: boolean;
  lastUpdated: string;
}

class SharedAuthService {
  private listeners: Array<(data: SharedAuthData) => void> = [];
  private isInitialized = false;

  constructor() {
    console.log('[SharedAuthService] Initializing service...');
    this.initializeWhenReady();
  }

  private async initializeWhenReady() {
    // Wait for electronAPI to be available
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait
    
    while (!window.electronAPI && attempts < maxAttempts) {
      console.log('[SharedAuthService] Waiting for electronAPI... attempt', attempts + 1);
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (window.electronAPI) {
      console.log('[SharedAuthService] electronAPI available, setting up IPC listeners...');
      window.electronAPI.onSharedAuthUpdate((data: SharedAuthData) => {
        console.log('[SharedAuthService] Received auth update via IPC:', data);
        this.notifyListeners(data);
      });
      this.isInitialized = true;
    } else {
      console.warn('[SharedAuthService] electronAPI not available - setting up localStorage listener');
      window.addEventListener('storage', (event) => {
        if (event.key === 'shared-auth-data' && event.newValue) {
          try {
            const data = JSON.parse(event.newValue);
            this.notifyListeners(data);
          } catch (e) {
            console.error('[SharedAuthService] Failed to parse localStorage update', e);
          }
        }
      });
      this.isInitialized = true;
    }
  }

  // Save auth data to shared storage
  async saveAuthData(data: SharedAuthData): Promise<void> {
    console.log('[SharedAuthService] Saving auth data:', data);
    
    // Wait for initialization if needed
    if (!this.isInitialized) {
      console.log('[SharedAuthService] Waiting for initialization...');
      await this.waitForInitialization();
    }
    
    if (window.electronAPI) {
      if (!this.isInitialized) await this.waitForInitialization();
      const result = await window.electronAPI.saveSharedAuth(data);
      console.log('[SharedAuthService] Save result:', result);
    } else {
      console.log('[SharedAuthService] Saving to localStorage fallback');
      localStorage.setItem('shared-auth-data', JSON.stringify(data));
      this.notifyListeners(data);
    }
  }

  // Load auth data from shared storage
  async loadAuthData(): Promise<SharedAuthData | null> {
    console.log('[SharedAuthService] Loading auth data...');
    
    // Wait for initialization if needed
    if (!this.isInitialized) {
      console.log('[SharedAuthService] Waiting for initialization...');
      await this.waitForInitialization();
    }
    
    if (window.electronAPI) {
      if (!this.isInitialized) await this.waitForInitialization();
      const result = await window.electronAPI.loadSharedAuth();
      console.log('[SharedAuthService] Load result:', result);
      return result;
    } else {
      console.log('[SharedAuthService] Loading from localStorage fallback');
      const data = localStorage.getItem('shared-auth-data');
      if (data) {
        try {
          return JSON.parse(data) as SharedAuthData;
        } catch (e) {
          console.error('[SharedAuthService] Failed to parse localStorage data', e);
        }
      }
      return null;
    }
  }

  // Clear auth data from shared storage
  async clearAuthData(): Promise<void> {
    console.log('[SharedAuthService] Clearing auth data...');
    
    // Wait for initialization if needed
    if (!this.isInitialized) {
      console.log('[SharedAuthService] Waiting for initialization...');
      await this.waitForInitialization();
    }
    
    if (window.electronAPI) {
      if (!this.isInitialized) await this.waitForInitialization();
      const result = await window.electronAPI.clearSharedAuth();
      console.log('[SharedAuthService] Clear result:', result);
    } else {
      console.log('[SharedAuthService] Clearing localStorage fallback');
      localStorage.removeItem('shared-auth-data');
    }
  }

  private async waitForInitialization(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 50;
    
    while (!this.isInitialized && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
  }

  // Subscribe to auth updates from other instances
  onAuthUpdate(callback: (data: SharedAuthData) => void): () => void {
    console.log('[SharedAuthService] Adding auth update listener');
    this.listeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      console.log('[SharedAuthService] Removing auth update listener');
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(data: SharedAuthData): void {
    console.log('[SharedAuthService] Notifying', this.listeners.length, 'listeners with data:', data);
    this.listeners.forEach(callback => callback(data));
  }
}

export const sharedAuthService = new SharedAuthService();
export type { SharedAuthData };