/// <reference types="vite/client" />

interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  appIconURL: string | null;
}

interface CallWindowInitData {
  callId: string;
  callType: 'video' | 'voice';
  isOutgoing: boolean;
  targetUserId: string;
  targetName: string;
  targetAvatar?: string;
  startTime?: number;
  isContinuing?: boolean;
}

interface IncomingCallData {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  callType: 'video' | 'voice';
}

interface UpdateStatus {
  status: 'available' | 'no-update' | 'downloading' | 'downloaded' | 'error' | 'cancelled';
  info?: { version: string; url: string; name: string; size: number };
  progress?: { percent: number; transferred: number; total: number; speed: number; eta: number };
  message?: string;
}

interface ElectronAPI {
  showNotification: (payload: { title: string; body: string; icon?: string; chatId?: string }) => void;
  onNotificationReply: (cb: (chatId: string, text: string) => void) => () => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  getAppVersion: () => Promise<string>;
  openChatWindow: (chatId: string) => void;
  platform: NodeJS.Platform;
  getDesktopSources: (opts?: { types?: Array<'screen' | 'window'>; thumbnailSize?: { width: number; height: number } }) => Promise<DesktopSource[]>;
  openCallWindow: (data: CallWindowInitData) => void;
  closeCallWindow: () => void;
  openIncomingCallWindow: (data: IncomingCallData) => void;
  relayToCallWindow: (event: string, data: unknown) => void;
  onCallWindowSocketEmit: (cb: (event: string, data: unknown) => void) => () => void;
  onCallWindowEvent: (cb: (event: string, data: unknown) => void) => () => void;
  requestCallWindowReady: () => void;
  onCallWindowInit: (cb: (data: CallWindowInitData) => void) => () => void;
  onRelayedSocketEvent: (cb: (event: string, data: unknown) => void) => () => void;
  emitSocketFromCallWindow: (event: string, data: unknown) => void;
  hangupCallWindow: () => void;
  sendWindowEvent: (event: string) => void;
  setCallMiniMode: (enabled: boolean) => void;
  minimizeCallWindow: () => void;
  maximizeCallWindow: () => void;
  onCallWindowMaximized: (cb: () => void) => () => void;
  onCallWindowUnmaximized: (cb: () => void) => () => void;
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
  checkForUpdates: () => Promise<any>;
  startDownload: () => void;
  cancelDownload: () => void;
  quitAndInstall: () => void;
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void;
  saveSharedAuth: (authData: any) => Promise<boolean>;
  loadSharedAuth: () => Promise<any>;
  clearSharedAuth: () => Promise<boolean>;
  onSharedAuthUpdate: (cb: (authData: any) => void) => () => void;
  saveMultiAccounts: (accountsData: any) => Promise<boolean>;
  loadMultiAccounts: () => Promise<any>;
  clearMultiAccounts: () => Promise<boolean>;
  onMultiAccountUpdate: (cb: (accountsData: any) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
