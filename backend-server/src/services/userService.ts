import { db } from '../config/firebase';
import { User } from '../../../shared/types';
import { now } from '../utils/helpers';
import logger from '../utils/logger';

/**
 * Creates or updates a user profile in Firestore after authentication
 */
export const upsertUser = async (
  uid: string,
  data: Partial<User>,
): Promise<User> => {
  const userRef = db.collection('users').doc(uid);
  const existing = await userRef.get();

  if (!existing.exists) {
    const newUser: User = {
      uid,
      name: data.name || 'Unknown',
      email: data.email || '',
      avatar: data.avatar || '',
      createdAt: now(),
      lastSeen: now(),
      onlineStatus: 'online',
    };
    await userRef.set(newUser);
    logger.info(`New user created: ${uid}`);
    return newUser;
  }

  await userRef.update({ lastSeen: now(), onlineStatus: 'online', ...data });
  return (await userRef.get()).data() as User;
};

/**
 * Get a user profile by UID
 */
export const getUserById = async (uid: string): Promise<User | null> => {
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) return null;
  return doc.data() as User;
};

/**
 * Search users by name or email (partial match)
 */
export const searchUsers = async (query: string, requestingUid: string): Promise<User[]> => {
  const snapshot = await db.collection('users').get();
  const results: User[] = [];
  const q = query.toLowerCase();

  snapshot.forEach((doc) => {
    const user = doc.data() as User;
    if (
      user.uid !== requestingUid &&
      (user.name?.toLowerCase().includes(q) || user.email?.toLowerCase().includes(q))
    ) {
      results.push(user);
    }
  });

  return results.slice(0, 20);
};

/**
 * Update a user's active-status-visibility preference without touching other fields
 */
export const updateActiveStatusSetting = async (
  uid: string,
  showActiveStatus: boolean,
): Promise<void> => {
  await db.collection('users').doc(uid).update({ showActiveStatus });
};

export const updatePinnedChats = async (uid: string, pinnedChatIds: string[]): Promise<string[]> => {
  await db.collection('users').doc(uid).update({ pinnedChatIds });
  return pinnedChatIds;
};

export const updateArchivedChats = async (uid: string, archivedChatIds: string[]): Promise<string[]> => {
  await db.collection('users').doc(uid).update({ archivedChatIds });
  return archivedChatIds;
};

/**
 * Update user online presence status in Firestore
 */
export const updatePresence = async (
  uid: string,
  status: 'online' | 'offline',
): Promise<void> => {
  await db.collection('users').doc(uid).update({
    onlineStatus: status,
    lastSeen: now(),
  });
};
