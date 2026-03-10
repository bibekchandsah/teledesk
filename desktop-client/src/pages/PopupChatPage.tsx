import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { listenToUserChats, onAuthChange } from '../services/firebaseService';
import { getUserById, getChats } from '../services/apiService';
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
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const { setChats, setUserProfile, setActiveChat, chats } = useChatStore();

  // Whenever chats load, resolve and set activeChat for the target chatId
  useEffect(() => {
    if (!chatId || chats.length === 0) return;
    const found = chats.find((c) => c.chatId === chatId);
    if (found) setActiveChat(found);
  }, [chatId, chats, setActiveChat]);

  useEffect(() => {
    let chatUnsub: (() => void) | null = null;

    const authUnsub = onAuthChange(async (fbUser) => {
      // Already subscribed — nothing to do
      if (chatUnsub) return;
      if (!fbUser) return;

      // Eagerly fetch chats via the REST API so the chat loads immediately
      // without waiting for the Supabase realtime handshake.
      const res = await getChats().catch(() => null);
      if (res?.success && res.data) {
        setChats(res.data);
        // Load member profiles
        const memberIds = new Set<string>();
        res.data.forEach((c) => c.members.forEach((m: string) => memberIds.add(m)));
        memberIds.delete(fbUser.uid);
        for (const uid of memberIds) {
          const r = await getUserById(uid);
          if (r.success && r.data) setUserProfile(r.data);
        }
      }

      // Also set up realtime subscription for live updates
      chatUnsub = listenToUserChats(fbUser.uid, async (chats) => {
        setChats(chats);

        const memberIds = new Set<string>();
        chats.forEach((c) => c.members.forEach((m) => memberIds.add(m)));
        memberIds.delete(fbUser.uid);

        for (const uid of memberIds) {
          const r = await getUserById(uid);
          if (r.success && r.data) setUserProfile(r.data);
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
      <ChatWindow onBack={() => navigate('/chats')} />
    </div>
  );
};

export default PopupChatPage;
