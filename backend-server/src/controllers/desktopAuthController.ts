import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import { auth } from '../config/firebase';
import { upsertUser } from '../services/userService';
import logger from '../utils/logger';

// ─── Google OAuth Setup ────────────────────────────────────────────────────
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3001/api/auth/desktop/google/callback'
);

export const initiateDesktopGoogleLogin = (req: Request, res: Response) => {
  const url = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
    prompt: 'select_account'
  });
  res.redirect(url);
};

export const handleDesktopGoogleCallback = async (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');

  try {
    const { tokens } = await googleClient.getToken(code as string);
    const idToken = tokens.id_token;
    if (!idToken) throw new Error('No id_token received');

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) throw new Error('Invalid token payload');

    const { sub: uid, email, name, picture } = payload;
    
    // 1. Sync with Firebase Auth
    const firebaseUser = await getOrCreateFirebaseUser(uid, email || '', name || 'User', picture || '');
    
    // 2. Sync with Supabase immediately (Server-side)
    await upsertUser(uid, {
      name: name || 'User',
      email: email || '',
      avatar: picture || '',
    });

    const customToken = await auth.createCustomToken(firebaseUser.uid);

    sendAuthSuccessResponse(res, customToken);
  } catch (error) {
    logger.error('Desktop Google Callback Error:', error);
    res.status(500).send('Authentication failed');
  }
};

// ─── GitHub OAuth Setup ───────────────────────────────────────────────────
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK = 'http://localhost:3001/api/auth/desktop/github/callback';

export const initiateDesktopGithubLogin = (req: Request, res: Response) => {
  const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${GITHUB_CALLBACK}&scope=user:email,read:user`;
  res.redirect(url);
};

export const handleDesktopGithubCallback = async (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');

  try {
    // 1. Exchange code for access token
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }, {
      headers: { Accept: 'application/json' }
    });

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) throw new Error('Failed to get access token from GitHub');

    // 2. Get user profile
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${accessToken}` }
    });

    // 3. Get user email (might be private)
    const emailsResponse = await axios.get('https://api.github.com/user/emails', {
      headers: { Authorization: `token ${accessToken}` }
    });

    const primaryEmail = emailsResponse.data.find((e: any) => e.primary)?.email || emailsResponse.data[0]?.email;
    const { id, name, login, avatar_url } = userResponse.data;

    // GitHub uid prefix to avoid collisions with Google/Email
    const githubUid = `github:${id}`;
    
    // 1. Sync with Firebase Auth
    const firebaseUser = await getOrCreateFirebaseUser(githubUid, primaryEmail, name || login, avatar_url);
    
    // 2. Sync with Supabase immediately (Server-side)
    await upsertUser(githubUid, {
      name: name || login,
      email: primaryEmail || '',
      avatar: avatar_url || '',
    });

    const customToken = await auth.createCustomToken(firebaseUser.uid);

    sendAuthSuccessResponse(res, customToken);
  } catch (error) {
    logger.error('Desktop GitHub Callback Error:', error);
    res.status(500).send('Authentication failed');
  }
};

// ─── Shared Helpers ────────────────────────────────────────────────────────
async function getOrCreateFirebaseUser(uid: string, email: string, name: string, photoURL: string) {
  try {
    const user = await auth.getUser(uid);
    // Update existing user with latest info from OAuth provider
    return await auth.updateUser(uid, {
      displayName: name || user.displayName,
      photoURL: photoURL || user.photoURL,
    });
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      return await auth.createUser({ uid, email, displayName: name, photoURL });
    }
    throw error;
  }
}

function sendAuthSuccessResponse(res: Response, customToken: string) {
  const redirectUrl = `teledesk://auth?token=${customToken}`;
  res.send(`
    <html>
      <head>
        <title>Authenticating...</title>
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #1a1a2e; color: white; }
          .container { text-align: center; }
          a { color: #6366f1; text-decoration: none; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Authentication Successful!</h2>
          <p>You can close this tab and return to TeleDesk.</p>
          <p>If you aren't redirected automatically, <a href="${redirectUrl}">click here</a>.</p>
        </div>
        <script>
          window.location.href = "${redirectUrl}";
          setTimeout(() => { window.close(); }, 3000);
        </script>
      </body>
    </html>
  `);
}
