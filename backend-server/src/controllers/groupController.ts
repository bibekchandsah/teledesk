import { Request, Response } from 'express';
import { createGroup, getGroupById, addGroupMember, removeGroupMember, updateGroup } from '../services/groupService';
import logger from '../utils/logger';

/**
 * POST /api/groups
 */
export const createGroupHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, memberUids, description } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      res.status(400).json({ success: false, error: 'Group name is required' });
      return;
    }
    const members: string[] = Array.isArray(memberUids) ? memberUids : [];
    const group = await createGroup(name.trim(), req.user!.uid, members, description);
    res.status(201).json({ success: true, data: group });
  } catch (error) {
    logger.error(`createGroup error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to create group' });
  }
};

/**
 * GET /api/groups/:groupId
 */
export const getGroupHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const group = await getGroupById(req.params.groupId, req.user!.uid);
    if (!group) {
      res.status(404).json({ success: false, error: 'Group not found or access denied' });
      return;
    }
    res.json({ success: true, data: group });
  } catch (error) {
    logger.error(`getGroup error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to get group' });
  }
};

/**
 * POST /api/groups/:groupId/members
 */
export const addMemberHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { memberUid } = req.body;
    await addGroupMember(req.params.groupId, req.user!.uid, memberUid);
    res.json({ success: true, message: 'Member added' });
  } catch (error) {
    logger.error(`addMember error: ${(error as Error).message}`);
    res.status(400).json({ success: false, error: (error as Error).message });
  }
};

/**
 * DELETE /api/groups/:groupId/members/:memberUid
 */
export const removeMemberHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    await removeGroupMember(req.params.groupId, req.user!.uid, req.params.memberUid);
    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    logger.error(`removeMember error: ${(error as Error).message}`);
    res.status(400).json({ success: false, error: (error as Error).message });
  }
};

/**
 * PUT /api/groups/:groupId
 */
export const updateGroupHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, avatar, description } = req.body;
    await updateGroup(req.params.groupId, req.user!.uid, { name, avatar, description });
    res.json({ success: true, message: 'Group updated' });
  } catch (error) {
    logger.error(`updateGroup error: ${(error as Error).message}`);
    res.status(400).json({ success: false, error: (error as Error).message });
  }
};
