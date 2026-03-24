import React, { useMemo, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import UserAvatar from './UserAvatar';
import { formatTime, truncate, getMessagePreview, getMessagePreviewIcon, getMessagePreviewColor } from '../utils/formatters';
import { Chat } from '@shared/types';
import { Phone, Video, Image, Film, Mic, Paperclip, PhoneMissed, PhoneOff, Search, ChevronLeft } from 'lucide-react';

const PREVIEW_ICON_MAP = { Phone, Video, Image, Film, Mic, Paperclip, PhoneMissed, PhoneOff } as const;
type PreviewIconKey = keyof typeof PREVIEW_ICON_MAP;

const PreviewIcon: React.FC<{ msg: Parameters<typeof getMessagePreviewIcon>[0]; color?: string }> = ({ msg, color }) => {
  const key = getMessagePreviewIcon(msg) as PreviewIconKey | null;
  if (!key) return null;
  const Icon = PREVIEW_ICON_MAP[key];
  return <Icon size={12} style={{ flexShrink: 0, color: color ?? 'inherit' }} />;
};

interface InCallChatListProps {
  onChatSelect: (chatId: string) => void;
  activeChatId?: string;
  onClose?: () => void;
}

const InCallChatList: React.FC<InCallChatListProps> = ({ onChatSelect, activeChatId, onClose }) => {
  const { chats, onlineUsers, userProfiles, unreadCounts, pinnedChatIds, archivedChatIds, lockedChatIds, nicknames } = useChatStore();
  const { currentUser } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');

  const getChatDisplayInfo = (chat: Chat) => {
    if (chat.type === 'private') {
      const isSelfChat = chat.members.every((m: string) => m === currentUser?.uid);
      const otherUid = isSelfChat
        ? currentUser?.uid
        : chat.members.find((m: string) => m !== currentUser?.uid);

      const profile = otherUid === currentUser?.uid
        ? currentUser
        : (otherUid ? userProfiles[otherUid] : null);

      const isDeletedUser = !isSelfChat && profile?.isDeleted;
      const isPeerVisible = profile?.showActiveStatus !== false;

      let baseName: string;
      if (isDeletedUser) {
        baseName = nicknames[otherUid!] || profile?.name || 'Deleted User';
      } else if (isSelfChat) {
        baseName = `${profile?.name || profile?.email?.split('@')[0] || 'Unknown'} (You)`;
      } else {
        baseName = profile?.name || profile?.email?.split('@')[0] || 'Unknown';
      }

      const displayName = (!isSelfChat && !isDeletedUser && otherUid && nicknames[otherUid])
        ? nicknames[otherUid]
        : baseName;

      const online = isSelfChat
        ? currentUser?.showActiveStatus !== false
        : !!(otherUid && onlineUsers.has(otherUid) && isPeerVisible);

      return {
        name: displayName,
        avatar: isDeletedUser ? '' : profile?.avatar,
        online: isDeletedUser ? false : online,
      };
    }
    return { name: chat.chatId, avatar: undefined, online: false };
  };

  const filteredChats = useMemo(() => {
    // Show only non-archived, non-locked chats for the in-call sidebar for simplicity
    let list = chats.filter(c => !archivedChatIds.includes(c.chatId) && !lockedChatIds.includes(c.chatId));
    
    // Only show chats with at least one message
    list = list.filter(c => c.lastMessage || c.chatId === activeChatId);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((chat) => {
        const info = getChatDisplayInfo(chat);
        return (
          info.name.toLowerCase().includes(q) ||
          chat.lastMessage?.content.toLowerCase().includes(q)
        );
      });
    }

    return [...list].sort((a, b) => {
      const aP = pinnedChatIds.includes(a.chatId) ? 0 : 1;
      const bP = pinnedChatIds.includes(b.chatId) ? 0 : 1;
      if (aP !== bP) return aP - bP;
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });
  }, [chats, searchQuery, currentUser, userProfiles, onlineUsers, nicknames, pinnedChatIds, archivedChatIds, lockedChatIds, activeChatId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-secondary)' }}>
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' }}>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={20} />
          </button>
        )}
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Chats</h2>
      </div>

      <div style={{ padding: '12px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: 20,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredChats.map((chat) => {
          const info = getChatDisplayInfo(chat);
          const unread = unreadCounts[chat.chatId] || 0;
          const isActive = activeChatId === chat.chatId;

          return (
            <div
              key={chat.chatId}
              onClick={() => onChatSelect(chat.chatId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                cursor: 'pointer',
                backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <UserAvatar name={info.name} avatar={info.avatar} size={40} online={chat.type === 'private' ? info.online : undefined} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: unread > 0 ? 700 : 500, fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {info.name}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {chat.lastMessage?.timestamp ? formatTime(chat.lastMessage.timestamp) : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <span style={{ 
                    display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, 
                    color: chat.lastMessage ? (getMessagePreviewColor(chat.lastMessage) ?? 'var(--text-secondary)') : 'var(--text-secondary)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' 
                  }}>
                    {chat.lastMessage && <PreviewIcon msg={chat.lastMessage} color={getMessagePreviewColor(chat.lastMessage) ?? undefined} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{chat.lastMessage ? truncate(getMessagePreview(chat.lastMessage), 35) : 'No messages'}</span>
                  </span>
                  {unread > 0 && (
                    <span style={{ backgroundColor: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default InCallChatList;
