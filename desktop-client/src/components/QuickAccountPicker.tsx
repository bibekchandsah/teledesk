import React, { useState, useEffect } from 'react';
import { useMultiAccountStore } from '../store/multiAccountStore';
import { Trash2 } from 'lucide-react';
import ConfirmationModal from './modals/ConfirmationModal';

interface QuickAccountPickerProps {
  onSelectAccount: (email: string) => void;
  onAddNewAccount: () => void;
}

export const QuickAccountPicker: React.FC<QuickAccountPickerProps> = ({
  onSelectAccount,
  onAddNewAccount,
}) => {
  const { accounts, removeAccount } = useMultiAccountStore();
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [hoveredAccount, setHoveredAccount] = useState<string | null>(null);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setIsTouchDevice(true);
      else if (e.pointerType === 'mouse') setIsTouchDevice(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  if (accounts.length === 0) return null;

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const getColorFromString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${hash % 360}, 65%, 55%)`;
  };

  const handleRemoveAccount = (uid: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmingRemove(uid);
  };

  const confirmRemoveAccount = () => {
    if (!confirmingRemove) return;
    removeAccount(confirmingRemove);
    setConfirmingRemove(null);
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {accounts.map((account) => (
          <div key={account.uid} style={{ position: 'relative' }}>
            <button
              onClick={() => onSelectAccount(account.email)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: isTouchDevice ? '12px 52px 12px 12px' : '12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                setHoveredAccount(account.uid);
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                setHoveredAccount(null);
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              {/* Avatar */}
              {account.avatar && account.avatar !== '/default-avatar.png' ? (
                <img
                  src={account.avatar}
                  alt={account.name}
                  style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const el = e.currentTarget.parentElement?.querySelector('.initials-fallback') as HTMLElement;
                    if (el) el.style.display = 'flex';
                  }}
                />
              ) : null}

              {/* Initials fallback */}
              <div
                className="initials-fallback"
                style={{
                  display: account.avatar && account.avatar !== '/default-avatar.png' ? 'none' : 'flex',
                  width: 40, height: 40, borderRadius: '50%',
                  backgroundColor: getColorFromString(account.email),
                  color: '#fff', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 600, flexShrink: 0,
                }}
              >
                {getInitials(account.name)}
              </div>

              {/* Account info */}
              <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {account.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {account.email}
                </div>
              </div>

              {/* Arrow — desktop only, hidden on hover when trash takes over */}
              {!isTouchDevice && (
                <svg
                  width="20" height="20" viewBox="0 0 20 20"
                  fill="none" stroke="var(--text-secondary)" strokeWidth="2"
                  style={{ flexShrink: 0, opacity: hoveredAccount === account.uid ? 0 : 1, transition: 'opacity 0.2s' }}
                >
                  <path d="M7 4l6 6-6 6" />
                </svg>
              )}
            </button>

            {/* Trash icon — always visible on touch, hover-only on desktop */}
            <button
              onClick={(e) => handleRemoveAccount(account.uid, e)}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: `translateY(-50%) scale(${isTouchDevice || hoveredAccount === account.uid ? 1 : 0.8})`,
                width: 32, height: 32,
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                transition: 'opacity 0.2s, transform 0.2s, background-color 0.15s',
                opacity: isTouchDevice || hoveredAccount === account.uid ? 1 : 0,
                pointerEvents: isTouchDevice || hoveredAccount === account.uid ? 'auto' : 'none',
                zIndex: 10,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; }}
              title="Remove account"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        {/* Add Another Account */}
        <button
          onClick={onAddNewAccount}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: 12, borderRadius: 10,
            border: '2px dashed var(--border)', backgroundColor: 'transparent',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M10 4v12M4 10h12" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
            Use another account
          </span>
        </button>
      </div>

      <ConfirmationModal
        isOpen={!!confirmingRemove}
        onCancel={() => setConfirmingRemove(null)}
        onConfirm={confirmRemoveAccount}
        title="Remove Account?"
        message="This account will be removed from the quick picker. You can add it back by signing in again."
        confirmText="Remove"
        cancelText="Cancel"
        isDestructive={true}
        icon={<Trash2 size={18} color="#fff" />}
      />
    </>
  );
};
