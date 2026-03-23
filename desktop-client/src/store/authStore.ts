import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User } from '@shared/types';

interface AuthState {
  currentUser: User | null;
  firebaseUid: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  setCurrentUser: (user: User | null) => void;
  setFirebaseUid: (uid: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: null,
      firebaseUid: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      setCurrentUser: (user) =>
        set({ currentUser: user, isAuthenticated: !!user, isLoading: false }),

      setFirebaseUid: (uid) => set({ firebaseUid: uid }),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error, isLoading: false }),

      logout: () =>
        set({
          currentUser: null,
          firebaseUid: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        }),
    }),
    {
      name: 'teledesk-auth-storage', // unique name for localStorage key
      storage: createJSONStorage(() => localStorage),
      // Only persist essential auth data, not loading/error states
      partialize: (state) => ({
        currentUser: state.currentUser,
        firebaseUid: state.firebaseUid,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
