import { uploadFile } from './firebaseService';
import { APP_CONFIG } from '@shared/constants/config';
import { v4 as uuidv4 } from 'uuid';
export { formatFileSize } from '../utils/formatters';

export interface FileUploadResult {
  url: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

/**
 * Determine message type from MIME
 */
export const getMessageTypeFromMime = (
  mimeType: string,
): 'image' | 'video' | 'audio' | 'file' => {
  if (APP_CONFIG.SUPPORTED_IMAGE_TYPES.includes(mimeType as never)) return 'image';
  if (APP_CONFIG.SUPPORTED_VIDEO_TYPES.includes(mimeType as never)) return 'video';
  if (APP_CONFIG.SUPPORTED_AUDIO_TYPES.includes(mimeType as never)) return 'audio';
  return 'file';
};

/**
 * Validate file before upload
 */
export const validateFile = (file: File): { valid: boolean; error?: string } => {
  const maxBytes = APP_CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { valid: false, error: `File exceeds ${APP_CONFIG.MAX_FILE_SIZE_MB}MB limit` };
  }
  return { valid: true };
};

/**
 * Upload a file to Cloudflare R2 via backend API and return metadata
 */
export const uploadChatFile = (
  file: File,
  chatId: string,
  onProgress: (progress: number) => void,
): Promise<FileUploadResult> => {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop();
    const storagePath = `chats/${chatId}/${uuidv4()}.${ext}`;

    uploadFile(file, storagePath, ({ progress, downloadURL, error }) => {
      if (error) {
        reject(error);
        return;
      }
      onProgress(progress);
      if (downloadURL) {
        resolve({
          url: downloadURL,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        });
      }
    });
  });
};


