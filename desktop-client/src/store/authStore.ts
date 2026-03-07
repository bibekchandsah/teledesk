import { create } from 'zustand';
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

export const useAuthStore = create<AuthState>((set) => ({
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
}));
