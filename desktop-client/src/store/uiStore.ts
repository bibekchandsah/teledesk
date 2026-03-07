import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  profileModalOpen: boolean;
  profileUserId: string | null;
  searchQuery: string;
  theme: 'dark' | 'light';
  newGroupModalOpen: boolean;
  liveTypingEnabled: boolean;
  showArchived: boolean;

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
  setProfileModal: (open: boolean, userId?: string) => void;
  setSearchQuery: (query: string) => void;
  toggleTheme: () => void;
  setNewGroupModal: (open: boolean) => void;
  toggleLiveTyping: () => void;
  setShowArchived: (val: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  settingsOpen: false,
  profileModalOpen: false,
  profileUserId: null,
  searchQuery: '',
  theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
  newGroupModalOpen: false,
  liveTypingEnabled: localStorage.getItem('liveTypingEnabled') === 'true',
  showArchived: false,

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setProfileModal: (open, userId) =>
    set({ profileModalOpen: open, profileUserId: userId || null }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', newTheme);
      return { theme: newTheme };
    }),
  setNewGroupModal: (open) => set({ newGroupModalOpen: open }),
  toggleLiveTyping: () =>
    set((state) => {
      const next = !state.liveTypingEnabled;
      localStorage.setItem('liveTypingEnabled', String(next));
      return { liveTypingEnabled: next };
    }),
  setShowArchived: (val) => set({ showArchived: val }),
}));
