/**
 * Shared account-switching logic used by both AccountSwitcher UI and the tray IPC handler.
 * Shows a full-screen overlay while switching, handles expired tokens, and cleans up properly.
 */
import { StoredAccount, useMultiAccountStore } from '../store/multiAccountStore';

const showSwitchingOverlay = (name: string): HTMLDivElement => {
  const existing = document.getElementById('account-switching-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'account-switching-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: var(--bg-primary, #0f172a);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    gap: 16px;
  `;
  overlay.innerHTML = `
    <div style="
      width: 48px; height: 48px;
      border: 4px solid var(--accent, #6366f1);
      border-top-color: transparent;
      border-radius: 50%;
      animation: sw-spin 1s linear infinite;
    "></div>
    <div style="color: var(--text-primary, #fff); font-size: 16px; font-weight: 600;">
      Switching to ${name}...
    </div>
    <style>@keyframes sw-spin { to { transform: rotate(360deg); } }</style>
  `;
  document.body.appendChild(overlay);
  return overlay;
};

const removeOverlay = () => {
  document.getElementById('account-switching-overlay')?.remove();
};

/**
 * Switch to `account`, showing a full-screen overlay.
 * On expired/revoked token: removes the account from storage, logs out, and navigates to login.
 * On success: reloads the app into the new account.
 */
export const switchAccountWithUI = async (
  account: StoredAccount,
  logout: (switching?: boolean) => Promise<void>,
): Promise<void> => {
  const isFileProtocol = window.location.protocol === 'file:';
  const navigate = (path: string) => {
    if (isFileProtocol) {
      window.location.hash = path;
    } else {
      window.location.href = path;
    }
  };

  showSwitchingOverlay(account.name);

  try {
    const { switchToAccount } = await import('./multiAccountService');
    await switchToAccount(account);

    // Sign out Firebase session so it doesn't auto-restore the old account
    await logout(true);
    await new Promise(resolve => setTimeout(resolve, 300));

    // Verify storage was updated
    const { multiAccountAuthService } = await import('./multiAccountAuthService');
    const verification = await multiAccountAuthService.getActiveAccount();
    if (verification?.uid !== account.uid) {
      throw new Error('Failed to set active account in storage');
    }

    useMultiAccountStore.getState().setActiveAccount(account.uid);

    await new Promise(resolve => setTimeout(resolve, 700));
    window.location.reload();
  } catch (err) {
    console.warn('[AccountSwitch] Switch failed, cleaning up expired account:', err);
    removeOverlay();

    try {
      // Remove the expired account so the user re-adds it fresh
      const { multiAccountAuthService } = await import('./multiAccountAuthService');
      await multiAccountAuthService.removeAccount(account.uid);
      useMultiAccountStore.getState().removeAccount(account.uid);

      // Clear active account to prevent auto-restore
      const storage = await multiAccountAuthService.loadAccounts();
      if (storage) {
        storage.activeAccountUid = null;
        await multiAccountAuthService.saveAccounts(storage);
      }
    } catch (cleanupErr) {
      console.error('[AccountSwitch] Cleanup failed:', cleanupErr);
    }

    await logout(true);
    navigate(`/login?switch=${encodeURIComponent(account.email)}&uid=${account.uid}&expired=true`);
  }
};
