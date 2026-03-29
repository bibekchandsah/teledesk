import React, { useState, useEffect } from 'react';
import { useMultiAccountStore } from '../store/multiAccountStore';
import { useAuthStore } from '../store/authStore';
import { useAuth } from '../context/AuthContext';
import { ChevronUp, Plus, Trash2 } from 'lucide-react';
import ConfirmationModal from './modals/ConfirmationModal';
import ErrorModal from './modals/ErrorModal';
import UserAvatar from './UserAvatar';

export const AccountSwitcher: React.FC = () => {
  const { accounts, activeAccountUid, removeAccount, setActiveAccount } = useMultiAccountStore();
  const { currentUser } = useAuthStore();
  const { logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });

  const hasMultipleAccounts = accounts.length > 1;

  // Detect screen size changes
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSwitchAccount = async (uid: string) => {
    if (uid === activeAccountUid) {
      setIsOpen(false);
      return;
    }

    setSwitching(true);
    setIsOpen(false);

    try {
      const account = accounts.find((a) => a.uid === uid);
      if (!account) {
        throw new Error('Account not found');
      }

      // Show switching overlay
      const overlay = document.createElement('div');
      overlay.id = 'account-switching-overlay';
      overlay.style.cssText = `
        position: fixed;
        height: 100dvh;
        background: var(--bg-primary);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        gap: 16px;
      `;
      overlay.innerHTML = `
        <div style="
          width: 48px;
          height: 48px;
          border: 4px solid var(--accent);
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        "></div>
        <div style="
          color: var(--text-primary);
          font-size: 16px;
          font-weight: 600;
        ">Switching to ${account.name}...</div>
        <style>
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      `;
      document.body.appendChild(overlay);

      // Try seamless account switching first
      try {
        const { switchAccountWithUI } = await import('../services/accountSwitchService');
        await switchAccountWithUI(account, logout);
      } catch {
        // switchAccountWithUI handles all errors internally, this is a safety net
        const overlay = document.getElementById('account-switching-overlay');
        if (overlay) overlay.remove();
        setSwitching(false);
      }
    } catch (error) {
      console.error('Failed to switch account:', error);

      // Remove overlay on error
      const overlay = document.getElementById('account-switching-overlay');
      if (overlay) overlay.remove();

      setSwitching(false);

      // Show error modal
      setErrorModal({
        isOpen: true,
        message: 'Unable to switch accounts. You will be redirected to the login page.',
      });

      // Store the account info for redirect
      const account = accounts.find((a) => a.uid === uid);
      if (account) {
        (window as any).__pendingAccountSwitch = {
          account,
          uid,
        };
      }
    }
  };

  const handleRemoveAccount = (uid: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmingRemove(uid);
  };

  const confirmRemoveAccount = async () => {
    if (!confirmingRemove) return;
    
    const uid = confirmingRemove;
    setConfirmingRemove(null);
    
    try {
      // 1. Remove from local store
      removeAccount(uid);

      // 2. If it was the active account, sign out and redirect
      if (uid === activeAccountUid) {
        await logout(false);
        window.location.href = '/login';
      }
    } catch (err) {
      console.error('Failed to remove account:', err);
      setErrorModal({
        isOpen: true,
        message: 'Failed to remove account. Please try again.',
      });
    }
  };

  const handleErrorModalClose = () => {
    setErrorModal({ isOpen: false, message: '' });
  };

  const handleAddAccount = async () => {
    if (addingAccount) return; // Prevent multiple clicks

    setAddingAccount(true);
    try {
      // Clear active account temporarily so auto-restore doesn't happen
      const { multiAccountAuthService } = await import('../services/multiAccountAuthService');
      const storage = await multiAccountAuthService.loadAccounts();
      if (storage) {
        storage.activeAccountUid = null; // Clear active account
        await multiAccountAuthService.saveAccounts(storage);
      }
      
      // Log out current user first so they can add a different account
      await logout(true); // true = switching account, keeps account list

      // Navigate to login page with add account flag
      // Use window.location.reload() for Electron compatibility
      if (window.electronAPI) {
        // In Electron, we need to navigate differently
        window.location.hash = '#/login?add=true';
        window.location.reload();
      } else {
        window.location.href = '/login?add=true';
      }
    } catch (error) {
      console.error('Failed to logout for adding account:', error);
      setAddingAccount(false);
      // Still redirect even if logout fails
      if (window.electronAPI) {
        window.location.hash = '#/login?add=true';
        window.location.reload();
      } else {
        window.location.href = '/login?add=true';
      }
    }
  };

  return (
    <>
      {/* Badge overlay - covers the top-right corner to block NavLink clicks */}
      <div 
        style={{ 
          position: 'absolute', 
          top: -10, 
          right: 0, 
          width: 28, 
          height: 28, 
          pointerEvents: 'auto',
          zIndex: 10,
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {/* Icon Button - Shows + when single account, ^ when multiple */}
        <button
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (hasMultipleAccounts) {
              setIsOpen(!isOpen);
            } else {
              await handleAddAccount();
            }
          }}
          disabled={addingAccount}
          style={{
            position: 'absolute',
            top: 0,
            right: 4,
            width: 20,
            height: 20,
            minWidth: 20,
            minHeight: 20,
            borderRadius: '50%',
            backgroundColor: 'var(--accent)',
            color: '#fff',
            border: '2px solid var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: addingAccount ? 'not-allowed' : 'pointer',
            padding: 0,
            zIndex: 11,
            opacity: addingAccount ? 0.6 : 1,
            flexShrink: 0,
          }}
          title={hasMultipleAccounts ? 'Switch Account' : 'Add Account'}
        >
          {hasMultipleAccounts ? (
            <ChevronUp size={12} strokeWidth={3} />
          ) : (
            <Plus size={12} strokeWidth={3} />
          )}
        </button>
      </div>

      {/* Dropdown - Only shown when multiple accounts exist and dropdown is open */}
      {isOpen && hasMultipleAccounts && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
              backgroundColor: isMobile ? 'rgba(0, 0, 0, 0.5)' : 'transparent',
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div
            onClick={(e) => {
              e.stopPropagation();
            }}
            style={{
              position: 'fixed',
              ...(isMobile ? {
                // Mobile: Center on screen
                bottom: 'auto',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 'calc(100vw - 32px)',
                maxWidth: 320,
              } : {
                // Desktop: Next to sidebar
                bottom: 80,
                left: 70,
                width: 280,
              }),
              maxHeight: isMobile ? 'calc(100dvh - 80px)' : 'calc(100dvh - 100px)',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 12,
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
              border: '1px solid var(--border)',
              zIndex: 50,
              overflow: 'auto',
            }}
          >
            {/* Mobile Close Button */}
            {isMobile && (
              <div style={{ padding: '12px 12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Switch Account
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 5L5 15M5 5l10 10" />
                  </svg>
                </button>
              </div>
            )}
            {/* Account List */}
            <div style={{ padding: 8 }}>
              {accounts.map((account) => (
                <div
                  key={account.uid}
                  style={{
                    position: 'relative',
                    width: '100%',
                    marginBottom: 4,
                  }}
                  onMouseEnter={(e) => {
                    if (isMobile) return;
                    const trash = e.currentTarget.querySelector('.trash-btn') as HTMLElement;
                    const check = e.currentTarget.querySelector('.check-icon') as HTMLElement;
                    if (trash) trash.style.opacity = '1';
                    if (check) check.style.opacity = '0';
                  }}
                  onMouseLeave={(e) => {
                    if (isMobile) return;
                    const trash = e.currentTarget.querySelector('.trash-btn') as HTMLElement;
                    const check = e.currentTarget.querySelector('.check-icon') as HTMLElement;
                    if (trash) trash.style.opacity = '0';
                    if (check) check.style.opacity = '1';
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSwitchAccount(account.uid);
                    }}
                    disabled={switching}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 8,
                      backgroundColor: account.uid === activeAccountUid ? 'var(--bg-hover)' : 'transparent',
                      border: 'none',
                      cursor: switching ? 'not-allowed' : 'pointer',
                      transition: 'background-color 0.2s',
                      opacity: switching ? 0.6 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (account.uid !== activeAccountUid && !switching) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (account.uid !== activeAccountUid) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <UserAvatar
                      name={account.name}
                      avatar={account.avatar}
                      size={40}
                    />
                    <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {account.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {account.email}
                      </div>
                    </div>
                    {account.uid === activeAccountUid ? (
                      <div
                        className="check-icon"
                        style={{
                          width: 20,
                          height: 20,
                          minWidth: 20,
                          minHeight: 20,
                          borderRadius: '50%',
                          backgroundColor: 'var(--accent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'opacity 0.2s',
                          marginRight: isMobile ? 32 : 0,
                        }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="2"
                        >
                          <path d="M2 6l3 3 5-6" />
                        </svg>
                      </div>
                    ) : (
                      <div style={{ width: 20 }} /> // Placeholder for alignment
                    )}
                  </button>

                  <button
                    type="button"
                    className="trash-btn"
                    onClick={(e) => handleRemoveAccount(account.uid, e)}
                    style={{
                      position: 'absolute',
                      right: 4,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      opacity: isMobile ? 1 : 0,
                      zIndex: 10,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                    }}
                    title="Remove Account"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Account Button */}
            <div style={{ borderTop: '1px solid var(--border)', padding: 8 }}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAddAccount();
                }}
                disabled={addingAccount}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: addingAccount ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                  opacity: addingAccount ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!addingAccount) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    minWidth: 40,
                    minHeight: 40,
                    borderRadius: '50%',
                    backgroundColor: 'var(--bg-hover)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Plus size={20} color="var(--accent)" />
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
                    Add account
                  </div>
                </div>
              </button>
            </div>
          </div>
        </>
      )}

        {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!confirmingRemove}
        onCancel={() => setConfirmingRemove(null)}
        onConfirm={confirmRemoveAccount}
        title="Remove Account ?"
        message="Are you sure you want to remove this account from this device? You will need to sign in again to access it."
        confirmText="Remove Account"
        cancelText="Cancel"
        isDestructive={true}
        icon={<Trash2 size={18} color="#fff" />}
      />

      {/* Error Modal */}
      <ErrorModal
        isOpen={errorModal.isOpen}
        onClose={handleErrorModalClose}
        title="Account Switching Failed"
        message={errorModal.message}
        buttonText="Continue to Login"
      />
    </>
  );
}
