import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import { auth } from '../config/firebase';
import { upsertUser } from '../services/userService';
import logger from '../utils/logger';

// ─── Google OAuth Setup ────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${BACKEND_URL}/api/auth/desktop/google/callback`
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
const GITHUB_CALLBACK = `${BACKEND_URL}/api/auth/desktop/github/callback`;

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
  const deepLinkUrl = `teledesk://auth?token=${customToken}`;
  const httpCallbackUrl = `http://localhost:48292/auth/callback?token=${customToken}`;
  
  // Set headers to allow inline scripts and connections to localhost (bypass CSP)
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' http://localhost:48292");
  res.setHeader('Content-Type', 'text/html');
  
  res.send(`
    <html>
      <head>
        <title>Authenticating...</title>
        <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' http://localhost:48292">
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #1a1a2e; color: white; }
          .container { text-align: center; }
          a { color: #6366f1; text-decoration: none; font-weight: bold; }
          .status { margin-top: 20px; font-size: 14px; color: #888; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Authentication Successful!</h2>
          <p>Redirecting to TeleDesk...</p>
          <p class="status" id="status">Attempting to connect...</p>
          <p style="font-size: 12px; color: #888; margin-top: 20px;">If you aren't redirected automatically, <a href="${deepLinkUrl}" id="manualLink">click here</a>.</p>
        </div>
        <script>
          const status = document.getElementById('status');
          const manualLink = document.getElementById('manualLink');
          
          // Try deep link first (works in production)
          status.textContent = 'Trying deep link...';
          window.location.href = "${deepLinkUrl}";
          
          // Fallback to HTTP callback after 1 second (works in dev mode)
          setTimeout(() => {
            status.textContent = 'Trying HTTP callback...';
            fetch("${httpCallbackUrl}")
              .then(() => {
                status.textContent = '✓ Connected! You can close this tab.';
                document.querySelector('.container h2').textContent = '✓ Authentication Successful!';
                setTimeout(() => { window.close(); }, 2000);
              })
              .catch((err) => {
                console.error('HTTP callback failed:', err);
                status.textContent = '⚠ Please click the link above to continue';
                manualLink.style.fontSize = '16px';
                manualLink.style.fontWeight = 'bold';
              });
          }, 1000);
        </script>
      </body>
    </html>
  `);
}
