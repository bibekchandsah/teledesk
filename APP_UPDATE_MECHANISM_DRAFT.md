# TeleDesk Desktop Auto-Update Mechanism (Draft Implementation Guide)

This document describes the current update mechanism used by the Electron desktop app so another developer can implement the same approach.

## 1. High-Level Flow

1. Desktop app asks backend for the latest GitHub release metadata.
2. Main process compares installed app version vs release version.
3. If release is newer, UI shows "Update Available" banner.
4. User clicks "Update Now" and app downloads the new `.exe` next to the running executable as `<AppName>.exe.new`.
5. User clicks "Restart & Update".
6. Main process writes an updater worker (`teledesk-update.cmd`) in the executable folder and starts it.
7. App exits.
8. Updater worker renames old app to `.bak`, promotes `.new` to `.exe`, then relaunches app.
9. On next startup, renderer detects version change and shows "Update installed successfully" toast.

## 2. Component Responsibilities

### Backend: Release Metadata Proxy

- Route: `GET /api/updates/latest`
- Backend proxies GitHub latest release API and returns release JSON.
- Keeps GitHub token on server side (not exposed to desktop client).

Key files:
- `backend-server/src/routes/updateRoutes.ts`
- `backend-server/src/controllers/updateController.ts`

### Desktop Main Process: Update Engine

Main process responsibilities:
- Check for updates.
- Download update binary.
- Emit updater status events to renderer.
- Start update worker and exit app.

Key file:
- `desktop-client/electron/main.ts`

### Preload Bridge: Safe IPC API

Exposes updater methods to renderer:
- `checkForUpdates()`
- `startDownload()`
- `cancelDownload()`
- `quitAndInstall()`
- `onUpdateStatus(cb)`

Key file:
- `desktop-client/electron/preload.ts`

### Renderer UI: Update Banner

- Listens for `updater:status` events.
- Shows states: `available`, `downloading`, `downloaded`, `error`, `cancelled`.
- Triggers download/restart actions.

Key file:
- `desktop-client/src/components/UpdateBanner.tsx`

## 3. Versioning Rules

Current app version source:
- `desktop-client/package.json` -> `version`

Runtime version read:
- `app.getVersion()` in Electron main process

Comparison behavior:
- Only show update if server version is strictly newer than installed version.
- If server version is older or equal, do not show "update available".

## 4. Detailed Main-Process Lifecycle

## 4.1 Check for Update

1. Call backend URL: `<BACKEND_URL>/api/updates/latest`
2. Parse `tag_name` (strip leading `v` if present).
3. Compare `latestVersion` vs `currentVersion`.
4. Select `.exe` asset from release assets.
5. Emit status:
   - `updater:status` with `{ status: 'available', info }` if update exists.
   - `updater:status` with `{ status: 'no-update' }` for manual checks only.

## 4.2 Download

1. Download target path is strict:
   - Same folder as installed executable
   - `<installed-exe>.new`
2. Stream bytes with progress calculations:
   - percent
   - transferred
   - total
   - speed
   - eta
3. Emit status:
   - `downloading`
   - `downloaded`
   - `error`
4. Cancel removes partial `.new` file.

## 4.3 Restart and Install

1. Validate downloaded file exists and matches expected `.new` target.
2. Create worker script in executable directory (`teledesk-update.cmd`).
3. Start worker process.
4. Exit app.

Worker script actions:
1. Wait a few seconds for app to exit.
2. Ensure `.new` exists.
3. Delete previous `.bak` if present.
4. Rename current `.exe` -> `.bak`.
5. Move `.new` -> `.exe`.
6. Start new `.exe`.
7. Log each stage to `teledesk-update-log.txt`.

## 5. Logging and Diagnostics

Write update logs beside executable:
- `teledesk-update-log.txt`

Useful events to log:
- bootstrap started
- worker script created
- worker launch command
- worker launched pid
- swap start
- rename success/failure
- promote success/failure
- relaunch dispatched

## 6. Production Requirements

1. GitHub releases must include a Windows `.exe` asset.
2. Backend must have optional `GITHUB_TOKEN` for higher rate limit.
3. Desktop app must be able to write beside installed executable.
4. Release version (`tag_name`) should follow semantic version format.

## 7. Known Constraints

1. Current swap flow is Windows-focused (`.exe` replacement).
2. Non-Windows paths currently use fallback behavior (open downloaded file + quit).
3. If host environment blocks script workers, use a dedicated native updater helper executable instead of script host.

## 8. Quick Implementation Checklist

1. Add backend proxy endpoint for latest release.
2. Add Electron IPC handlers for update check/download/restart.
3. Add preload bridge methods.
4. Add renderer update banner with status handling.
5. Enforce strict same-directory `.new` download target.
6. Implement worker for `.bak` swap + relaunch.
7. Add detailed updater logging.
8. Compare versions with "newer-than" logic, not "not-equal" logic.
9. Bump desktop version in `desktop-client/package.json` for each release.

## 9. Suggested Future Hardening

1. Replace script worker with small native updater helper executable for maximum reliability.
2. Add hash/signature validation of downloaded asset before swap.
3. Add rollback launcher path if relaunch fails after swap.
4. Add telemetry around update success rate by stage.
