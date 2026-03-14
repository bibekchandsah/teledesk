import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsOptions } from './config/corsConfig';
import { globalRateLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import userRoutes from './routes/userRoutes';
import chatRoutes from './routes/chatRoutes';
import groupRoutes from './routes/groupRoutes';
import fileRoutes from './routes/fileRoutes';
import savedMessagesRoutes from './routes/savedMessagesRoutes';
import deviceSessionRoutes from './routes/deviceSessionRoutes';
import authRoutes from './routes/authRoutes';
import draftRoutes from './routes/draftRoutes';
import { initializeSocket } from './sockets/socketManager';
import { setIo as setUserIo } from './controllers/userController';
import { setIo } from './controllers/chatController';
import { setIo as setDraftIo } from './controllers/draftController';
import logger from './utils/logger';
import fs from 'fs';

// ─── Ensure log directory exists ───────────────────────────────────────────
if (!fs.existsSync('logs')) fs.mkdirSync('logs');

const app = express();
const httpServer = http.createServer(app);

// ─── Trust proxy for IP address extraction ─────────────────────────────────
app.set('trust proxy', true);

// ─── Security Middleware ───────────────────────────────────────────────────
app.use(helmet());
app.use(cors(corsOptions));
app.use(globalRateLimiter);

// ─── Logging ───────────────────────────────────────────────────────────────
app.use(
  morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }),
);

// ─── Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Static Uploads ───────────────────────────────────────────────────────
// Files are now served from Cloudflare R2; no local static middleware needed.

// ─── Health Check ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ────────────────────────────────────────────────────────────
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/saved-messages', savedMessagesRoutes);
app.use('/api/device-sessions', deviceSessionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/drafts', draftRoutes);

// ─── Debug route to verify deployment ──────────────────────────────────────
app.get('/api/debug/routes', (_req, res) => {
  res.json({ 
    status: 'ok', 
    routes: [
      '/api/users',
      '/api/chats', 
      '/api/groups',
      '/api/files',
      '/api/saved-messages',
      '/api/device-sessions'
    ],
    timestamp: new Date().toISOString() 
  });
});

// ─── 404 & Error Handlers ──────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Socket.io Initialization ─────────────────────────────────────────────
const io = initializeSocket(httpServer);
setIo(io);
setUserIo(io);
setDraftIo(io);

// ─── Start Server ──────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3001;

httpServer.listen(PORT, () => {
  logger.info(`TeleDesk backend server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info('Registered routes: /api/users, /api/chats, /api/groups, /api/files, /api/saved-messages, /api/device-sessions');
});

// ─── Graceful Shutdown ─────────────────────────────────────────────────────
const shutdown = (signal: string) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.stack}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
  process.exit(1);
});

export default app;
