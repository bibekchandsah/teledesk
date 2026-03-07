import { contextBridge, ipcRenderer } from 'electron';

// ─── Expose safe APIs to the renderer process ─────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  // Notifications
  showNotification: (payload: { title: string; body: string; icon?: string }) => {
    ipcRenderer.send('show-notification', payload);
  },

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // App info
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  // Open a chat in a new Electron window
  openChatWindow: (chatId: string) => ipcRenderer.send('open-chat-window', chatId),

  // Platform info
  platform: process.platform,
});

// ─── TypeScript type declaration for renderer use ─────────────────────────
export interface ElectronAPI {
  showNotification: (payload: { title: string; body: string; icon?: string }) => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  getAppVersion: () => Promise<string>;
  openChatWindow: (chatId: string) => void;
  platform: NodeJS.Platform;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
