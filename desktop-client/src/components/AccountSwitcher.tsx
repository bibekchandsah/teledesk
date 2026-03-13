import React, { useState, useEffect } from 'react';
import { useMultiAccountStore } from '../store/multiAccountStore';
import { useAuthStore } from '../store/authStore';
import { useAuth } from '../context/AuthContext';
import { Plus, ChevronUp } from 'lucide-react';

export const AccountSwitcher: React.FC = () => {
  const { accounts, activeAccountUid, removeAccount, setActiveAccount } = useMultiAccountStore();
  const { currentUser } = useAuthStore();
  const { logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

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
        inset: 0;
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

      // Use seamless account switching (like Gmail)
      const { switchToAccount } = await import('../services/multiAccountService');
      await switchToAccount(account);

      // Set as active account
      setActiveAccount(uid);

      // Small delay to ensure state is saved
      await new Promise(resolve => setTimeout(resolve, 500));

      // Reload the page to reinitialize with new account
      window.location.href = '/';
    } catch (error) {
      console.error('Failed to switch account:', error);
      
      // Remove overlay on error
      const overlay = document.getElementById('account-switching-overlay');
      if (overlay) overlay.remove();
      
      setSwitching(false);
      
      // Fallback: If seamless switching fails, use traditional method
      alert('Seamless switching failed. Redirecting to login...');
      
      const account = accounts.find((a) => a.uid === uid);
      if (account) {
        await logout(true);
        setActiveAccount(uid);
        window.location.href = `/login?switch=${encodeURIComponent(account.email)}&uid=${uid}`;
      }
    }
  };

  const handleRemoveAccount = async (uid: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Remove this account? You can add it back anytime.')) return;

    removeAccount(uid);

    // If removing active account, sign out
    if (uid === activeAccountUid) {
      await logout(false);
      window.location.href = '/login';
    }
  };

  const handleAddAccount = async () => {
    if (addingAccount) return; // Prevent multiple clicks
    
    setAddingAccount(true);
    try {
      // Log out current user first so they can add a different account
      await logout(true); // true = switching account, keeps account list
      
      // Navigate to login page with add account flag
      window.location.href = '/login?add=true';
    } catch (error) {
      console.error('Failed to logout for adding account:', error);
      setAddingAccount(false);
      // Still redirect even if logout fails
      window.location.href = '/login?add=true';
    }
  };

  return (
    <div style={{ position: 'relative' }}>
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
          top: -50,
          right: -4,
          width: 20,
          height: 20,
          borderRadius: '50%',
          backgroundColor: 'var(--accent)',
          color: '#fff',
          border: '2px solid var(--bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: addingAccount ? 'not-allowed' : 'pointer',
          padding: 0,
          zIndex: 10,
          opacity: addingAccount ? 0.6 : 1,
        }}
        title={hasMultipleAccounts ? 'Switch Account' : 'Add Account'}
      >
        {hasMultipleAccounts ? (
          <ChevronUp size={12} strokeWidth={3} />
        ) : (
          <Plus size={12} strokeWidth={3} />
        )}
      </button>

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
            onClick={() => setIsOpen(false)}
          />
          <div
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
              maxHeight: isMobile ? 'calc(100vh - 80px)' : 'calc(100vh - 100px)',
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
                  onClick={() => setIsOpen(false)}
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
                <button
                  key={account.uid}
                  onClick={() => handleSwitchAccount(account.uid)}
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
                  <img
                    src={account.avatar || '/default-avatar.png'}
                    alt={account.name}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      objectFit: 'cover',
                    }}
                  />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {account.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {account.email}
                    </div>
                  </div>
                  {account.uid === activeAccountUid && (
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
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
                  )}
                </button>
              ))}
            </div>

            {/* Add Account Button */}
            <div style={{ borderTop: '1px solid var(--border)', padding: 8 }}>
              <button
                onClick={handleAddAccount}
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
                    borderRadius: '50%',
                    backgroundColor: 'var(--bg-hover)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
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
    </div>
  );
};
