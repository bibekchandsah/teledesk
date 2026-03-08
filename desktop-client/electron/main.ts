import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  nativeImage,
  shell,
  Menu,
  Tray,
  session,
  desktopCapturer,
} from 'electron';
import path from 'path';

// ─── Keep reference to prevent garbage collection ─────────────────────────
let mainWindow: BrowserWindow | null = null;
let callWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// ─── Call window relay buffering ──────────────────────────────────────────
let callWindowReady = false;
let pendingRelayEvents: Array<{ event: string; data: unknown }> = [];

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const VITE_DEV_SERVER_URL = 'http://localhost:5173';

// ─── Create Main Window ────────────────────────────────────────────────────
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: 'TeleDesk',
    backgroundColor: '#1a1a2e',
    show: false, // Show after ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(isDev ? VITE_DEV_SERVER_URL : 'file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Allow Firebase/Google auth popups; open everything else externally
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isAuthUrl =
      url.includes('accounts.google.com') ||
      url.includes('firebaseapp.com/__/auth') ||
      url.includes('googleapis.com');

    if (isAuthUrl) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 650,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }

    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// ─── System Tray ──────────────────────────────────────────────────────────
const createTray = () => {
  const iconPath = path.join(__dirname, '../assets/icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open TeleDesk',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('TeleDesk');
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
};

// ─── IPC Handlers ─────────────────────────────────────────────────────────

// Desktop Notifications
ipcMain.on(
  'show-notification',
  (_event, payload: { title: string; body: string; icon?: string }) => {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: payload.title,
        body: payload.body,
        silent: false,
      });
      notification.on('click', () => {
        mainWindow?.show();
        mainWindow?.focus();
      });
      notification.show();
    }
  },
);

// Window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.restore();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow?.hide());

// Get app version
ipcMain.handle('get-app-version', () => app.getVersion());

// Desktop screen/window sources for screen share
ipcMain.handle(
  'get-desktop-sources',
  async (_event, opts: { types: Array<'screen' | 'window'>; thumbnailSize?: { width: number; height: number } }) => {
    const sources = await desktopCapturer.getSources({
      types: opts.types ?? ['screen', 'window'],
      thumbnailSize: opts.thumbnailSize ?? { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIconURL: s.appIcon ? s.appIcon.toDataURL() : null,
    }));
  },
);

// Open a chat in a new window
ipcMain.on('open-chat-window', (_event, chatId: string) => {
  const win = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 600,
    minHeight: 500,
    title: 'TeleDesk',
    backgroundColor: '#1a1a2e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  if (isDev) {
    win.loadURL(`${VITE_DEV_SERVER_URL}/popup/${chatId}`);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: `/popup/${chatId}` });
  }

  win.once('ready-to-show', () => win.show());

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(isDev ? VITE_DEV_SERVER_URL : 'file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});

// ─── Call Window ──────────────────────────────────────────────────────────
const createCallWindow = (initData: object) => {
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.focus();
    return;
  }
  pendingRelayEvents = [];

  const encoded = encodeURIComponent(JSON.stringify(initData));

  callWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 640,
    minHeight: 480,
    title: 'TeleDesk – Call',
    backgroundColor: '#0f172a',
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  callWindowReady = false;

  if (isDev) {
    callWindow.loadURL(`${VITE_DEV_SERVER_URL}/call-window?d=${encoded}`);
  } else {
    callWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/call-window', query: { d: JSON.stringify(initData) } });
  }

  callWindow.once('ready-to-show', () => {
    callWindow?.show();
    callWindow?.focus();
  });

  callWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(isDev ? VITE_DEV_SERVER_URL : 'file://')) {
      event.preventDefault();
    }
  });

  callWindow.on('closed', () => {
    mainWindow?.webContents.send('call:window-event', 'closed', {});
    callWindow = null;
    callWindowReady = false;
    pendingRelayEvents = [];
  });
};

// ─── Call IPC Handlers ─────────────────────────────────────────────────────

// Main window asks to open call window
ipcMain.on('call:open-window', (_e, initData: object) => {
  createCallWindow(initData);
});

// Incoming call — open directly as the merged call window (isOutgoing: false)
ipcMain.on('incoming-call:open-window', (_e, initData: object) => {
  createCallWindow(initData);
});

// Call window sends a custom event to the main window (e.g. incoming-accepted, incoming-rejected)
ipcMain.on('call:send-window-event', (_e, event: string) => {
  mainWindow?.webContents.send('call:window-event', event, {});
});

// Call window renderer is mounted and ready — flush buffered relay events
ipcMain.on('call:window-ready', (event) => {
  if (callWindow && !callWindow.isDestroyed() && event.sender === callWindow.webContents) {
    callWindowReady = true;
    // No longer send init-data (it's in URL params) — only flush buffered relay events
    pendingRelayEvents.forEach(({ event: e, data: d }) => {
      callWindow?.webContents.send('call:socket-event', e, d);
    });
    pendingRelayEvents = [];
  }
});

// Main window relays a socket event to the call window
ipcMain.on('call:relay-to-window', (_e, event: string, data: unknown) => {
  if (callWindowReady && callWindow && !callWindow.isDestroyed()) {
    callWindow.webContents.send('call:socket-event', event, data);
  } else if (callWindow && !callWindow.isDestroyed()) {
    pendingRelayEvents.push({ event, data });
  }
});

// Call window sends a socket emit request → relay to main window renderer
ipcMain.on('call:socket-emit', (_e, event: string, data: unknown) => {
  mainWindow?.webContents.send('call:window-socket-emit', event, data);
});

// Call window signals hangup (user clicked end call or remote ended)
ipcMain.on('call:hangup-from-window', () => {
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.close();
  }
  callWindow = null;
  callWindowReady = false;
  pendingRelayEvents = [];
  mainWindow?.webContents.send('call:window-event', 'hangup', {});
});

// Main window forces call window closed silently (no hangup notification back)
ipcMain.on('call:force-close', () => {
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.close();
  }
  callWindow = null;
  callWindowReady = false;
  pendingRelayEvents = [];
});



// ─── App Lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Grant camera & microphone permissions for the renderer
  const allowedPermissions = [
    'media', 'mediaKeySystem', 'camera', 'microphone',
    'display-capture', 'audiocapture', 'audioCapture',
    'videocapture', 'videoCapture', 'mediaDevices',
  ];
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.includes(permission);
  });

  // Allow getUserMedia / enumerateDevices unconditionally in the renderer
  session.defaultSession.setDevicePermissionHandler(() => true);

  createWindow();

  // Create tray (graceful - don't crash if icon missing in dev)
  try {
    createTray();
  } catch {
    // tray icon optional in dev
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  tray?.destroy();
});
