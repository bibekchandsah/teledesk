import React from 'react';
import { useMultiAccountStore } from '../store/multiAccountStore';

interface QuickAccountPickerProps {
  onSelectAccount: (email: string) => void;
  onAddNewAccount: () => void;
}

export const QuickAccountPicker: React.FC<QuickAccountPickerProps> = ({
  onSelectAccount,
  onAddNewAccount,
}) => {
  const { accounts } = useMultiAccountStore();

  if (accounts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
        Choose an account
      </div>
      <div className="space-y-2">
        {accounts.map((account) => (
          <button
            key={account.uid}
            onClick={() => onSelectAccount(account.email)}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <img
              src={account.avatar || '/default-avatar.png'}
              alt={account.name}
              className="w-10 h-10 rounded-full"
            />
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">{account.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {account.email}
              </div>
            </div>
          </button>
        ))}
      </div>
      <button
        onClick={onAddNewAccount}
        className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span className="text-sm font-medium">Use another account</span>
      </button>
    </div>
  );
};
