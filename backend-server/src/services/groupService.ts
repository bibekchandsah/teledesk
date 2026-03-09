import { supabase } from '../config/supabase';
import { Group, Chat } from '../../../shared/types';
import { generateId, now } from '../utils/helpers';
import logger from '../utils/logger';

type GroupRow = {
  group_id: string;
  name: string;
  avatar: string;
  members: string[];
  admins: string[];
  created_at: string;
  description: string;
};

const rowToGroup = (r: GroupRow): Group => ({
  groupId: r.group_id,
  name: r.name,
  avatar: r.avatar,
  members: r.members,
  admins: r.admins,
  createdAt: r.created_at,
  description: r.description,
});

export const createGroup = async (
  name: string,
  creatorUid: string,
  memberUids: string[],
  description?: string,
): Promise<Group> => {
  const groupId = generateId();
  const members = [...new Set([creatorUid, ...memberUids])];

  const groupRow: GroupRow = {
    group_id: groupId,
    name,
    avatar: '',
    members,
    admins: [creatorUid],
    created_at: now(),
    description: description || '',
  };

  await supabase.from('groups').insert(groupRow);

  const chatCreatedAt = now();
  await supabase.from('chats').insert({
    chat_id: groupId,
    type: 'group',
    members,
    created_at: chatCreatedAt,
  });

  logger.info(`Group created: ${groupId} by ${creatorUid}`);
  return rowToGroup(groupRow);
};

export const getGroupById = async (groupId: string, uid: string): Promise<Group | null> => {
  const { data } = await supabase.from('groups').select('*').eq('group_id', groupId).single();
  if (!data) return null;
  const group = rowToGroup(data as GroupRow);
  if (!group.members.includes(uid)) return null;
  return group;
};

export const addGroupMember = async (
  groupId: string,
  adminUid: string,
  newMemberUid: string,
): Promise<void> => {
  const group = await getGroupById(groupId, adminUid);
  if (!group) throw new Error('Group not found or access denied');
  if (!group.admins.includes(adminUid)) throw new Error('Only admins can add members');

  const updatedMembers = [...new Set([...group.members, newMemberUid])];
  await supabase.from('groups').update({ members: updatedMembers }).eq('group_id', groupId);
  await supabase.from('chats').update({ members: updatedMembers }).eq('chat_id', groupId);
};

export const removeGroupMember = async (
  groupId: string,
  requesterUid: string,
  targetUid: string,
): Promise<void> => {
  const { data } = await supabase.from('groups').select('*').eq('group_id', groupId).single();
  if (!data) throw new Error('Group not found');
  const group = rowToGroup(data as GroupRow);

  if (requesterUid !== targetUid && !group.admins.includes(requesterUid)) {
    throw new Error('Only admins can remove other members');
  }

  const updatedMembers = group.members.filter((m) => m !== targetUid);
  const updatedAdmins = group.admins.filter((a) => a !== targetUid);

  await supabase
    .from('groups')
    .update({ members: updatedMembers, admins: updatedAdmins })
    .eq('group_id', groupId);
  await supabase.from('chats').update({ members: updatedMembers }).eq('chat_id', groupId);
};

export const updateGroup = async (
  groupId: string,
  adminUid: string,
  updates: Partial<Pick<Group, 'name' | 'avatar' | 'description'>>,
): Promise<void> => {
  const group = await getGroupById(groupId, adminUid);
  if (!group) throw new Error('Group not found or access denied');
  if (!group.admins.includes(adminUid)) throw new Error('Only admins can update group');

  const dbUpdates: Partial<GroupRow> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.avatar !== undefined) dbUpdates.avatar = updates.avatar;
  if (updates.description !== undefined) dbUpdates.description = updates.description;

  await supabase.from('groups').update(dbUpdates).eq('group_id', groupId);
};
