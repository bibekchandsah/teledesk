import { create } from 'zustand';

interface DraftState {
  drafts: Record<string, string>; // chatId -> draft content
  setDraft: (chatId: string, content: string) => void;
  getDraft: (chatId: string) => string;
  clearDraft: (chatId: string) => void;
  setDrafts: (drafts: Record<string, string>) => void;
}

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: {},

  setDraft: (chatId: string, content: string) => {
    set((state) => ({
      drafts: { ...state.drafts, [chatId]: content },
    }));
  },

  getDraft: (chatId: string) => {
    return get().drafts[chatId] || '';
  },

  clearDraft: (chatId: string) => {
    set((state) => {
      const newDrafts = { ...state.drafts };
      delete newDrafts[chatId];
      return { drafts: newDrafts };
    });
  },

  setDrafts: (drafts: Record<string, string>) => {
    set({ drafts });
  },
}));
