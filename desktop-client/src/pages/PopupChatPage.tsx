import React, { useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { listenToUserChats } from '../services/firebaseService';
import { getUserById } from '../services/apiService';
import ChatWindow from './ChatWindow';

/**
 * Rendered in "open in new window" popup Electron windows.
 * Bootstraps the chats listener (same as ChatListPage) then renders
 * ChatWindow full-screen — no nav sidebar, no chat sidebar.
 */
const PopupChatPage: React.FC = () => {
  const { setChats, setUserProfile } = useChatStore();
  const { currentUser } = useAuthStore();

  // Populate the chats + user-profile stores, same as ChatListPage does
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = listenToUserChats(currentUser.uid, async (chats) => {
      setChats(chats);

      const memberIds = new Set<string>();
      chats.forEach((c) => c.members.forEach((m) => memberIds.add(m)));
      memberIds.delete(currentUser.uid);

      for (const uid of memberIds) {
        const res = await getUserById(uid);
        if (res.success && res.data) setUserProfile(res.data);
      }
    });

    return unsubscribe;
  }, [currentUser, setChats, setUserProfile]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ChatWindow />
    </div>
  );
};

export default PopupChatPage;
