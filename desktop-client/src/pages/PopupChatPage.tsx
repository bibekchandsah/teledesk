import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { getUserById, getChats } from '../services/apiService';
import { useAuthStore } from '../store/authStore';
import { Loader2 } from 'lucide-react';
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
  const { isAuthenticated, isLoading, currentUser } = useAuthStore();

  // Whenever chats load, resolve and set activeChat for the target chatId
  useEffect(() => {
    if (!chatId || chats.length === 0) return;
    const found = chats.find((c) => c.chatId === chatId);
    if (found) setActiveChat(found);
  }, [chatId, chats, setActiveChat]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    
    let chatUnsub: (() => void) | null = null;
    let isSubscribed = false;

    const loadData = async () => {
      if (isSubscribed) return;
      isSubscribed = true;

      // Eagerly fetch chats via the REST API
      try {
        const res = await getChats();
        if (res.success && res.data) {
          setChats(res.data);
          // Load member profiles
          const memberIds = new Set<string>();
          res.data.forEach((c) => c.members.forEach((m: string) => memberIds.add(m)));
          memberIds.delete(currentUser.uid);
          for (const uid of memberIds) {
            const r = await getUserById(uid);
            if (r.success && r.data) setUserProfile(r.data);
          }
        }
      } catch (error) {
        console.error('[Popup] Failed to load initial chats:', error);
      }

      // Also set up realtime subscription for live updates
      try {
        const { listenToUserChats } = await import('../services/firebaseService');
        chatUnsub = listenToUserChats(currentUser.uid, async (updatedChats) => {
          setChats(updatedChats);
          const memberIds = new Set<string>();
          updatedChats.forEach((c) => c.members.forEach((m) => memberIds.add(m)));
          memberIds.delete(currentUser.uid);

          for (const uid of memberIds) {
            const r = await getUserById(uid);
            if (r.success && r.data) setUserProfile(r.data);
          }
        });
      } catch (error) {
        console.error('[Popup] Failed to start realtime listener:', error);
      }
    };

    loadData();

    return () => {
      chatUnsub?.();
    };
  }, [isAuthenticated, currentUser?.uid, setChats, setUserProfile]);

  if (isLoading || (!isAuthenticated && !currentUser)) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)' }}>
        <Loader2 className="animate-spin" size={48} style={{ opacity: 0.5, color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  if (isAuthenticated && !currentUser) {
     // Wait for profile hydration
     return null;
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ChatWindow onBack={() => navigate('/chats')} />
    </div>
  );
};

export default PopupChatPage;
