import { Request, Response } from 'express';
import { upsertUser, getUserById, searchUsers, updatePinnedChats, updateArchivedChats } from '../services/userService';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

/**
 * POST /api/auth/sync
 * Called after Firebase client login to sync user profile to Firestore
 */
export const syncUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, avatar } = req.body;
    const uid = req.user!.uid;

    // For existing users, only sync email (name & avatar may have been customised
    // by the user and must not be overwritten with Firebase Auth values on every refresh).
    const existing = await getUserById(uid);
    const updateData = existing
      ? { email }
      : { name, email, avatar };

    const user = await upsertUser(uid, updateData);
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`syncUser error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to sync user' });
  }
};

/**
 * PATCH /api/users/me
 * Update display name and/or avatar URL
 */
export const updateMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { name, avatar, showActiveStatus } = req.body as { name?: string; avatar?: string; showActiveStatus?: boolean };
    const updates: Partial<import('../../../shared/types').User> = {};
    if (name !== undefined) updates.name = String(name).trim().slice(0, 100);
    if (avatar !== undefined) updates.avatar = String(avatar);
    if (showActiveStatus !== undefined) updates.showActiveStatus = Boolean(showActiveStatus);
    const user = await upsertUser(uid, updates);
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`updateMe error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
};

/**
 * POST /api/users/avatar
 * Upload a profile picture; returns the public download URL.
 */
export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file provided' });
      return;
    }
    const uid = req.user!.uid;
    const ext = (req.file.mimetype.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
    const filename = `${uid}.${ext}`;
    const uploadsDir = path.resolve('uploads/avatars');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const destPath = path.join(uploadsDir, filename);
    fs.writeFileSync(destPath, req.file.buffer);
    const host = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const downloadURL = `${host}/uploads/avatars/${filename}`;
    res.json({ success: true, data: { url: downloadURL } });
  } catch (error) {
    logger.error(`uploadAvatar error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to upload avatar' });
  }
};

/**
 * GET /api/users/me
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserById(req.user!.uid);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`getMe error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get user profile' });
  }
};

/**
 * GET /api/users/:uid
 */
export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserById(req.params.uid);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error(`getUserProfile error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
};

/**
 * GET /api/users/search?q=query
 */
export const searchUsersHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query || query.length < 2) {
      res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
      return;
    }
    const users = await searchUsers(query, req.user!.uid);
    res.json({ success: true, data: users });
  } catch (error) {
    logger.error(`searchUsers error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};

// PATCH /api/users/me/pinned-chats
export const updatePinnedChatsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { pinnedChatIds } = req.body as { pinnedChatIds: string[] };
    if (!Array.isArray(pinnedChatIds)) {
      res.status(400).json({ success: false, error: 'pinnedChatIds must be an array' });
      return;
    }
    const result = await updatePinnedChats(uid, pinnedChatIds);
    res.json({ success: true, data: { pinnedChatIds: result } });
  } catch (error) {
    logger.error(`updatePinnedChats error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to update pinned chats' });
  }
};

// PATCH /api/users/me/archived-chats
export const updateArchivedChatsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { archivedChatIds } = req.body as { archivedChatIds: string[] };
    if (!Array.isArray(archivedChatIds)) {
      res.status(400).json({ success: false, error: 'archivedChatIds must be an array' });
      return;
    }
    const result = await updateArchivedChats(uid, archivedChatIds);
    res.json({ success: true, data: { archivedChatIds: result } });
  } catch (error) {
    logger.error(`updateArchivedChats error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to update archived chats' });
  }
};
