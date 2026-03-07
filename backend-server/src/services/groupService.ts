import { db } from '../config/firebase';
import { Group, Chat } from '../../../shared/types';
import { generateId, now } from '../utils/helpers';
import logger from '../utils/logger';

/**
 * Create a new group chat
 */
export const createGroup = async (
  name: string,
  creatorUid: string,
  memberUids: string[],
  description?: string,
): Promise<Group> => {
  const groupId = generateId();
  const members = [...new Set([creatorUid, ...memberUids])];

  const group: Group = {
    groupId,
    name,
    avatar: '',
    members,
    admins: [creatorUid],
    createdAt: now(),
    description: description || '',
  };

  await db.collection('groups').doc(groupId).set(group);

  // Create corresponding chat entry
  const chat: Chat = {
    chatId: groupId,
    type: 'group',
    members,
    createdAt: now(),
  };
  await db.collection('chats').doc(groupId).set(chat);

  logger.info(`Group created: ${groupId} by ${creatorUid}`);
  return group;
};

/**
 * Get a group by ID, verifying membership
 */
export const getGroupById = async (
  groupId: string,
  uid: string,
): Promise<Group | null> => {
  const doc = await db.collection('groups').doc(groupId).get();
  if (!doc.exists) return null;
  const group = doc.data() as Group;
  if (!group.members.includes(uid)) return null;
  return group;
};

/**
 * Add a member to a group (admin only)
 */
export const addGroupMember = async (
  groupId: string,
  adminUid: string,
  newMemberUid: string,
): Promise<void> => {
  const group = await getGroupById(groupId, adminUid);
  if (!group) throw new Error('Group not found or access denied');
  if (!group.admins.includes(adminUid)) throw new Error('Only admins can add members');

  const updatedMembers = [...new Set([...group.members, newMemberUid])];
  await db.collection('groups').doc(groupId).update({ members: updatedMembers });
  await db.collection('chats').doc(groupId).update({ members: updatedMembers });
};

/**
 * Remove a member from a group (admin or self-leave)
 */
export const removeGroupMember = async (
  groupId: string,
  requesterUid: string,
  targetUid: string,
): Promise<void> => {
  const doc = await db.collection('groups').doc(groupId).get();
  if (!doc.exists) throw new Error('Group not found');
  const group = doc.data() as Group;

  if (requesterUid !== targetUid && !group.admins.includes(requesterUid)) {
    throw new Error('Only admins can remove other members');
  }

  const updatedMembers = group.members.filter((m) => m !== targetUid);
  const updatedAdmins = group.admins.filter((a) => a !== targetUid);

  await db.collection('groups').doc(groupId).update({
    members: updatedMembers,
    admins: updatedAdmins,
  });
  await db.collection('chats').doc(groupId).update({ members: updatedMembers });
};

/**
 * Update group metadata (admin only)
 */
export const updateGroup = async (
  groupId: string,
  adminUid: string,
  updates: Partial<Pick<Group, 'name' | 'avatar' | 'description'>>,
): Promise<void> => {
  const group = await getGroupById(groupId, adminUid);
  if (!group) throw new Error('Group not found or access denied');
  if (!group.admins.includes(adminUid)) throw new Error('Only admins can update group');
  await db.collection('groups').doc(groupId).update(updates);
};
