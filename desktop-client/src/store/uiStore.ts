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
  selectedMicId: string;
  lastActiveChatId: string | null;

  setSidebarOpen: (open: boolean) => void;
  setSelectedMicId: (id: string) => void;
  setLastActiveChatId: (chatId: string | null) => void;
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
  selectedMicId: localStorage.getItem('selectedMicId') ?? '',
  lastActiveChatId: localStorage.getItem('lastActiveChatId') || null,

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSelectedMicId: (id) => {
    localStorage.setItem('selectedMicId', id);
    set({ selectedMicId: id });
  },
  setLastActiveChatId: (chatId) => {
    if (chatId) localStorage.setItem('lastActiveChatId', chatId);
    else localStorage.removeItem('lastActiveChatId');
    set({ lastActiveChatId: chatId });
  },
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
