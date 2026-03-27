// Multi-account authentication service for Electron
// Manages multiple logged-in accounts with independent tokens

export interface AccountData {
  uid: string;
  email: string;
  name: string;
  avatar: string;
  accessToken: string;
  lastUsed: string;
}

export interface MultiAccountStorage {
  accounts: AccountData[];
  activeAccountUid: string | null;
  lastUpdated: string;
}

class MultiAccountAuthService {
  private listeners: Array<(data: MultiAccountStorage) => void> = [];
  private isInitialized = false;

  constructor() {
    console.log('[MultiAccountAuth] Initializing service...');
    this.initializeWhenReady();
  }

  private async initializeWhenReady() {
    let attempts = 0;
    const maxAttempts = 50;
    
    while (!window.electronAPI && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (window.electronAPI) {
      console.log('[MultiAccountAuth] electronAPI available, setting up IPC listeners...');
      window.electronAPI.onMultiAccountUpdate?.((data: MultiAccountStorage) => {
        console.log('[MultiAccountAuth] Received account update via IPC:', data);
        this.notifyListeners(data);
      });
      this.isInitialized = true;
    } else {
      console.warn('[MultiAccountAuth] electronAPI not available - running in web mode?');
    }
  }

  // Save all accounts to shared storage
  async saveAccounts(data: MultiAccountStorage): Promise<void> {
    console.log('[MultiAccountAuth] Saving accounts:', data);
    
    if (window.electronAPI?.saveMultiAccounts) {
      if (!this.isInitialized) await this.waitForInitialization();
      const result = await window.electronAPI.saveMultiAccounts(data);
      console.log('[MultiAccountAuth] Save result:', result);
    } else {
      console.log('[MultiAccountAuth] Saving to localStorage fallback');
      localStorage.setItem('multi-account-auth-data', JSON.stringify(data));
    }
  }

  // Load all accounts from shared storage
  async loadAccounts(): Promise<MultiAccountStorage | null> {
    console.log('[MultiAccountAuth] Loading accounts...');
    
    if (window.electronAPI?.loadMultiAccounts) {
      if (!this.isInitialized) await this.waitForInitialization();
      const result = await window.electronAPI.loadMultiAccounts();
      console.log('[MultiAccountAuth] Load result:', result);
      return result;
    } else {
      console.log('[MultiAccountAuth] Loading from localStorage fallback');
      const data = localStorage.getItem('multi-account-auth-data');
      if (data) {
        try {
          return JSON.parse(data) as MultiAccountStorage;
        } catch (e) {
          console.error('[MultiAccountAuth] Failed to parse localStorage data', e);
        }
      }
      return null;
    }
  }

  // Add or update an account
  async addOrUpdateAccount(account: AccountData): Promise<void> {
    console.log('[MultiAccountAuth] Adding/updating account:', account.email);
    
    const storage = await this.loadAccounts() || { accounts: [], activeAccountUid: null, lastUpdated: new Date().toISOString() };
    
    // Find existing account
    const existingIndex = storage.accounts.findIndex(a => a.uid === account.uid);
    
    if (existingIndex >= 0) {
      // Update existing account
      storage.accounts[existingIndex] = account;
      console.log('[MultiAccountAuth] Updated existing account');
    } else {
      // Add new account
      storage.accounts.push(account);
      console.log('[MultiAccountAuth] Added new account');
    }
    
    // Set as active account
    storage.activeAccountUid = account.uid;
    storage.lastUpdated = new Date().toISOString();
    
    await this.saveAccounts(storage);
  }

  // Set active account
  async setActiveAccount(uid: string): Promise<void> {
    console.log('[MultiAccountAuth] Setting active account:', uid);
    
    const storage = await this.loadAccounts();
    if (!storage) {
      console.warn('[MultiAccountAuth] No accounts found');
      return;
    }
    
    const account = storage.accounts.find(a => a.uid === uid);
    if (!account) {
      console.warn('[MultiAccountAuth] Account not found:', uid);
      return;
    }
    
    storage.activeAccountUid = uid;
    storage.lastUpdated = new Date().toISOString();
    
    // Update last used timestamp
    account.lastUsed = new Date().toISOString();
    
    await this.saveAccounts(storage);
  }

  // Get active account
  async getActiveAccount(): Promise<AccountData | null> {
    const storage = await this.loadAccounts();
    if (!storage || !storage.activeAccountUid) {
      return null;
    }
    
    return storage.accounts.find(a => a.uid === storage.activeAccountUid) || null;
  }

  // Get all accounts
  async getAllAccounts(): Promise<AccountData[]> {
    const storage = await this.loadAccounts();
    return storage?.accounts || [];
  }

  // Remove an account
  async removeAccount(uid: string): Promise<void> {
    console.log('[MultiAccountAuth] Removing account:', uid);
    
    const storage = await this.loadAccounts();
    if (!storage) return;
    
    storage.accounts = storage.accounts.filter(a => a.uid !== uid);
    
    // If removed account was active, set another as active
    if (storage.activeAccountUid === uid) {
      storage.activeAccountUid = storage.accounts.length > 0 ? storage.accounts[0].uid : null;
    }
    
    storage.lastUpdated = new Date().toISOString();
    
    await this.saveAccounts(storage);
  }

  // Clear the active account (on session expiry) without removing it from the list
  async clearActiveAccount(): Promise<void> {
    const storage = await this.loadAccounts();
    if (!storage) return;
    storage.activeAccountUid = null;
    storage.lastUpdated = new Date().toISOString();
    await this.saveAccounts(storage);
  }

  // Clear all accounts
  async clearAllAccounts(): Promise<void> {
    console.log('[MultiAccountAuth] Clearing all accounts...');
    
    if (window.electronAPI?.clearMultiAccounts) {
      if (!this.isInitialized) await this.waitForInitialization();
      const result = await window.electronAPI.clearMultiAccounts();
      console.log('[MultiAccountAuth] Clear result:', result);
    } else {
      console.log('[MultiAccountAuth] Clearing localStorage fallback');
      localStorage.removeItem('multi-account-auth-data');
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

  // Subscribe to account updates from other instances
  onAccountUpdate(callback: (data: MultiAccountStorage) => void): () => void {
    console.log('[MultiAccountAuth] Adding account update listener');
    this.listeners.push(callback);
    
    return () => {
      console.log('[MultiAccountAuth] Removing account update listener');
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(data: MultiAccountStorage): void {
    console.log('[MultiAccountAuth] Notifying', this.listeners.length, 'listeners');
    this.listeners.forEach(callback => callback(data));
  }
}

export const multiAccountAuthService = new MultiAccountAuthService();
