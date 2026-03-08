import React, { useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import { listenToUserChats, onAuthChange } from '../services/firebaseService';
import { getUserById } from '../services/apiService';
import ChatWindow from './ChatWindow';

/**
 * Rendered in "open in new window" popup Electron windows.
 *
 * We subscribe directly to Firebase auth here (not via AuthContext) so that
 * listenToUserChats starts the moment Firebase resolves its cached auth state.
 * AuthContext does extra backend sync work before setting currentUser in the store,
 * which would delay the chat from loading — this bypasses that wait.
 */
const PopupChatPage: React.FC = () => {
  const { setChats, setUserProfile } = useChatStore();

  useEffect(() => {
    let chatUnsub: (() => void) | null = null;

    const authUnsub = onAuthChange((fbUser) => {
      // Already subscribed — nothing to do
      if (chatUnsub) return;
      if (!fbUser) return;

      chatUnsub = listenToUserChats(fbUser.uid, async (chats) => {
        setChats(chats);

        const memberIds = new Set<string>();
        chats.forEach((c) => c.members.forEach((m) => memberIds.add(m)));
        memberIds.delete(fbUser.uid);

        for (const uid of memberIds) {
          const res = await getUserById(uid);
          if (res.success && res.data) setUserProfile(res.data);
        }
      });
    });

    return () => {
      authUnsub();
      chatUnsub?.();
    };
  }, [setChats, setUserProfile]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ChatWindow />
    </div>
  );
};

export default PopupChatPage;
