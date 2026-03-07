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
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, query, where, limit, orderBy, onSnapshot, updateDoc, Unsubscribe } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, UploadTask } from 'firebase/storage';
import { User, Message, Chat } from '@shared/types';

// ─── Firebase Configuration ────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// ─── Initialize Firebase ───────────────────────────────────────────────────
const app: FirebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);
export const firestoreDb = getFirestore(app);
export const firebaseStorage = getStorage(app);

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
): Unsubscribe => {
  return onAuthStateChanged(firebaseAuth, callback);
};

export const getIdToken = async (): Promise<string | null> => {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  return user.getIdToken();
};

// ─── Firebase Storage Upload ───────────────────────────────────────────────

export const uploadAvatarFile = (
  file: File,
  uid: string,
  onProgress?: (percent: number) => void,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const ext = (file.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
    const storageRef = ref(firebaseStorage, `avatars/${uid}.${ext}`);
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref)),
    );
  });
};

// ─── Firestore User Functions ──────────────────────────────────────────────

export const getUserProfile = async (uid: string): Promise<User | null> => {
  const docRef = doc(firestoreDb, 'users', uid);
  const snap = await getDoc(docRef);
  return snap.exists() ? (snap.data() as User) : null;
};

// Write user profile directly to Firestore from client (used as fallback when backend is unavailable)
export const upsertUserProfile = async (fbUser: FirebaseUser): Promise<User> => {
  const now = new Date().toISOString();
  const userRef = doc(firestoreDb, 'users', fbUser.uid);
  const existing = await getDoc(userRef);

  if (!existing.exists()) {
    const newUser: User = {
      uid: fbUser.uid,
      name: fbUser.displayName || 'User',
      email: fbUser.email || '',
      avatar: fbUser.photoURL || '',
      createdAt: now,
      lastSeen: now,
      onlineStatus: 'online',
    };
    await setDoc(userRef, newUser);
    return newUser;
  }

  await updateDoc(userRef, { lastSeen: now, onlineStatus: 'online' });
  return (await getDoc(userRef)).data() as User;
};

export const listenToUserProfile = (
  uid: string,
  callback: (user: User) => void,
): Unsubscribe => {
  return onSnapshot(doc(firestoreDb, 'users', uid), (snap) => {
    if (snap.exists()) callback(snap.data() as User);
  });
};

// ─── Firestore Chat Functions ──────────────────────────────────────────────

// Generate a random 20-char ID (same algo as the backend)
const genId = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);

export const getOrCreatePrivateChatDirect = async (
  myUid: string,
  targetUid: string,
): Promise<Chat> => {
  // Check if a private chat already exists between these two users
  const existing = await getDocs(
    query(
      collection(firestoreDb, 'chats'),
      where('type', '==', 'private'),
      where('members', 'array-contains', myUid),
    ),
  );
  for (const d of existing.docs) {
    const c = d.data() as Chat;
    if (c.members.includes(targetUid)) return c;
  }
  // Create a new one
  const chatId = genId();
  const chat: Chat = {
    chatId,
    type: 'private',
    members: [myUid, targetUid],
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(firestoreDb, 'chats', chatId), chat);
  return chat;
};

export const listenToUserChats = (
  uid: string,
  callback: (chats: Chat[]) => void,
): Unsubscribe => {
  const q = query(
    collection(firestoreDb, 'chats'),
    where('members', 'array-contains', uid),
    limit(100),
  );

  return onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs
      .map((d) => d.data() as Chat)
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
    callback(chats);
  });
};

export const listenToMessages = (
  chatId: string,
  callback: (messages: Message[]) => void,
  onError?: () => void,
  limitCount = 30,
): Unsubscribe => {
  const q = query(
    collection(firestoreDb, 'messages'),
    where('chatId', '==', chatId),
    orderBy('timestamp', 'desc'),
    limit(limitCount),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs
        .map((d) => d.data() as Message)
        // Firestore returned newest-first; reverse for chronological display
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      callback(messages);
    },
    (err) => {
      console.warn('[Firestore] onSnapshot error (falling back to HTTP):', err.message);
      onError?.();
    },
  );
};

// ─── File Upload ───────────────────────────────────────────────────────────

export interface UploadProgress {
  progress: number;
  downloadURL?: string;
  error?: Error;
}

export const uploadFile = (
  file: File,
  path: string,
  onProgress: (progress: UploadProgress) => void,
): UploadTask => {
  const storageRef = ref(firebaseStorage, path);
  const uploadTask = uploadBytesResumable(storageRef, file);

  uploadTask.on(
    'state_changed',
    (snapshot) => {
      const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      onProgress({ progress });
    },
    (error) => {
      onProgress({ progress: 0, error });
    },
    async () => {
      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
      onProgress({ progress: 100, downloadURL });
    },
  );

  return uploadTask;
};

export { getDownloadURL };
