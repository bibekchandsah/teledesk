import CryptoJS from 'crypto-js';
import { ENCRYPTION_CONFIG } from '@shared/constants/config';

// ─── Key Management ────────────────────────────────────────────────────────

/**
 * Generate a new AES-256 encryption key for a chat
 */
export const generateChatKey = (): string => {
  return CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Base64);
};

/**
 * Store encryption key for a specific chat in sessionStorage
 */
export const storeChatKey = (chatId: string, key: string): void => {
  sessionStorage.setItem(`${ENCRYPTION_CONFIG.KEY_STORAGE_PREFIX}${chatId}`, key);
};

/**
 * Retrieve encryption key for a chat
 */
export const getChatKey = (chatId: string): string | null => {
  return sessionStorage.getItem(`${ENCRYPTION_CONFIG.KEY_STORAGE_PREFIX}${chatId}`);
};

/**
 * Remove encryption key (e.g. on logout)
 */
export const clearAllKeys = (): void => {
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(ENCRYPTION_CONFIG.KEY_STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => sessionStorage.removeItem(k));
};

// ─── Encryption / Decryption ───────────────────────────────────────────────

/**
 * Encrypt a plaintext string with AES-256
 */
export const encryptMessage = (plaintext: string, key: string): string => {
  return CryptoJS.AES.encrypt(plaintext, key).toString();
};

/**
 * Decrypt an AES-256 ciphertext
 */
export const decryptMessage = (ciphertext: string, key: string): string => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, key);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return '[Encrypted message]';
  }
};

/**
 * Encrypt a message for a specific chat (auto-retrieves key)
 */
export const encryptForChat = (chatId: string, plaintext: string): { encrypted: string; hasKey: boolean } => {
  const key = getChatKey(chatId);
  if (!key) return { encrypted: plaintext, hasKey: false };
  return { encrypted: encryptMessage(plaintext, key), hasKey: true };
};

/**
 * Decrypt a message for a specific chat (auto-retrieves key)
 */
export const decryptForChat = (chatId: string, ciphertext: string): string => {
  const key = getChatKey(chatId);
  if (!key) return ciphertext;
  return decryptMessage(ciphertext, key);
};
