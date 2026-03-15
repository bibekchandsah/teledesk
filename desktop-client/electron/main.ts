import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  nativeImage,
  net,
  shell,
  Menu,
  Tray,
  session,
  desktopCapturer,
  clipboard,
  screen,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';

// ─── Keep reference to prevent garbage collection ─────────────────────────
let mainWindow: BrowserWindow | null = null;
let callWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// App lock state (synced from renderer)
let appLockEnabled = false;
let appLocked = false;

// Reference to tray menu updater (set inside createTray)
let updateTrayMenuRef: (() => void) | null = null;

// Accounts state (synced from renderer)
interface TrayAccount {
  uid: string;
  name: string;
  email: string;
  activeAccountUid: string | null;
}
let trayAccounts: TrayAccount[] = [];
let trayActiveAccountUid: string | null = null;

// ─── Window state persistence ─────────────────────────────────────────────
const userDataPath = app.getPath('userData');
const windowStateFile = path.join(userDataPath, 'window-state.json');

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

const loadWindowState = (): WindowState => {
  try {
    if (fs.existsSync(windowStateFile)) {
      const data = fs.readFileSync(windowStateFile, 'utf8');
      const state = JSON.parse(data) as WindowState;
      
      // Validate that the window position is within screen bounds
      const displays = screen.getAllDisplays();
      const isWithinBounds = displays.some(display => {
        const { x, y, width, height } = display.bounds;
        return state.x !== undefined && state.y !== undefined &&
               state.x >= x && state.x < x + width &&
               state.y >= y && state.y < y + height;
      });
      
      if (!isWithinBounds) {
        // Window is off-screen, reset position
        delete state.x;
        delete state.y;
      }
      
      return state;
    }
  } catch (error) {
    console.error('Failed to load window state:', error);
  }
  
  // Default window state
  return {
    width: 1200,
    height: 780,
  };
};

const saveWindowState = () => {
  if (!mainWindow) return;
  
  try {
    const bounds = mainWindow.getBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: mainWindow.isMaximized(),
    };
    
    fs.writeFileSync(windowStateFile, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Failed to save window state:', error);
  }
};

// ─── Call window relay buffering ──────────────────────────────────────────
let callWindowReady = false;
let pendingRelayEvents: Array<{ event: string; data: unknown }> = [];

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const VITE_DEV_SERVER_URL = 'http://localhost:5173';

// Required on Windows for Toast notifications
if (process.platform === 'win32') {
  app.setName('TeleDesk');
  app.setAppUserModelId('com.teledesk.app');
}

// ─── Deep Linking / Custom Protocol ────────────────────────────────────────
const PROTOCOL = 'teledesk';
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const handleDeepLink = (url: string) => {
  if (!url) return;
  console.log('[DeepLink] Received URL:', url);
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === `${PROTOCOL}:` && parsedUrl.hostname === 'auth') {
      const token = parsedUrl.searchParams.get('token');
      if (token && mainWindow) {
        mainWindow.webContents.send('auth:external-token', token);
        mainWindow.show();
        mainWindow.focus();
      }
    }
  } catch (e) {
    console.error('[DeepLink] Failed to parse URL:', e);
  }
};

// Handle deep links when app is already running
app.on('second-instance', (event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  // Windows/Linux: handle deep link from command line
  const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`));
  if (url) handleDeepLink(url);
});

// macOS: Handle deep link
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Register our AUMID in the Windows registry so notifications show
// the correct app name ("TeleDesk") and icon instead of the raw AUMID string.
const registerWindowsAUMID = () => {
  if (process.platform !== 'win32') return;
  try {
    const aumid = 'com.teledesk.app';
    const iconPath = path.join(__dirname, '../assets/icon.png');
    const regKey = `HKCU\\Software\\Classes\\AppUserModelId\\${aumid}`;
    execFileSync('reg', ['add', regKey, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'TeleDesk', '/f'], { stdio: 'ignore' });
    execFileSync('reg', ['add', regKey, '/v', 'IconUri',     '/t', 'REG_SZ', '/d', iconPath,   '/f'], { stdio: 'ignore' });
  } catch (e) {
    console.error('[AUMID] Registry registration failed:', e);
  }
};

// ─── Create Main Window ────────────────────────────────────────────────────
const createWindow = () => {
  const windowState = loadWindowState();
  
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 425,
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

  // Restore maximized state
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Save window state on resize, move, maximize, unmaximize
  const saveStateDebounced = (() => {
    let timeout: NodeJS.Timeout | null = null;
    return () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => saveWindowState(), 500);
    };
  })();

  mainWindow.on('resize', saveStateDebounced);
  mainWindow.on('move', saveStateDebounced);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);

  // Save state and hide window on close (instead of quitting)
  mainWindow.on('close', (event) => {
    saveWindowState();
    
    // Prevent the window from closing
    event.preventDefault();
    
    // Hide the window instead
    mainWindow?.hide();
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

  // Register zoom keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!mainWindow) return;

    const isCtrlOrCmd = input.control || input.meta;

    // Zoom In: Ctrl/Cmd + Plus or Ctrl/Cmd + =
    if (isCtrlOrCmd && (input.key === '+' || input.key === '=')) {
      event.preventDefault();
      const currentZoom = mainWindow.webContents.getZoomLevel();
      mainWindow.webContents.setZoomLevel(currentZoom + 0.5);
    }

    // Zoom Out: Ctrl/Cmd + Minus
    if (isCtrlOrCmd && input.key === '-') {
      event.preventDefault();
      const currentZoom = mainWindow.webContents.getZoomLevel();
      mainWindow.webContents.setZoomLevel(currentZoom - 0.5);
    }

    // Reset Zoom: Ctrl/Cmd + 0
    if (isCtrlOrCmd && input.key === '0') {
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(0);
    }
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
      url.includes('github.com/login') ||
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
            sandbox: false, // Disable sandbox for auth to work properly
            webSecurity: false, // Disable web security to bypass CORS
            partition: 'persist:auth', // Use a separate session for auth
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

  const updateTrayMenu = () => {
    // Check if tray still exists before updating
    if (!tray || tray.isDestroyed()) return;

    const isAutoStartEnabled = app.getLoginItemSettings().openAtLogin;
    const isWindowVisible = mainWindow?.isVisible() ?? false;

    const menuItems: Electron.MenuItemConstructorOptions[] = [
      {
        label: isWindowVisible ? 'Hide Window' : 'Show Window',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isVisible()) {
              mainWindow.hide();
            } else {
              mainWindow.show();
              mainWindow.focus();
            }
            updateTrayMenu();
          }
        },
      },
      { type: 'separator' },
    ];

    // Account switcher submenu — only shown when multiple accounts exist
    if (trayAccounts.length > 1) {
      const accountSubmenu: Electron.MenuItemConstructorOptions[] = trayAccounts.map((account) => ({
        label: `${account.uid === trayActiveAccountUid ? '✓ ' : '    '}${account.name} (${account.email})`,
        enabled: account.uid !== trayActiveAccountUid,
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
          mainWindow?.webContents.send('tray:switch-account', account.uid);
        },
      }));

      menuItems.push({
        label: 'Switch Account',
        submenu: accountSubmenu,
      });
      menuItems.push({ type: 'separator' });
    }

    // App lock item — only shown when app lock is enabled
    if (appLockEnabled) {
      menuItems.push({
        label: appLocked ? '🔓 Unlock App' : '🔒 Lock App',
        click: () => {
          if (appLocked) {
            mainWindow?.show();
            mainWindow?.focus();
          } else {
            appLocked = true;
            mainWindow?.webContents.send('app-lock:lock');
            updateTrayMenu();
          }
        },
      });
      menuItems.push({ type: 'separator' });
    }

    menuItems.push(
      {
        label: 'Start on System Startup',
        type: 'checkbox',
        checked: isAutoStartEnabled,
        click: () => {
          const currentSetting = app.getLoginItemSettings().openAtLogin;
          app.setLoginItemSettings({
            openAtLogin: !currentSetting,
            openAsHidden: false,
          });
          updateTrayMenu();
        },
      },
      { type: 'separator' },
      {
        label: 'Restart',
        click: () => {
          if (tray && !tray.isDestroyed()) {
            tray.destroy();
            tray = null;
          }
          app.relaunch();
          app.quit();
        },
      },
      {
        label: 'Quit',
        click: () => {
          if (tray && !tray.isDestroyed()) {
            tray.destroy();
            tray = null;
          }
          app.quit();
        },
      },
    );

    const contextMenu = Menu.buildFromTemplate(menuItems);

    tray?.setContextMenu(contextMenu);
  };

  updateTrayMenu();
  tray.setToolTip('TeleDesk');
  
  // Expose updater so IPC handler can call it
  updateTrayMenuRef = updateTrayMenu;
  
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
    updateTrayMenu();
  });

  // Update menu when window visibility changes
  if (mainWindow) {
    mainWindow.on('show', updateTrayMenu);
    mainWindow.on('hide', updateTrayMenu);
  }
};

// ─── IPC Handlers ─────────────────────────────────────────────────────────

// Desktop Notifications
ipcMain.on(
  'show-notification',
  async (_event, payload: { title: string; body: string; icon?: string; chatId?: string }) => {
    if (!Notification.isSupported()) return;

    // Fetch icon with a timeout so a slow/failed fetch never blocks the notification
    const iconImage = await fetchAvatarAsNativeImage(payload.icon);

    const showBasic = () => {
      try {
        const n = new Notification({
          title: payload.title,
          body: payload.body,
          silent: false,
          ...(iconImage ? { icon: iconImage } : {}),
        });
        n.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
        n.show();
      } catch (e) {
        console.error('[Notification] Failed to show:', e);
      }
    };

    try {
      if (process.platform === 'darwin' && payload.chatId) {
        // macOS: native inline reply
        const notification = new Notification({
          title: payload.title,
          body: payload.body,
          silent: false,
          hasReply: true,
          replyPlaceholder: 'Reply...',
          ...(iconImage ? { icon: iconImage } : {}),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (notification as any).on('reply', (_e: unknown, reply: string) => {
          if (reply.trim() && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('notification:reply', payload.chatId, reply.trim());
          }
        });
        notification.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
        notification.show();
      } else {
        // Windows / Linux: standard notification with avatar as icon
        // (toastXml requires the AUMID to be registered in the Windows registry,
        //  which only happens in packaged builds — use regular Notification in dev)
        showBasic();
      }
    } catch (e) {
      console.error('[Notification] Platform notification failed, falling back:', e);
      showBasic();
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

// App lock state sync from renderer
ipcMain.on('app-lock:state-changed', (_e, state: { enabled: boolean; locked: boolean }) => {
  appLockEnabled = state.enabled;
  appLocked = state.locked;
  // Rebuild tray menu to show/hide lock option
  if (tray && !tray.isDestroyed()) {
    // updateTrayMenu is defined inside createTray, so we call it via a module-level ref
    updateTrayMenuRef?.();
  }
});

// Accounts state sync from renderer
ipcMain.on('tray:accounts-changed', (_e, data: { accounts: TrayAccount[]; activeAccountUid: string | null }) => {
  trayAccounts = data.accounts;
  trayActiveAccountUid = data.activeAccountUid;
  updateTrayMenuRef?.();
});

// Get app version
ipcMain.handle('get-app-version', () => app.getVersion());

// Copy text to clipboard natively
ipcMain.on('copy-text-to-clipboard', (_e, text: string) => {
  if (text) clipboard.writeText(text);
});

// Copy image to clipboard natively (bypasses CORS)
ipcMain.handle('copy-image-to-clipboard', async (_event, url: string) => {
  if (!url || !url.startsWith('http')) return false;
  try {
    const res = await net.fetch(url);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return false;
    clipboard.writeImage(img);
    return true;
  } catch (err) {
    console.error('[IPC] Failed to copy image to clipboard:', err);
    return false;
  }
});

// Download file natively
ipcMain.handle('download-file', async (_event, { url, fileName }: { url: string; fileName?: string }) => {
  if (!url || !url.startsWith('http')) return false;
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (!win) return false;
    // This triggers the Electron download manager
    win.webContents.downloadURL(url);
    return true;
  } catch (err) {
    console.error('[IPC] Failed to start download:', err);
    return false;
  }
});

// Open external URL natively
ipcMain.handle('open-external-url', async (_e, url: string) => {
  console.log('[IPC] Opening external URL:', url);
  if (url && url.startsWith('http')) {
    try {
      await shell.openExternal(url);
      return true;
    } catch (err) {
      console.error('[IPC] Failed to open external URL:', err);
      return false;
    }
  }
  return false;
});

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

// ─── Avatar fetch helper ─────────────────────────────────────────────────
const fetchAvatarAsNativeImage = async (url?: string): Promise<import('electron').NativeImage | null> => {
  if (!url || !url.startsWith('http')) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await net.fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const img = nativeImage.createFromBuffer(buf);
    return img.isEmpty() ? null : img;
  } catch {
    return null;
  }
};

// ─── Call Window ──────────────────────────────────────────────────────────
interface CallInitData {
  callId: string;
  callType: 'video' | 'voice';
  isOutgoing: boolean;
  targetUserId: string;
  targetName?: string;
  targetAvatar?: string;
}

const createCallWindow = (initData: CallInitData) => {
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.focus();
    return;
  }
  pendingRelayEvents = [];

  const encoded = encodeURIComponent(JSON.stringify(initData));

  const peerName = initData.targetName || 'Call';
  const callLabel = initData.callType === 'video' ? 'Video Call' : 'Voice Call';

  callWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 640,
    minHeight: 480,
    title: `${peerName} – ${callLabel}`,
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

  // Prevent the loaded HTML page's <title> from overriding the window title
  callWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  callWindow.once('ready-to-show', () => {
    callWindow?.show();
    callWindow?.focus();
  });

  // Set peer avatar as window icon asynchronously
  if (initData.targetAvatar) {
    const winRef = callWindow;
    fetchAvatarAsNativeImage(initData.targetAvatar).then((img) => {
      if (img && winRef && !winRef.isDestroyed()) {
        try { winRef.setIcon(img); } catch { /* unsupported on some platforms */ }
      }
    });
  }

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
ipcMain.on('call:open-window', (_e, initData: CallInitData) => {
  createCallWindow(initData);
});

// Incoming call — open directly as the merged call window (isOutgoing: false)
ipcMain.on('incoming-call:open-window', (_e, initData: CallInitData) => {
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
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
  registerWindowsAUMID();

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

  // Fetch audio data natively (bypasses CORS)
  ipcMain.handle('fetch-audio-data', async (_event, url: string) => {
    if (!url || !url.startsWith('http')) throw new Error('Invalid URL');
    try {
      const res = await net.fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    } catch (err) {
      console.error('[IPC] Failed to fetch audio data:', err);
      throw err;
    }
  });

  // Allow getUserMedia / enumerateDevices unconditionally in the renderer
  session.defaultSession.setDevicePermissionHandler(() => true);

  // Configure session for Firebase OAuth - remove CORS headers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    
    // Remove restrictive COOP/COEP headers that block OAuth popups
    delete responseHeaders['cross-origin-opener-policy'];
    delete responseHeaders['cross-origin-embedder-policy'];
    
    callback({ responseHeaders });
  });

  // Also configure the auth partition session
  const authSession = session.fromPartition('persist:auth');
  authSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    
    // Remove restrictive COOP/COEP headers
    delete responseHeaders['cross-origin-opener-policy'];
    delete responseHeaders['cross-origin-embedder-policy'];
    
    callback({ responseHeaders });
  });

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
  // Only destroy tray if it hasn't been destroyed already
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
});
}
