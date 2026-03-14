import { supabase } from '../config/supabase';
import logger from '../utils/logger';

type DraftRow = {
  user_id: string;
  chat_id: string;
  content: string;
  updated_at: string;
};

export interface Draft {
  userId: string;
  chatId: string;
  content: string;
  updatedAt: string;
}

const rowToDraft = (r: DraftRow): Draft => ({
  userId: r.user_id,
  chatId: r.chat_id,
  content: r.content,
  updatedAt: r.updated_at,
});

/**
 * Save or update a draft for a specific chat
 */
export const saveDraft = async (userId: string, chatId: string, content: string): Promise<Draft> => {
  const trimmedContent = content.trim();
  
  // If content is empty, delete the draft
  if (!trimmedContent) {
    await deleteDraft(userId, chatId);
    return {
      userId,
      chatId,
      content: '',
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const { data, error } = await supabase
      .from('drafts')
      .upsert({
        user_id: userId,
        chat_id: chatId,
        content: trimmedContent,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      // If table doesn't exist, log warning but don't crash
      if (error.code === '42P01') {
        logger.warn('Drafts table does not exist. Please run the migration: drafts-migration.sql');
        return {
          userId,
          chatId,
          content: trimmedContent,
          updatedAt: new Date().toISOString(),
        };
      }
      logger.error(`saveDraft error: ${error.message}`);
      throw new Error(error.message);
    }

    return rowToDraft(data as DraftRow);
  } catch (error) {
    logger.error(`saveDraft error: ${(error as Error).message}`);
    throw error;
  }
};

/**
 * Get a draft for a specific chat
 */
export const getDraft = async (userId: string, chatId: string): Promise<Draft | null> => {
  const { data, error } = await supabase
    .from('drafts')
    .select('*')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    logger.error(`getDraft error: ${error.message}`);
    throw new Error(error.message);
  }

  return data ? rowToDraft(data as DraftRow) : null;
};

/**
 * Get all drafts for a user
 */
export const getUserDrafts = async (userId: string): Promise<Draft[]> => {
  const { data, error } = await supabase
    .from('drafts')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    logger.error(`getUserDrafts error: ${error.message}`);
    throw new Error(error.message);
  }

  return ((data ?? []) as DraftRow[]).map(rowToDraft);
};

/**
 * Delete a draft
 */
export const deleteDraft = async (userId: string, chatId: string): Promise<void> => {
  const { error } = await supabase
    .from('drafts')
    .delete()
    .eq('user_id', userId)
    .eq('chat_id', chatId);

  if (error) {
    logger.error(`deleteDraft error: ${error.message}`);
    throw new Error(error.message);
  }
};

/**
 * Delete all drafts for a user (used when deleting account)
 */
export const deleteUserDrafts = async (userId: string): Promise<void> => {
  const { error } = await supabase
    .from('drafts')
    .delete()
    .eq('user_id', userId);

  if (error) {
    logger.error(`deleteUserDrafts error: ${error.message}`);
    throw new Error(error.message);
  }
};
