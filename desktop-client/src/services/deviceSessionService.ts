import { DeviceSession, ApiResponse } from '@shared/types';
import { getIdToken } from './firebaseService';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Create authenticated headers
const createHeaders = async (): Promise<HeadersInit> => {
  const token = await getIdToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

export const getDeviceSessions = async (): Promise<ApiResponse<DeviceSession[]>> => {
  try {
    const response = await fetch(`${API_BASE}/api/users/device-sessions`, {
      method: 'GET',
      headers: await createHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { 
        success: false, 
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}` 
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to get device sessions:', error);
    return { success: false, error: 'Network error' };
  }
};

export const revokeDeviceSession = async (sessionId: string): Promise<ApiResponse> => {
  try {
    const response = await fetch(`${API_BASE}/api/users/device-sessions/${sessionId}`, {
      method: 'DELETE',
      headers: await createHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { 
        success: false, 
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}` 
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to revoke device session:', error);
    return { success: false, error: 'Network error' };
  }
};

export const revokeAllOtherSessions = async (): Promise<ApiResponse<{ revokedCount: number }>> => {
  try {
    const response = await fetch(`${API_BASE}/api/users/device-sessions/others/all`, {
      method: 'DELETE',
      headers: await createHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { 
        success: false, 
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}` 
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to revoke all other sessions:', error);
    return { success: false, error: 'Network error' };
  }
};

export const cleanupDuplicateSessions = async (): Promise<ApiResponse<{ sessionCount: number }>> => {
  try {
    const response = await fetch(`${API_BASE}/api/users/device-sessions/cleanup`, {
      method: 'POST',
      headers: await createHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { 
        success: false, 
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}` 
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to cleanup duplicate sessions:', error);
    return { success: false, error: 'Network error' };
  }
};

export const getDebugSessionInfo = async (): Promise<ApiResponse<any>> => {
  try {
    const response = await fetch(`${API_BASE}/api/users/device-sessions/debug`, {
      method: 'GET',
      headers: await createHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { 
        success: false, 
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}` 
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to get debug session info:', error);
    return { success: false, error: 'Network error' };
  }
};