import { contextBridge, ipcRenderer } from 'electron';

// ─── Expose safe APIs to the renderer process ─────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  // Notifications
  showNotification: (payload: { title: string; body: string; icon?: string; chatId?: string }) => {
    ipcRenderer.send('show-notification', payload);
  },
  onNotificationReply: (cb: (chatId: string, text: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, chatId: string, text: string) => cb(chatId, text);
    ipcRenderer.on('notification:reply', handler);
    return () => ipcRenderer.off('notification:reply', handler);
  },

  // Auth
  onAuthExternalToken: (cb: (token: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, token: string) => cb(token);
    ipcRenderer.on('auth:external-token', handler);
    return () => ipcRenderer.off('auth:external-token', handler);
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

  // Screen share: get available screen/window sources with thumbnails
  getDesktopSources: (opts?: {
    types?: Array<'screen' | 'window'>;
    thumbnailSize?: { width: number; height: number };
  }): Promise<DesktopSource[]> =>
    ipcRenderer.invoke('get-desktop-sources', opts ?? { types: ['screen', 'window'] }),

  // ─── Call window management (called from main window) ──────────────────
  /** Open the call window with initialization data */
  openCallWindow: (data: CallWindowInitData) => ipcRenderer.send('call:open-window', data),
  /** Force-close the call window without triggering hangup notification */
  closeCallWindow: () => ipcRenderer.send('call:force-close'),
  /** Open the incoming call as the merged call window (isOutgoing: false) */
  openIncomingCallWindow: (data: IncomingCallData) =>
    ipcRenderer.send('incoming-call:open-window', {
      callId: data.callId,
      callType: data.callType,
      isOutgoing: false,
      targetUserId: data.callerId,
      targetName: data.callerName,
      targetAvatar: data.callerAvatar,
    }),

  // ─── Socket relay (called from main window to relay events to call window) ─
  /** Relay a socket event to the call window renderer */
  relayToCallWindow: (event: string, data: unknown) =>
    ipcRenderer.send('call:relay-to-window', event, data),
  /** Listen for socket emit requests coming FROM the call window */
  onCallWindowSocketEmit: (cb: (event: string, data: unknown) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, event: string, data: unknown) =>
      cb(event, data);
    ipcRenderer.on('call:window-socket-emit', handler);
    return () => ipcRenderer.off('call:window-socket-emit', handler);
  },
  /** Listen for lifecycle events from any call window (hangup, closed, incoming-accept, incoming-reject) */
  onCallWindowEvent: (cb: (event: string, data: unknown) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, event: string, data: unknown) =>
      cb(event, data);
    ipcRenderer.on('call:window-event', handler);
    return () => ipcRenderer.off('call:window-event', handler);
  },

  // ─── Call window renderer APIs (used inside the call BrowserWindow) ────
  /** Signal to the main process that the call window renderer is mounted and ready */
  requestCallWindowReady: () => ipcRenderer.send('call:window-ready'),
  /** Receive call initialization data once the window is ready */
  onCallWindowInit: (cb: (data: CallWindowInitData) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: CallWindowInitData) => cb(data);
    ipcRenderer.on('call:init-data', handler);
    return () => ipcRenderer.off('call:init-data', handler);
  },
  /** Receive socket events relayed from the main window */
  onRelayedSocketEvent: (cb: (event: string, data: unknown) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, event: string, data: unknown) =>
      cb(event, data);
    ipcRenderer.on('call:socket-event', handler);
    return () => ipcRenderer.off('call:socket-event', handler);
  },
  /** Emit a socket event through the main window's socket connection */
  emitSocketFromCallWindow: (event: string, data: unknown) =>
    ipcRenderer.send('call:socket-emit', event, data),
  /** Hangup: destroy call window and notify main window */
  hangupCallWindow: () => ipcRenderer.send('call:hangup-from-window'),
  /** Send a named lifecycle event from the call window to the main window */
  sendWindowEvent: (event: string) => ipcRenderer.send('call:send-window-event', event),
  /** Toggle mini-player (PiP) mode for the call window */
  setCallMiniMode: (enabled: boolean) => ipcRenderer.send('call:set-mini-mode', enabled),
  /** Minimize the call window to the taskbar */
  minimizeCallWindow: () => ipcRenderer.send('call:window-minimize'),
  /** Maximize or restore the call window */
  maximizeCallWindow: () => ipcRenderer.send('call:window-maximize'),
  /** Listen for window maximization state changes */
  onCallWindowMaximized: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('call:window-maximized', handler);
    return () => ipcRenderer.off('call:window-maximized', handler);
  },
  onCallWindowUnmaximized: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('call:window-unmaximized', handler);
    return () => ipcRenderer.off('call:window-unmaximized', handler);
  },
  onCallRequestCloseConfirmation: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('call:request-close-confirmation', handler);
    return () => ipcRenderer.off('call:request-close-confirmation', handler);
  },

  // ─── Incoming call window renderer APIs ───────────────────────────────
  /** Signal main process that the incoming call window renderer is ready */
  requestIncomingCallWindowReady: () => ipcRenderer.send('incoming-call:window-ready'),
  /** Receive incoming call data in the notification window */
  onIncomingCallWindowInit: (cb: (data: IncomingCallData) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: IncomingCallData) => cb(data);
    ipcRenderer.on('incoming-call:init-data', handler);
    return () => ipcRenderer.off('incoming-call:init-data', handler);
  },
  /** Accept the incoming call from the notification window */
  acceptIncomingCallFromWindow: () => ipcRenderer.send('incoming-call:accept'),
  /** Reject the incoming call from the notification window */
  rejectIncomingCallFromWindow: () => ipcRenderer.send('incoming-call:reject'),

  // Copy image to clipboard natively (bypasses CORS)
  copyImageToClipboard: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('copy-image-to-clipboard', url),

  // Copy text to clipboard natively
  copyTextToClipboard: (text: string) => ipcRenderer.send('copy-text-to-clipboard', text),

  // Open external URL natively
  openExternalUrl: (url: string): Promise<boolean> => ipcRenderer.invoke('open-external-url', url),

  // Download file natively
  downloadFile: (url: string, fileName?: string): Promise<boolean> =>
    ipcRenderer.invoke('download-file', { url, fileName }),

  // Fetch audio data natively (bypasses CORS)
  fetchAudioData: (url: string): Promise<Uint8Array> =>
    ipcRenderer.invoke('fetch-audio-data', url),

  // App lock tray integration
  setAppLockState: (state: { enabled: boolean; locked: boolean }) =>
    ipcRenderer.send('app-lock:state-changed', state),
  onTrayLockApp: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on('app-lock:lock', handler);
    return () => ipcRenderer.off('app-lock:lock', handler);
  },

  // Account switcher tray integration
  setTrayAccounts: (data: { accounts: { uid: string; name: string; email: string }[]; activeAccountUid: string | null }) =>
    ipcRenderer.send('tray:accounts-changed', data),
  onTraySwitchAccount: (cb: (uid: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, uid: string) => cb(uid);
    ipcRenderer.on('tray:switch-account', handler);
    return () => ipcRenderer.off('tray:switch-account', handler);
  },

  // Updater
  checkForUpdates: (): Promise<any> => ipcRenderer.invoke('updater:check-for-update'),
  startDownload: () => ipcRenderer.send('updater:start-download'),
  cancelDownload: () => ipcRenderer.send('updater:cancel-download'),
  quitAndInstall: () => ipcRenderer.send('updater:quit-and-install'),
  onUpdateStatus: (cb: (status: any) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, status: any) => cb(status);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.off('updater:status', handler);
  },

  // Shared authentication for multiple instances
  saveSharedAuth: (authData: any): Promise<boolean> => ipcRenderer.invoke('save-shared-auth', authData),
  loadSharedAuth: (): Promise<any> => ipcRenderer.invoke('load-shared-auth'),
  clearSharedAuth: (): Promise<boolean> => ipcRenderer.invoke('clear-shared-auth'),
  onSharedAuthUpdate: (cb: (authData: any) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, authData: any) => cb(authData);
    ipcRenderer.on('shared-auth-update', handler);
    return () => ipcRenderer.off('shared-auth-update', handler);
  },

  // Multi-account storage
  saveMultiAccounts: (accountsData: any): Promise<boolean> => ipcRenderer.invoke('save-multi-accounts', accountsData),
  loadMultiAccounts: (): Promise<any> => ipcRenderer.invoke('load-multi-accounts'),
  clearMultiAccounts: (): Promise<boolean> => ipcRenderer.invoke('clear-multi-accounts'),
  onMultiAccountUpdate: (cb: (accountsData: any) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, accountsData: any) => cb(accountsData);
    ipcRenderer.on('multi-account-update', handler);
    return () => ipcRenderer.off('multi-account-update', handler);
  },
});

// ─── TypeScript type declarations ─────────────────────────────────────────
export interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;   // dataURL
  appIconURL: string | null;
}

export interface CallWindowInitData {
  callId: string;
  callType: 'video' | 'voice';
  isOutgoing: boolean;
  targetUserId: string;
  targetName: string;
  targetAvatar?: string;
}

export interface IncomingCallData {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  callType: 'video' | 'voice';
}

export interface UpdateStatus {
  status: 'available' | 'no-update' | 'downloading' | 'downloaded' | 'error' | 'cancelled';
  info?: {
    version: string;
    url: string;
    name: string;
    size: number;
  };
  progress?: {
    percent: number;
    transferred: number;
    total: number;
    speed: number;
    eta: number;
  };
  message?: string;
}

export interface ElectronAPI {
  showNotification: (payload: { title: string; body: string; icon?: string; chatId?: string }) => void;
  onNotificationReply: (cb: (chatId: string, text: string) => void) => () => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  getAppVersion: () => Promise<string>;
  openChatWindow: (chatId: string) => void;
  platform: NodeJS.Platform;
  getDesktopSources: (opts?: {
    types?: Array<'screen' | 'window'>;
    thumbnailSize?: { width: number; height: number };
  }) => Promise<DesktopSource[]>;

  // Call window management
  openCallWindow: (data: CallWindowInitData) => void;
  closeCallWindow: () => void;
  openIncomingCallWindow: (data: IncomingCallData) => void;

  // Socket relay (main window ↔ call window)
  relayToCallWindow: (event: string, data: unknown) => void;
  onCallWindowSocketEmit: (cb: (event: string, data: unknown) => void) => () => void;
  onCallWindowEvent: (cb: (event: string, data: unknown) => void) => () => void;

  // Call window renderer
  requestCallWindowReady: () => void;
  onCallWindowInit: (cb: (data: CallWindowInitData) => void) => () => void;
  onRelayedSocketEvent: (cb: (event: string, data: unknown) => void) => () => void;
  emitSocketFromCallWindow: (event: string, data: unknown) => void;
  hangupCallWindow: () => void;
  sendWindowEvent: (event: string) => void;
  setCallMiniMode: (enabled: boolean) => void;
  onCallRequestCloseConfirmation: (cb: () => void) => () => void;

  // Incoming call (kept for backwards compat, no separate window)
  requestIncomingCallWindowReady?: () => void;
  onIncomingCallWindowInit?: (cb: (data: IncomingCallData) => void) => () => void;
  acceptIncomingCallFromWindow?: () => void;
  rejectIncomingCallFromWindow?: () => void;
  closeIncomingCallWindow?: () => void;
  onAuthExternalToken: (cb: (token: string) => void) => () => void;
  copyImageToClipboard: (url: string) => Promise<boolean>;
  copyTextToClipboard: (text: string) => void;
  openExternalUrl: (url: string) => Promise<boolean>;
  downloadFile: (url: string, fileName?: string) => Promise<boolean>;
  fetchAudioData: (url: string) => Promise<Uint8Array>;
  setAppLockState: (state: { enabled: boolean; locked: boolean }) => void;
  onTrayLockApp: (cb: () => void) => () => void;
  setTrayAccounts: (data: { accounts: { uid: string; name: string; email: string }[]; activeAccountUid: string | null }) => void;
  onTraySwitchAccount: (cb: (uid: string) => void) => () => void;

  // Updater
  checkForUpdates: () => Promise<any>;
  startDownload: () => void;
  cancelDownload: () => void;
  quitAndInstall: () => void;
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void;

  // Shared authentication for multiple instances
  saveSharedAuth: (authData: any) => Promise<boolean>;
  loadSharedAuth: () => Promise<any>;
  clearSharedAuth: () => Promise<boolean>;
  onSharedAuthUpdate: (cb: (authData: any) => void) => () => void;

  // Multi-account storage
  saveMultiAccounts: (accountsData: any) => Promise<boolean>;
  loadMultiAccounts: () => Promise<any>;
  clearMultiAccounts: () => Promise<boolean>;
  onMultiAccountUpdate: (cb: (accountsData: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

