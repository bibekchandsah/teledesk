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
  protocol,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { execFileSync, spawn } from 'child_process';
import http from 'http';

// --------- Local OAuth Callback Server (Fallback for dev mode) --------------------------------
let oauthCallbackServer: http.Server | null = null;
const OAUTH_CALLBACK_PORT = 48292; // Random high port

const startOAuthCallbackServer = () => {
  if (oauthCallbackServer) return;
  
  oauthCallbackServer = http.createServer((req, res) => {
    const url = new URL(req.url || '', `http://localhost:${OAUTH_CALLBACK_PORT}`);
    
    if (url.pathname === '/auth/callback') {
      const token = url.searchParams.get('token');
      
      if (token) {
        console.log('[OAuth Server] Received token via HTTP callback');
        
        // Send token to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auth:external-token', token);
          mainWindow.show();
          mainWindow.focus();
        }
        
        // Send success response
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head>
              <title>Authentication Successful</title>
              <style>
                body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #1a1a2e; color: white; }
                .container { text-align: center; }
              </style>
            </head>
            <body>
              <div class="container">
                <h2>✓ Authentication Successful!</h2>
                <p>You can close this tab and return to TeleDesk.</p>
              </div>
              <script>
                setTimeout(() => { window.close(); }, 2000);
              </script>
            </body>
          </html>
        `);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('No token provided');
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });
  
  oauthCallbackServer.listen(OAUTH_CALLBACK_PORT, 'localhost', () => {
    console.log(`[OAuth Server] Listening on http://localhost:${OAUTH_CALLBACK_PORT}/auth/callback`);
  });
  
  oauthCallbackServer.on('error', (err) => {
    console.error('[OAuth Server] Error:', err);
  });
};

const stopOAuthCallbackServer = () => {
  if (oauthCallbackServer) {
    oauthCallbackServer.close();
    oauthCallbackServer = null;
    console.log('[OAuth Server] Stopped');
  }
};

// --------- Keep reference to prevent garbage collection ---------------------------------------------------------------------------
let mainWindow: BrowserWindow | null = null;
let callWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// --------- Load Environment Variables ------------------------------------------------------------------------------------------------------------------------------
const loadEnv = () => {
  try {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    
    // Determine which env file to load based on environment
    const envFileName = isDev ? '.env.development' : '.env.production';
    
    const possiblePaths = [
      path.join(process.cwd(), envFileName),
      path.join(path.dirname(process.execPath), envFileName),
      path.join(app.getAppPath(), envFileName),
      // Also try .env.local as override (highest priority)
      path.join(process.cwd(), '.env.local'),
      path.join(path.dirname(process.execPath), '.env.local'),
      path.join(app.getAppPath(), '.env.local'),
      // Fallback to .env
      path.join(process.cwd(), '.env'),
      path.join(path.dirname(process.execPath), '.env'),
      path.join(app.getAppPath(), '.env'),
    ];

    for (const envPath of possiblePaths) {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [key, ...valueParts] = trimmed.split('=');
            const value = valueParts.join('=').trim();
            const cleanValue = value.replace(/^["']|["']$/g, '');
            // Don't override if already set (allows .env.local to override)
            if (key.trim() && !(key.trim() in process.env)) {
              process.env[key.trim()] = cleanValue;
            }
          }
        });
        console.log('[Main] Loaded .env from:', envPath);
      }
    }
  } catch (e) {
    console.error('[Main] Failed to load .env:', e);
  }
};
loadEnv();

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

// --------- Update Management State ------------------------------------------------------------------------------------------------------------------------------------------
interface UpdateInfo {
  version: string;
  url: string;
  name: string;
  size: number;
}

let updateInfo: UpdateInfo | null = null;
let downloadRequest: Electron.ClientRequest | null = null;
let downloadFilePath: string | null = null;
let isDownloading = false;
let downloadProgress = {
  percent: 0,
  transferred: 0,
  total: 0,
  speed: 0,
  eta: 0,
};

const normalizeVersionParts = (version: string): number[] => {
  const base = version.replace(/^v/i, '').split('-')[0];
  return base.split('.').map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
};

const isServerVersionNewer = (latestVersion: string, currentVersion: string): boolean => {
  const latest = normalizeVersionParts(latestVersion);
  const current = normalizeVersionParts(currentVersion);
  const maxLen = Math.max(latest.length, current.length);

  for (let i = 0; i < maxLen; i++) {
    const l = latest[i] ?? 0;
    const c = current[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }

  return false;
};

const getInstalledExecutablePath = () => {
  // electron-builder portable exposes the launcher path via this env var.
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
  if (portableExe && portableExe.trim()) {
    return portableExe;
  }

  return process.execPath;
};

const getExpectedUpdateFilePath = () => {
  const exePath = getInstalledExecutablePath();
  const exeDir = path.dirname(exePath);
  const exeName = path.basename(exePath);
  return path.join(exeDir, `${exeName}.new`);
};

// --------- Window state persistence ---------------------------------------------------------------------------------------------------------------------------------------
// Set up userData paths for multiple instances
// - Shared data (auth, settings): baseUserData/shared/
// - Instance data (cache, temp): baseUserData/instances/{instanceId}/
const instanceId = Date.now().toString(36) + Math.random().toString(36).substring(2);
const baseUserData = app.getPath('userData');
const sharedUserData = path.join(baseUserData, 'shared');
const instanceUserData = path.join(baseUserData, 'instances', instanceId);

// Create directories if they don't exist
if (!fs.existsSync(sharedUserData)) {
  fs.mkdirSync(sharedUserData, { recursive: true });
}
if (!fs.existsSync(instanceUserData)) {
  fs.mkdirSync(instanceUserData, { recursive: true });
}

// Set instance-specific userData for cache/temp files
app.setPath('userData', instanceUserData);

// But use shared directory for persistent data like window state
const userDataPath = sharedUserData;
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

// --------- Call window relay buffering ------------------------------------------------------------------------------------------------------------------------------
let callWindowReady = false;
let pendingRelayEvents: Array<{ event: string; data: unknown }> = [];

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const VITE_DEV_SERVER_URL = 'http://localhost:5173';

// Load .env file manually  Vite-prefixed vars are renderer-only and never reach the main process
const loadEnvFile = () => {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const envFileName = isDev ? '.env.development' : '.env.production';
  
  // In dev: .env is in desktop-client/.env
  // __dirname in compiled code is: desktop-client/dist-electron
  // So we need to go up one level: ../
  const envPaths = isDev 
    ? [
        path.join(__dirname, `../${envFileName}`),  // .env.development
        path.join(__dirname, '../.env.local'),       // .env.local override
        path.join(__dirname, '../.env'),             // fallback
      ]
    : [
        path.join(app.getAppPath(), envFileName),    // .env.production
        path.join(app.getAppPath(), '.env.local'),   // .env.local override
        path.join(app.getAppPath(), '.env'),         // fallback
      ];
  
  try {
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx === -1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          // Remove quotes if present
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          // Don't override if already set
          if (key && !(key in process.env)) {
            process.env[key] = val;
          }
        }
        console.log('[Env] Loaded from:', envPath);
      }
    }
    console.log('[Env] ALLOW_DEVTOOLS =', JSON.stringify(process.env.ALLOW_DEVTOOLS));
  } catch (err) {
    console.error('[Env] Failed to load:', err);
  }
};
loadEnvFile();


// ALLOW_DEVTOOLS=true in .env enables DevTools and right-click (for development)
const allowDevTools = process.env.ALLOW_DEVTOOLS === 'true';
console.log('[Main] allowDevTools =', allowDevTools, '(raw value:', JSON.stringify(process.env.ALLOW_DEVTOOLS), ')');

// Required on Windows for Toast notifications
if (process.platform === 'win32') {
  app.setName('TeleDesk');
  app.setAppUserModelId('com.teledesk.app');
}

// --------- Deep Linking / Custom Protocol ------------------------------------------------------------------------------------------------------------------------
const PROTOCOL = 'teledesk';
console.log('[Main] Registering protocol:', PROTOCOL);
console.log('[Main] Process defaultApp:', process.defaultApp);
console.log('[Main] Process argv:', process.argv);

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    const result = app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    console.log('[Main] Protocol registered (dev mode) with execPath:', process.execPath);
    console.log('[Main] Protocol registration result:', result);
  }
} else {
  const result = app.setAsDefaultProtocolClient(PROTOCOL);
  console.log('[Main] Protocol registered (production mode)');
  console.log('[Main] Protocol registration result:', result);
}

// Check if protocol is registered
const isDefaultProtocol = app.isDefaultProtocolClient(PROTOCOL);
console.log('[Main] Is default protocol client for', PROTOCOL + ':', isDefaultProtocol);

if (!isDefaultProtocol) {
  console.warn('[Main] WARNING: Protocol not registered! Deep links will not work.');
  console.warn('[Main] In dev mode, you may need to run the built .exe once to register the protocol.');
}

const handleDeepLink = (url: string) => {
  if (!url) return;
  console.log('[DeepLink] Received URL:', url);
  try {
    const parsedUrl = new URL(url);
    console.log('[DeepLink] Protocol:', parsedUrl.protocol);
    console.log('[DeepLink] Hostname:', parsedUrl.hostname);
    
    if (parsedUrl.protocol === `${PROTOCOL}:` && parsedUrl.hostname === 'auth') {
      const token = parsedUrl.searchParams.get('token');
      console.log('[DeepLink] Token found:', token ? `yes (${token.length} chars)` : 'no');
      
      if (token && mainWindow) {
        console.log('[DeepLink] Sending token to renderer via IPC');
        mainWindow.webContents.send('auth:external-token', token);
        mainWindow.show();
        mainWindow.focus();
        console.log('[DeepLink] Token sent successfully, window shown and focused');
      } else {
        console.warn('[DeepLink] Missing token or mainWindow:', { hasToken: !!token, hasMainWindow: !!mainWindow });
      }
    } else {
      console.log('[DeepLink] URL does not match auth protocol');
    }
  } catch (e) {
    console.error('[DeepLink] Failed to parse URL:', e);
  }
};

// Deep link handling strategy:
// - We DON'T use single instance lock (to allow multiple windows for multi-account)
// - Instead, when a deep link starts a new instance, we immediately try to send
//   the token to an existing instance and quit before creating any windows
// - This allows both OAuth to work smoothly AND multiple manual instances

// Check if this instance was started by a deep link
const deepLinkUrl = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));

if (deepLinkUrl) {
  console.log('[DeepLink] This instance was started by a deep link:', deepLinkUrl);
  
  // Extract token from URL
  try {
    const url = new URL(deepLinkUrl);
    const token = url.searchParams.get('token');
    
    if (token) {
      console.log('[DeepLink] Extracted token, attempting to send to existing instance...');
      
      // Try to send to existing instance's OAuth server
      // We need to do this BEFORE app.whenReady() to prevent window creation
      const http = require('http');
      
      const sendToExisting = () => {
        return new Promise((resolve) => {
          const req = http.get(`http://localhost:48292/auth/callback?token=${token}`, (res: any) => {
            console.log('[DeepLink] Successfully sent token to existing instance (status:', res.statusCode, ')');
            if (res.statusCode === 200) {
              resolve(true);
            } else {
              resolve(false);
            }
          });
          
          req.on('error', (err: any) => {
            console.log('[DeepLink] No existing instance found:', err.message);
            resolve(false);
          });
          
          req.setTimeout(1000, () => {
            req.destroy();
            console.log('[DeepLink] Connection timeout, no existing instance');
            resolve(false);
          });
        });
      };
      
      // Wait for the connection attempt
      sendToExisting().then((sent) => {
        if (sent) {
          console.log('[DeepLink] Token sent successfully, quitting this instance');
          app.quit();
        } else {
          console.log('[DeepLink] Will process token in this instance');
        }
      });
    }
  } catch (error) {
    console.error('[DeepLink] Failed to parse deep link URL:', error);
  }
}

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

// --------- Create Main Window ------------------------------------------------------------------------------------------------------------------------------------------------------------
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
    autoHideMenuBar: true, // remove native menu bar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      // Remove partition to use default session for Firebase auth persistence
      // partition: 'persist:shared', 
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
    if (isQuitting) {
      mainWindow = null;
    } else {
      saveWindowState();
      // Prevent the window from closing
      event.preventDefault();
      // Hide the window instead
      mainWindow?.hide();
    }
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    if (allowDevTools) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Disable right-click context menu unless devtools are allowed
  if (!allowDevTools) {
    mainWindow.webContents.on('context-menu', (e) => {
      e.preventDefault();
    });
    // Force-close devtools if opened any other way (e.g. programmatically)
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });
  }

  // Single before-input-event handler: blocks devtools shortcuts + handles zoom
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!mainWindow) return;
    const isCtrlOrCmd = input.control || input.meta;

    // Block devtools shortcuts when not allowed
    if (!allowDevTools) {
      const isF12 = input.key === 'F12';
      const isDevToolsShortcut =
        isCtrlOrCmd && input.shift &&
        ['i', 'I', 'j', 'J', 'c', 'C'].includes(input.key);
      if (isF12 || isDevToolsShortcut) {
        event.preventDefault();
        return;
      }
    }

    // Hard reload: Ctrl+Shift+R or Ctrl+F5
    if (isCtrlOrCmd && input.shift && (input.key === 'r' || input.key === 'R')) {
      event.preventDefault();
      if (isDev) {
        mainWindow.loadURL(VITE_DEV_SERVER_URL);
      } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
      }
      return;
    }
    // Soft reload: Ctrl+R or F5
    if ((isCtrlOrCmd && (input.key === 'r' || input.key === 'R')) || input.key === 'F5') {
      event.preventDefault();
      if (isDev) {
        mainWindow.loadURL(VITE_DEV_SERVER_URL);
      } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
      }
      return;
    }

    // Zoom In: Ctrl/Cmd + Plus or =
    if (isCtrlOrCmd && (input.key === '+' || input.key === '=')) {
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5);
    }
    // Zoom Out: Ctrl/Cmd + Minus
    if (isCtrlOrCmd && input.key === '-') {
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5);
    }
    // Reset Zoom: Ctrl/Cmd + 0
    if (isCtrlOrCmd && input.key === '0') {
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(0);
    }
  });

  // Show window when ready
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // If the page fails to load (e.g. wrong path in packaged build), retry once
  // Only handle main-frame navigation failures, not sub-resource errors
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return; // ignore sub-resource failures (fetch, XHR, etc.)
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // -3 = aborted (user navigated away), -105 = name not resolved (offline) — don't retry these
    if (errorCode === -3 || errorCode === -105) return;
    console.error('[Main] Main frame failed to load:', errorCode, errorDescription, validatedURL);
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (isDev) {
        mainWindow.loadURL(VITE_DEV_SERVER_URL);
      } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
      }
    }, 1000);
  });

  // Recover from renderer crashes — reload instead of showing blank screen
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    // 'clean-exit' means intentional exit (e.g. window.close()), don't reload
    if (details.reason === 'clean-exit') return;
    console.error('[Main] Renderer process gone:', details.reason);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (isDev) {
        mainWindow.loadURL(VITE_DEV_SERVER_URL);
      } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
      }
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

// --------- System Tray ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const createTray = () => {
  // In packaged app, assets are in resources/assets/; in dev they're relative to dist-electron/
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icon.png')
    : path.join(__dirname, '../assets/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  // Resize to standard tray size (16x16 on Windows)
  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);

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

    // Account switcher submenu  only shown when multiple accounts exist
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

    // App lock item only shown when app lock is enabled
    if (appLockEnabled) {
      menuItems.push({
        label: appLocked ? '✓ Unlock App' : 'Lock App',
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
        label: 'Check for Updates',
        click: () => {
          checkForUpdates(true);
        },
      },
      { type: 'separator' },
      {
        label: 'Restart',
        click: () => {
          isQuitting = true;
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
          isQuitting = true;
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

// --------- IPC Handlers ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// Shared authentication storage for multiple instances
const sharedAuthFile = path.join(sharedUserData, 'shared-auth.json');
const multiAccountsFile = path.join(sharedUserData, 'multi-accounts.json');

// Save shared auth data (legacy - kept for backward compatibility)
ipcMain.handle('save-shared-auth', async (_event, authData) => {
  try {
    fs.writeFileSync(sharedAuthFile, JSON.stringify(authData, null, 2));
    // Notify all other instances about the auth update
    BrowserWindow.getAllWindows().forEach(window => {
      if (window && !window.isDestroyed() && window.webContents !== _event.sender) {
        window.webContents.send('shared-auth-update', authData);
      }
    });
    return true;
  } catch (error) {
    console.error('[IPC] Failed to save shared auth:', error);
    return false;
  }
});

// Load shared auth data (legacy - kept for backward compatibility)
ipcMain.handle('load-shared-auth', async () => {
  try {
    if (fs.existsSync(sharedAuthFile)) {
      const data = fs.readFileSync(sharedAuthFile, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('[IPC] Failed to load shared auth:', error);
    return null;
  }
});

// Clear shared auth data (legacy - kept for backward compatibility)
ipcMain.handle('clear-shared-auth', async (_event) => {
  try {
    if (fs.existsSync(sharedAuthFile)) {
      fs.unlinkSync(sharedAuthFile);
    }
    // Notify all other instances about the auth clear
    BrowserWindow.getAllWindows().forEach(window => {
      if (window && !window.isDestroyed() && window.webContents !== _event.sender) {
        window.webContents.send('shared-auth-update', null);
      }
    });
    return true;
  } catch (error) {
    console.error('[IPC] Failed to clear shared auth:', error);
    return false;
  }
});

// Multi-account storage handlers
ipcMain.handle('save-multi-accounts', async (_event, accountsData) => {
  try {
    fs.writeFileSync(multiAccountsFile, JSON.stringify(accountsData, null, 2));
    // Notify all other instances about the account update
    BrowserWindow.getAllWindows().forEach(window => {
      if (window && !window.isDestroyed() && window.webContents !== _event.sender) {
        window.webContents.send('multi-account-update', accountsData);
      }
    });
    return true;
  } catch (error) {
    console.error('[IPC] Failed to save multi-accounts:', error);
    return false;
  }
});

ipcMain.handle('load-multi-accounts', async () => {
  try {
    if (fs.existsSync(multiAccountsFile)) {
      const data = fs.readFileSync(multiAccountsFile, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('[IPC] Failed to load multi-accounts:', error);
    return null;
  }
});

ipcMain.handle('clear-multi-accounts', async (_event) => {
  try {
    if (fs.existsSync(multiAccountsFile)) {
      fs.unlinkSync(multiAccountsFile);
    }
    // Notify all other instances about the clear
    BrowserWindow.getAllWindows().forEach(window => {
      if (window && !window.isDestroyed() && window.webContents !== _event.sender) {
        window.webContents.send('multi-account-update', null);
      }
    });
    return true;
  } catch (error) {
    console.error('[IPC] Failed to clear multi-accounts:', error);
    return false;
  }
});

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
        //  which only happens in packaged builds use regular Notification in dev)
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

// --------- Update IPC Handlers ------------------------------------------------------------------------------------------------------------------------------------------------------
ipcMain.handle('updater:check-for-update', async () => {
  return await checkForUpdates(false);
});

ipcMain.on('updater:start-download', () => {
  if (updateInfo) {
    startDownload(updateInfo.url);
  }
});

ipcMain.on('updater:cancel-download', () => {
  cancelDownload();
});

ipcMain.on('updater:quit-and-install', () => {
  if (process.platform !== 'win32') {
    if (downloadFilePath && fs.existsSync(downloadFilePath)) {
      const dlPath = downloadFilePath;
      downloadFilePath = null;
      shell.openPath(dlPath);
      app.quit();
    }
    return;
  }

  const expectedPath = getExpectedUpdateFilePath();
  if (!downloadFilePath || downloadFilePath !== expectedPath || !fs.existsSync(downloadFilePath)) {
    mainWindow?.webContents.send('updater:status', {
      status: 'error',
      message: 'Restart blocked: update file is missing. Download again to create the .new file beside TeleDesk.',
      info: updateInfo,
    });
    return;
  }

  isQuitting = true;

  const currentExe = getInstalledExecutablePath();
  const dlPath = downloadFilePath;
  const backupPath = `${currentExe}.bak`;
  downloadFilePath = null;

  const updateWorkDir = path.dirname(currentExe);
  const updateLogPath = path.join(updateWorkDir, 'teledesk-update-log.txt');
  const cmdPath = path.join(updateWorkDir, 'teledesk-update.cmd');
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const backupName = path.basename(backupPath);

  try {
    console.log('[Updater] Preparing standalone CMD updater worker...');
    if (fs.existsSync(updateLogPath)) fs.unlinkSync(updateLogPath);
    fs.writeFileSync(updateLogPath, `[Bootstrap] ${new Date().toISOString()} - Preparing updater worker (.cmd)\n`, 'utf8');

    const cmdScript = [
      '@echo off',
      'setlocal EnableExtensions EnableDelayedExpansion',
      `set "LOG=${updateLogPath}"`,
      `set "SRC=${dlPath}"`,
      `set "DST=${currentExe}"`,
      `set "BAK=${backupPath}"`,
      `set "BAK_NAME=${backupName}"`,
      '>> "%LOG%" echo [worker %date% %time%] cmd worker started',
      'timeout /t 4 /nobreak >nul',
      '>> "%LOG%" echo [worker %date% %time%] swap begin',
      'if not exist "%SRC%" (>> "%LOG%" echo [worker %date% %time%] ERROR missing .new file & goto :end)',
      'if exist "%BAK%" del /f /q "%BAK%" >nul 2>&1',
      'if not exist "%DST%" (>> "%LOG%" echo [worker %date% %time%] ERROR current exe missing & goto :end)',
      'ren "%DST%" "%BAK_NAME%" >nul 2>&1',
      'if errorlevel 1 (>> "%LOG%" echo [worker %date% %time%] ERROR rename to .bak failed & goto :end)',
      'move /y "%SRC%" "%DST%" >nul 2>&1',
      'if errorlevel 1 (',
      '  >> "%LOG%" echo [worker %date% %time%] ERROR promote .new failed',
      '  if exist "%BAK%" move /y "%BAK%" "%DST%" >nul 2>&1',
      '  goto :end',
      ')',
      '>> "%LOG%" echo [worker %date% %time%] swap succeeded',
      'start "" "%DST%" >nul 2>&1',
      '>> "%LOG%" echo [worker %date% %time%] relaunch dispatched',
      ':end',
      'start "" /b cmd /c del /f /q "%~f0" >nul 2>&1',
      'exit /b 0',
    ].join('\r\n');

    fs.writeFileSync(cmdPath, cmdScript, 'utf8');
    fs.appendFileSync(updateLogPath, `[Bootstrap] ${new Date().toISOString()} - Script written: ${cmdPath}\n`, 'utf8');

    // Primary launch via ShellExecute for better breakaway behavior in packaged apps.
    void shell.openPath(cmdPath).then((openResult) => {
      try {
        fs.appendFileSync(updateLogPath, `[Bootstrap] ${new Date().toISOString()} - shell.openPath result: ${openResult || 'OK'}\n`, 'utf8');
      } catch {
        // no-op
      }
    });

    // Fallback launch via cmd/start.
    const comspec = process.env.ComSpec || 'cmd.exe';
    const launchArgs = ['/d', '/c', `start "" /min "${cmdPath}"`];
    fs.appendFileSync(updateLogPath, `[Bootstrap] ${new Date().toISOString()} - Launch command (fallback): ${comspec} ${launchArgs.join(' ')}\n`, 'utf8');

    const child = spawn(comspec, launchArgs, {
      cwd: updateWorkDir,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    });

    child.on('error', (spawnErr) => {
      try {
        fs.appendFileSync(updateLogPath, `[Bootstrap] ${new Date().toISOString()} - Fallback spawn failed: ${String(spawnErr)}\n`, 'utf8');
      } catch {
        // no-op
      }
    });

    child.unref();
    fs.appendFileSync(updateLogPath, `[Bootstrap] ${new Date().toISOString()} - Fallback spawned (pid=${child.pid ?? 'unknown'})\n`, 'utf8');

    if (tray && !tray.isDestroyed()) { tray.destroy(); tray = null; }
    setTimeout(() => {
      app.exit(0);
    }, 1800);
  } catch (err) {
    console.error('[Updater] Failed to launch update script:', err);
    try {
      fs.appendFileSync(updateLogPath, `[Bootstrap] ${new Date().toISOString()} - Launch failed: ${String(err)}\n`, 'utf8');
    } catch {
      // no-op if logging also fails
    }
    isQuitting = false;
    mainWindow?.webContents.send('updater:status', {
      status: 'error',
      message: 'Failed to start restart installer. Please try again.',
      info: updateInfo,
    });
  }
});

const checkForUpdates = async (manual = false): Promise<UpdateInfo | null> => {
  try {
    const backendUrl = process.env.VITE_BACKEND_URL || 'https://teledesk-backend-production.up.railway.app';
    const response = await net.fetch(`${backendUrl}/api/updates/latest`);
    
    if (!response.ok) throw new Error(`Failed to fetch latest release: ${response.status}`);

    const release = await response.json() as any;
    const latestVersion = release.tag_name.replace(/^v/, '');
    const currentVersion = app.getVersion();

    if (isServerVersionNewer(latestVersion, currentVersion)) {
      // This updater flow is for Windows executable replacement.
      const asset = release.assets.find((a: any) => a.name.toLowerCase().endsWith('.exe'));
      if (asset) {
        updateInfo = {
          version: latestVersion,
          url: asset.browser_download_url,
          name: asset.name,
          size: asset.size,
        };
        mainWindow?.webContents.send('updater:status', { status: 'available', info: updateInfo });
        return updateInfo;
      }
    }

    if (manual) {
      mainWindow?.webContents.send('updater:status', {
        status: 'no-update',
        message: `You are aleady running in updated version v${currentVersion}`,
      });
    }
    return null;
  } catch (error) {
    console.error('[Updater] Check failed:', error);
    if (manual) {
      mainWindow?.webContents.send('updater:status', { status: 'error', message: 'Failed to check for updates' });
    }
    return null;
  }
};

const startDownload = (url: string) => {
  if (isDownloading) return;
  if (process.platform !== 'win32') {
    mainWindow?.webContents.send('updater:status', {
      status: 'error',
      message: 'Auto update is supported only on Windows in this build.',
      info: updateInfo,
    });
    return;
  }

  const targetPath = getExpectedUpdateFilePath();
  const fileStream = fs.createWriteStream(targetPath);
  downloadFilePath = targetPath;
  isDownloading = true;

  let downloadedBytes = 0;
  let lastBytes = 0;
  let lastTime = Date.now();

  const request = net.request(url);
  downloadRequest = request;

  request.on('response', (response) => {
    const totalBytes = parseInt(response.headers['content-length'] as string, 10) || updateInfo?.size || 0;

    response.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      fileStream.write(chunk);

      // Calculate speed and ETA every 500ms
      const now = Date.now();
      const delta = now - lastTime;
      if (delta >= 500) {
        const speed = (downloadedBytes - lastBytes) / (delta / 1000); // bytes per second
        const remainingBytes = totalBytes - downloadedBytes;
        const eta = speed > 0 ? remainingBytes / speed : 0;

        downloadProgress = {
          percent: totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0,
          transferred: downloadedBytes,
          total: totalBytes,
          speed,
          eta,
        };

        mainWindow?.webContents.send('updater:status', { 
          status: 'downloading', 
          progress: downloadProgress,
          info: updateInfo 
        });

        lastBytes = downloadedBytes;
        lastTime = now;
      }
    });

    response.on('end', () => {
      fileStream.end();
      isDownloading = false;
      downloadRequest = null;
      mainWindow?.webContents.send('updater:status', { status: 'downloaded', info: updateInfo });
    });

    response.on('error', (err) => {
      fileStream.end();
      isDownloading = false;
      downloadRequest = null;
      console.error('[Updater] Download error:', err);
      mainWindow?.webContents.send('updater:status', { status: 'error', message: 'Download failed', info: updateInfo });
    });
  });

  request.on('error', (err) => {
    fileStream.end();
    isDownloading = false;
    downloadRequest = null;
    console.error('[Updater] Request error:', err);
    mainWindow?.webContents.send('updater:status', { status: 'error', message: 'Network error during download', info: updateInfo });
  });

  request.end();
};

const cancelDownload = () => {
  console.log('[Updater] cancelDownload requested. Active request:', !!downloadRequest);
  if (downloadRequest) {
    try {
      downloadRequest.abort();
      console.log('[Updater] Download request aborted');
    } catch (e) {
      console.error('[Updater] Failed to abort request:', e);
    }
    downloadRequest = null;
  }
  
  isDownloading = false;
  
  if (downloadFilePath && fs.existsSync(downloadFilePath)) {
    try {
      fs.unlinkSync(downloadFilePath);
      console.log('[Updater] Partial download file removed:', downloadFilePath);
    } catch (e) {
      console.error('[Updater] Failed to remove partial file:', e);
    }
  }

  downloadFilePath = null;
  
  mainWindow?.webContents.send('updater:status', { status: 'cancelled' });
};

// Copy text to clipboard natively
ipcMain.on('copy-text-to-clipboard', (_e, text: string) => {
  if (text) clipboard.writeText(text);
});

// Copy image to clipboard natively (bypasses CORS)
ipcMain.handle('copy-image-to-clipboard', async (_event, url: string) => {
  if (!url || !url.startsWith('http')) return false;
  try {
    const res = await net.fetch(url);
    if (!res.ok) {
      // If fetch fails, still try to write the URL as text as a last resort
      clipboard.writeText(url);
      return true;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const img = nativeImage.createFromBuffer(buf);
    
    if (img.isEmpty()) {
      // If it's an animated GIF or unsupported format, nativeImage will be empty.
      // We fall back to copying the URL so the user at least gets the link.
      clipboard.writeText(url);
      return true;
    }

    // For images that ARE supported, we can write both the image AND the text (URL)
    // to the clipboard. This is the most compatible way.
    clipboard.write({
      image: img,
      text: url
    });
    return true;
  } catch (err) {
    console.error('[IPC] Failed to copy image to clipboard:', err);
    // Even on error, try to write the text if we have the URL
    try {
      clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
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

// --------- Avatar fetch helper ---------------------------------------------------------------------------------------------------------------------------------------------------
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

// --------- Call Window ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
interface CallInitData {
  callId: string;
  callType: 'video' | 'voice';
  isOutgoing: boolean;
  targetUserId: string;
  targetName?: string;
  targetAvatar?: string;
  startTime?: number;
  isContinuing?: boolean;
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
    minWidth: 300,
    minHeight: 160,
    title: `${peerName} — ${callLabel}`,
    backgroundColor: '#0f172a',
    show: false,
    alwaysOnTop: true,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#ffffff',
      height: 36,
    },
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

  callWindow.on('maximize', () => {
    callWindow?.webContents.send('call:window-maximized');
  });

  callWindow.on('unmaximize', () => {
    callWindow?.webContents.send('call:window-unmaximized');
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

// --------- Call IPC Handlers ---------------------------------------------------------------------------------------------------------------------------------------------------------------

// Main window asks to open call window
ipcMain.on('call:open-window', (_e, initData: CallInitData) => {
  createCallWindow(initData);
});

// Incoming call  open directly as the merged call window (isOutgoing: false)
ipcMain.on('incoming-call:open-window', (_e, initData: CallInitData) => {
  createCallWindow(initData);
});

// Call window sends a custom event to the main window (e.g. incoming-accepted, incoming-rejected)
ipcMain.on('call:send-window-event', (_e, event: string) => {
  mainWindow?.webContents.send('call:window-event', event, {});
});

// Call window renderer is mounted and ready  flush buffered relay events
ipcMain.on('call:window-ready', (event) => {
  if (callWindow && !callWindow.isDestroyed() && event.sender === callWindow.webContents) {
    callWindowReady = true;
    // No longer send init-data (it's in URL params)  only flush buffered relay events
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

// Call window sends a socket emit request ΓåÆ relay to main window renderer
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

let lastCallWindowBounds: Electron.Rectangle | null = null;

// Minimize the call window to taskbar
ipcMain.on('call:window-minimize', () => {
  if (callWindow && !callWindow.isDestroyed()) callWindow.minimize();
});

// Maximize/Restore the call window
ipcMain.on('call:window-maximize', () => {
  if (callWindow && !callWindow.isDestroyed()) {
    if (callWindow.isMaximized()) {
      callWindow.unmaximize();
    } else {
      callWindow.maximize();
    }
  }
});

ipcMain.on('call:set-mini-mode', (_event, enabled: boolean) => {
  if (callWindow && !callWindow.isDestroyed()) {
    if (enabled) {
      lastCallWindowBounds = callWindow.getBounds();
      callWindow.setAlwaysOnTop(true, 'screen-saver');
      callWindow.setResizable(true);
      const miniWidth = 300;
      const miniHeight = 160;
      // Use transparent/0-height overlay instead of null to avoid JavaScript error 
      // while effectively hiding the buttons in mini-mode.
      callWindow.setTitleBarOverlay({ color: '#0f172a00', symbolColor: '#0f172a00', height: 0 });
      callWindow.setSize(miniWidth, miniHeight, false);
      const { workArea } = screen.getDisplayMatching(callWindow.getBounds());
      callWindow.setPosition(
        workArea.x + workArea.width - miniWidth - 24,
        workArea.y + 24,
        false
      );
    } else {
      callWindow.setResizable(true);
      callWindow.setAlwaysOnTop(true); // Return to standard always-on-top

      callWindow.setTitleBarOverlay({ color: '#0f172a', symbolColor: '#ffffff', height: 36 });

      // Restore previous window bounds
      if (lastCallWindowBounds) {
        callWindow.setBounds(lastCallWindowBounds, true);
      } else {
        // Fallback to default size if bounds lost
        callWindow.setSize(960, 680, true);
        callWindow.center();
      }
    }
  }
});



// --------- App Lifecycle ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Allow multiple instances (like VS Code, browsers)
// Note: userData path is set earlier in the file to give each instance its own directory

// Comment out single instance lock to enable multiple windows
// const gotTheLock = app.requestSingleInstanceLock();
// if (!gotTheLock) {
//   app.quit();
// } else {

app.whenReady().then(() => {
  // Remove native menu bar (File/Edit/View/Window/Help)
  Menu.setApplicationMenu(null);

  registerWindowsAUMID();
  
  // Start local OAuth callback server (fallback for dev mode when deep links don't work)
  startOAuthCallbackServer();

  // Grant camera & microphone permissions for the renderer
  const allowedPermissions = [
    'media', 'mediaKeySystem', 'camera', 'microphone',
    'display-capture', 'audiocapture', 'audioCapture',
    'videocapture', 'videoCapture', 'mediaDevices',
  ];
  
  // Configure shared session for authentication persistence across instances
  const sharedSession = session.fromPartition('persist:shared', {
    cache: false // Don't cache in shared session to avoid conflicts
  });
  
  // Set up shared session for authentication
  sharedSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.includes(permission));
  });

  sharedSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.includes(permission);
  });

  // Configure default session (instance-specific) for cache
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

  // Configure shared session for Firebase OAuth - remove CORS headers
  sharedSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    
    // Remove restrictive COOP/COEP headers that block OAuth popups
    delete responseHeaders['cross-origin-opener-policy'];
    delete responseHeaders['cross-origin-embedder-policy'];
    
    callback({ responseHeaders });
  });

  // Configure default session for Firebase OAuth - remove CORS headers
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

  // Handle deep link from command line args (Windows/Linux)
  // This handles the case when the app is launched via deep link
  console.log('[DeepLink] Checking command line args:', process.argv);
  
  // Check all args for deep link (not just the ones starting with protocol)
  // Sometimes the URL might be passed differently
  let deepLinkUrl = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
  
  // Also check if any arg contains the protocol (might be part of a longer string)
  if (!deepLinkUrl) {
    for (const arg of process.argv) {
      if (arg.includes(`${PROTOCOL}://`)) {
        // Extract the URL from the arg
        const match = arg.match(new RegExp(`${PROTOCOL}://[^\\s'"]+`));
        if (match) {
          deepLinkUrl = match[0];
          console.log('[DeepLink] Extracted deep link from arg:', deepLinkUrl);
          break;
        }
      }
    }
  }
  
  if (deepLinkUrl) {
    console.log('[DeepLink] Found deep link in command line args:', deepLinkUrl);
    // Wait for window to be ready before handling deep link
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('[DeepLink] Processing deep link after window ready');
        handleDeepLink(deepLinkUrl!);
      } else {
        console.warn('[DeepLink] Main window not ready, cannot process deep link');
      }
    }, 3000); // Increased timeout to ensure window and renderer are fully ready
  } else {
    console.log('[DeepLink] No deep link found in command line args');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  // Stop OAuth callback server
  stopOAuthCallbackServer();
  // Only destroy tray if it hasn't been destroyed already
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
});
// Closing brace removed - no longer needed since we removed the single instance lock wrapper
