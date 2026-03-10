import { getIdToken } from './firebaseService';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export interface UsernameCheckResult {
  available: boolean;
  reason?: 'invalid_format' | 'reserved' | 'taken';
  message: string;
}

export const checkUsernameAvailability = async (username: string): Promise<UsernameCheckResult> => {
  try {
    const response = await fetch(`${BASE_URL}/api/users/check-username/${encodeURIComponent(username)}`);
    const data = await response.json();
    
    if (data.success && data.data) {
      return data.data;
    }
    
    return {
      available: false,
      message: 'Failed to check username availability',
    };
  } catch (error) {
    console.error('Username check error:', error);
    return {
      available: false,
      message: 'Failed to check username availability',
    };
  }
};

export const updateUsername = async (username: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const token = await getIdToken();
    const response = await fetch(`${BASE_URL}/api/users/me/username`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ username }),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      return { success: false, error: data.error || 'Failed to update username' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Update username error:', error);
    return { success: false, error: 'Failed to update username' };
  }
};

// Client-side validation (matches backend)
export function isValidUsernameFormat(username: string): boolean {
  const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
  return usernameRegex.test(username);
}
