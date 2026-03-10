import { supabase } from '../config/supabase';
import { now } from '../utils/helpers';

type SavedMessageRow = {
  uid: string;
  message_id: string;
  entry: unknown; // Stored as jsonb
  created_at: string;
  updated_at: string;
};

const rowToEntry = (r: SavedMessageRow): any => {
  // entry is stored exactly as the client sends it (SavedMessage shape).
  // We return it as-is so the client can render without mapping.
  return r.entry as any;
};

export const listSavedMessages = async (uid: string): Promise<any[]> => {
  const { data, error } = await supabase
    .from('saved_messages')
    .select('*')
    .eq('uid', uid)
    .order('updated_at', { ascending: true })
    .limit(5000);

  if (error) throw new Error(error.message);
  return ((data ?? []) as SavedMessageRow[]).map(rowToEntry);
};

export const upsertSavedMessageForUser = async (uid: string, entry: any): Promise<void> => {
  const updatedAt = (entry?.updatedAt as string) || (entry?.savedAt as string) || now();
  const createdAt = (entry?.savedAt as string) || now();

  const { error } = await supabase
    .from('saved_messages')
    .upsert(
      {
        uid,
        message_id: String(entry?.messageId || ''),
        entry,
        created_at: createdAt,
        updated_at: updatedAt,
      },
      { onConflict: 'uid,message_id' },
    );

  if (error) throw new Error(error.message);
};

export const softDeleteSavedMessage = async (uid: string, messageId: string): Promise<any> => {
  // We keep a tombstone record so deletions can sync across devices.
  const tombstone = {
    messageId,
    chatId: '__saved__',
    senderId: uid,
    content: '',
    type: 'text',
    timestamp: now(),
    readBy: [uid],
    isNote: false,
    savedAt: now(),
    updatedAt: now(),
    deleted: true,
  };
  await upsertSavedMessageForUser(uid, tombstone);
  return tombstone;
};

