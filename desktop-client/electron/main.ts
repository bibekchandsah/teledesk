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
} from 'electron';
import path from 'path';

// ─── Keep reference to prevent garbage collection ─────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

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

// ─── App Lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Grant camera & microphone permissions for the renderer
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'camera', 'microphone', 'display-capture'];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'mediaKeySystem', 'camera', 'microphone', 'display-capture'];
    return allowed.includes(permission);
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
  tray?.destroy();
});
