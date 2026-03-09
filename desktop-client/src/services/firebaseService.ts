// Firebase is now used ONLY for authentication (Google / GitHub / email).
// Messages and user data are stored in Supabase PostgreSQL.
// File uploads go through the backend API → Cloudflare R2.
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { User, Message, Chat } from '@shared/types';

// ─── Firebase Auth Configuration ──────────────────────────────────────────
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app: FirebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

// ─── Supabase Realtime Client (anon key – read-only subscriptions) ─────────
// The anon key is safe to expose; actual writes always go through the backend
// (service-role key). Configure RLS so users can only read their own rows.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let _supabase: SupabaseClient | null = null;
const getSupabase = (): SupabaseClient => {
  if (!_supabase) _supabase = createClient(supabaseUrl, supabaseAnonKey);
  return _supabase;
};

// ─── OAuth Providers ───────────────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

const githubProvider = new GithubAuthProvider();
githubProvider.addScope('read:user');
githubProvider.addScope('user:email');

// ─── Auth Functions ────────────────────────────────────────────────────────
export const signInWithGoogle = async (): Promise<FirebaseUser> => {
  const result = await signInWithPopup(firebaseAuth, googleProvider);
  return result.user;
};

export const signInWithGithub = async (): Promise<FirebaseUser> => {
  const result = await signInWithPopup(firebaseAuth, githubProvider);
  return result.user;
};

export const signInWithEmail = async (email: string, password: string): Promise<FirebaseUser> => {
  const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return result.user;
};

export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName: string,
): Promise<FirebaseUser> => {
  const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  await updateProfile(result.user, { displayName });
  return result.user;
};

export const signOutUser = async (): Promise<void> => {
  await signOut(firebaseAuth);
};

export const onAuthChange = (
  callback: (user: FirebaseUser | null) => void,
): (() => void) => {
  return onAuthStateChanged(firebaseAuth, callback);
};

export const getIdToken = async (): Promise<string | null> => {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  return user.getIdToken();
};

// ─── Supabase Realtime – Chat list ─────────────────────────────────────────
// Fetches the initial list via backend HTTP, then pushes incremental updates
// from Supabase Realtime postgres changes so the UI stays live.
export const listenToUserChats = (
  uid: string,
  callback: (chats: Chat[]) => void,
): (() => void) => {
  const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  let currentChats: Chat[] = [];

  const fetchAndNotify = async () => {
    const token = await getIdToken();
    try {
      const res = await fetch(`${BASE_URL}/api/chats`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        currentChats = data.data as Chat[];
        callback(currentChats);
      }
    } catch {
      // Network error – keep last known state
    }
  };

  // Initial load
  fetchAndNotify();

  // Realtime subscription – re-fetch on any change in chats table
  const sb = getSupabase();
  const channel: RealtimeChannel = sb
    .channel(`user-chats:${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chats' },
      () => { fetchAndNotify(); },
    )
    .subscribe();

  return () => { sb.removeChannel(channel); };
};

// ─── Supabase Realtime – Messages ──────────────────────────────────────────
export const listenToMessages = (
  chatId: string,
  callback: (messages: Message[]) => void,
  onError?: () => void,
  limitCount = 30,
): (() => void) => {
  const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

  const fetchAndNotify = async () => {
    const token = await getIdToken();
    try {
      const res = await fetch(
        `${BASE_URL}/api/chats/${chatId}/messages?limit=${limitCount}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        callback(data.data as Message[]);
      } else {
        onError?.();
      }
    } catch {
      onError?.();
    }
  };

  fetchAndNotify();

  const sb = getSupabase();
  const channel: RealtimeChannel = sb
    .channel(`chat-messages:${chatId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      () => { fetchAndNotify(); },
    )
    .subscribe();

  return () => { sb.removeChannel(channel); };
};

// ─── User Profile (via backend API — no direct DB writes from client) ──────
export const getUserProfile = async (uid: string): Promise<User | null> => {
  const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const token = await getIdToken();
  try {
    const res = await fetch(`${BASE_URL}/api/users/${uid}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json();
    return data.success ? (data.data as User) : null;
  } catch {
    return null;
  }
};

// Retained as a best-effort fallback for AuthContext when backend is unavailable.
// Uses /api/users/sync which upserts the user in Supabase.
export const upsertUserProfile = async (fbUser: FirebaseUser): Promise<User> => {
  const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const token = await getIdToken();
  const now = new Date().toISOString();
  if (token) {
    try {
      const res = await fetch(`${BASE_URL}/api/users/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fbUser.displayName || 'User',
          email: fbUser.email || '',
          avatar: fbUser.photoURL || '',
        }),
      });
      const data = await res.json();
      if (data.success && data.data) return data.data as User;
    } catch {
      // Fall through to local profile
    }
  }
  return {
    uid: fbUser.uid,
    name: fbUser.displayName || 'User',
    email: fbUser.email || '',
    avatar: fbUser.photoURL || '',
    createdAt: now,
    lastSeen: now,
    onlineStatus: 'online',
  };
};

// getOrCreatePrivateChatDirect now goes through the backend API
export const getOrCreatePrivateChatDirect = async (
  myUid: string,
  targetUid: string,
): Promise<Chat> => {
  const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const token = await getIdToken();
  const res = await fetch(`${BASE_URL}/api/chats/private`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ targetUid: myUid === targetUid ? myUid : targetUid }),
  });
  const data = await res.json();
  if (data.success && data.data) return data.data as Chat;
  throw new Error(data.error || 'Failed to create chat');
};

// ─── Upload Progress type (kept for fileService.ts compatibility) ──────────
export interface UploadProgress {
  progress: number;
  downloadURL?: string;
  error?: Error;
}

// uploadFile now proxies to the backend /api/files/upload → Cloudflare R2
export const uploadFile = (
  file: File,
  storagePath: string,
  onProgress: (progress: UploadProgress) => void,
): { cancel: () => void } => {
  const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const controller = new AbortController();

  const chatId = storagePath.split('/')[1] ?? 'misc';
  const formData = new FormData();
  formData.append('file', file);
  formData.append('chatId', chatId);

  (async () => {
    onProgress({ progress: 10 });
    const token = await getIdToken();
    try {
      onProgress({ progress: 50 });
      const res = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        onProgress({ progress: 100, downloadURL: data.data.url });
      } else {
        onProgress({ progress: 0, error: new Error(data.error || 'Upload failed') });
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onProgress({ progress: 0, error: err as Error });
      }
    }
  })();

  return { cancel: () => controller.abort() };
};


