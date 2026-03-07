import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique ID
 */
export const generateId = (): string => uuidv4();

/**
 * Get current UTC timestamp as ISO string
 */
export const now = (): string => new Date().toISOString();

/**
 * Sanitize a string to prevent injection attacks
 */
export const sanitizeString = (str: string): string =>
  str.replace(/[<>]/g, '').trim().slice(0, 4096);

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase());

/**
 * Extract bearer token from Authorization header
 */
export const extractBearerToken = (authHeader: string | undefined): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.split(' ')[1] || null;
};
