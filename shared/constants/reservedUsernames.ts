// Reserved usernames that cannot be registered by public users
export const RESERVED_USERNAMES = new Set([
  // Company/Brand
  'admin',
  'administrator',
  'teledesk',
  'support',
  'help',
  'info',
  'contact',
  'team',
  'staff',
  'official',
  'verified',
  
  // System
  'system',
  'root',
  'api',
  'bot',
  'service',
  'noreply',
  'no-reply',
  'mailer',
  'daemon',
  
  // Common routes/pages
  'about',
  'terms',
  'privacy',
  'settings',
  'profile',
  'user',
  'users',
  'login',
  'logout',
  'signup',
  'signin',
  'register',
  'auth',
  'account',
  'dashboard',
  'home',
  'index',
  
  // Moderation
  'moderator',
  'mod',
  'owner',
  'superuser',
  'webmaster',
  
  // Abuse prevention
  'null',
  'undefined',
  'anonymous',
  'guest',
  'test',
  'demo',
  'example',
]);

// Validate username format
export function isValidUsernameFormat(username: string): boolean {
  // Must be 3-20 characters, alphanumeric + underscore, start with letter
  const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
  return usernameRegex.test(username);
}

// Check if username is reserved
export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}
