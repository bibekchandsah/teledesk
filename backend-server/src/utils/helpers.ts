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

/**
 * Extract client IP address from request or socket
 */
export const extractClientIP = (source: any): string => {
  // Handle Express Request object
  if (source.ip !== undefined || source.connection !== undefined) {
    const forwardedFor = source.headers?.['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      const ip = forwardedFor.split(',')[0]?.trim();
      if (ip) return ip;
    }
    
    return source.ip ||
           source.connection?.remoteAddress ||
           source.socket?.remoteAddress ||
           '127.0.0.1';
  }
  
  // Handle Socket.IO socket object
  if (source.handshake !== undefined) {
    const forwardedFor = source.handshake?.headers?.['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      const ip = forwardedFor.split(',')[0]?.trim();
      if (ip) return ip;
    }
    
    return source.handshake?.address ||
           source.conn?.remoteAddress ||
           '127.0.0.1';
  }
  
  return '127.0.0.1';
};
