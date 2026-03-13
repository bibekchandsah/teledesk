import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@shared/types';

export interface StoredAccount {
  uid: string;
  email: string;
  name: string;
  avatar: string;
  refreshToken: string; // Firebase refresh token for re-authentication
  lastUsed: string;
}

interface MultiAccountState {
  accounts: StoredAccount[];
  activeAccountUid: string | null;
  
  // Actions
  addAccount: (account: StoredAccount) => void;
  removeAccount: (uid: string) => void;
  setActiveAccount: (uid: string) => void;
  updateAccount: (uid: string, updates: Partial<StoredAccount>) => void;
  getAccount: (uid: string) => StoredAccount | undefined;
  hasAccount: (uid: string) => boolean;
}

export const useMultiAccountStore = create<MultiAccountState>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountUid: null,

      addAccount: (account) =>
        set((state) => {
          const exists = state.accounts.find((a) => a.uid === account.uid);
          if (exists) {
            // Update existing account
            return {
              accounts: state.accounts.map((a) =>
                a.uid === account.uid ? { ...a, ...account, lastUsed: new Date().toISOString() } : a
              ),
              activeAccountUid: account.uid,
            };
          }
          // Add new account
          return {
            accounts: [...state.accounts, { ...account, lastUsed: new Date().toISOString() }],
            activeAccountUid: account.uid,
          };
        }),

      removeAccount: (uid) =>
        set((state) => ({
          accounts: state.accounts.filter((a) => a.uid !== uid),
          activeAccountUid: state.activeAccountUid === uid ? null : state.activeAccountUid,
        })),

      setActiveAccount: (uid) =>
        set((state) => ({
          activeAccountUid: uid,
          accounts: state.accounts.map((a) =>
            a.uid === uid ? { ...a, lastUsed: new Date().toISOString() } : a
          ),
        })),

      updateAccount: (uid, updates) =>
        set((state) => ({
          accounts: state.accounts.map((a) => (a.uid === uid ? { ...a, ...updates } : a)),
        })),

      getAccount: (uid) => get().accounts.find((a) => a.uid === uid),

      hasAccount: (uid) => get().accounts.some((a) => a.uid === uid),
    }),
    {
      name: 'multi-account-storage',
    }
  )
);
