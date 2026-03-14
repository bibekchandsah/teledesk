import React, { useState } from 'react';
import { useMultiAccountStore } from '../store/multiAccountStore';
import { User, Trash2 } from 'lucide-react';
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
  const [hoveredAccount, setHoveredAccount] = useState<string | null>(null);

  if (accounts.length === 0) return null;

  // Generate initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Generate color from string
  const getColorFromString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 65%, 55%)`;
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
          <div
            key={account.uid}
            style={{ position: 'relative' }}
            onMouseEnter={() => setHoveredAccount(account.uid)}
            onMouseLeave={() => setHoveredAccount(null)}
          >
            <button
              onClick={() => onSelectAccount(account.email)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                borderRadius: 10,
                border: '1px solid var(--border)',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
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
          {/* Avatar or Initials */}
          {account.avatar && account.avatar !== '/default-avatar.png' ? (
            <img
              src={account.avatar}
              alt={account.name}
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                objectFit: 'cover',
              }}
              onError={(e) => {
                // Hide broken image and show initials instead
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  const initialsDiv = parent.querySelector('.initials-fallback') as HTMLElement;
                  if (initialsDiv) initialsDiv.style.display = 'flex';
                }
              }}
            />
          ) : null}
          
          {/* Initials Fallback */}
          <div
            className="initials-fallback"
            style={{
              display: account.avatar && account.avatar !== '/default-avatar.png' ? 'none' : 'flex',
              width: 40,
              height: 40,
              borderRadius: '50%',
              backgroundColor: getColorFromString(account.email),
              color: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {getInitials(account.name)}
          </div>

          {/* Account Info */}
          <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {account.name}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {account.email}
            </div>
          </div>

          {/* Arrow Icon */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="2"
            style={{ 
              flexShrink: 0,
              opacity: hoveredAccount === account.uid ? 0 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            <path d="M7 4l6 6-6 6" />
          </svg>
        </button>

        {/* Delete Button - Shows on hover */}
        <button
          onClick={(e) => handleRemoveAccount(account.uid, e)}
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
            opacity: hoveredAccount === account.uid ? 1 : 0,
            pointerEvents: hoveredAccount === account.uid ? 'auto' : 'none',
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
          }}
          title="Remove account"
        >
          <Trash2 size={16} />
        </button>
      </div>
      ))}

      {/* Add Another Account Button */}
      <button
        onClick={onAddNewAccount}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: 12,
          borderRadius: 10,
          border: '2px dashed var(--border)',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          transition: 'all 0.2s',
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
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
        >
          <path d="M10 4v12M4 10h12" />
        </svg>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--accent)',
          }}
        >
          Use another account
        </span>
      </button>
    </div>

    {/* Confirmation Modal */}
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
