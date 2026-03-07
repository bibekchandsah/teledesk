import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { authenticateSocket } from '../middleware/authMiddleware';
import { updatePresence, getUserById, updateActiveStatusSetting } from '../services/userService';
import { saveMessage, getChatById } from '../services/chatService';
import { Message } from '../../../shared/types';
import { generateId, now, sanitizeString } from '../utils/helpers';
import { SOCKET_EVENTS } from '../../../shared/constants/events';
import logger from '../utils/logger';

// Map of userId -> socketId for presence tracking
const onlineUsers = new Map<string, string>();
// Cache of userId -> showActiveStatus so late-joining users get accurate state
const userShowStatus = new Map<string, boolean>();

export const initializeSocket = (httpServer: HttpServer): SocketServer => {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()) ?? ['http://localhost:5173'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ─── Authentication Middleware ─────────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string;
    const user = await authenticateSocket(token);
    if (!user) {
      logger.warn(`Socket auth failed for socket ${socket.id}`);
      return next(new Error('Authentication failed'));
    }
    (socket as SocketWithUser).user = user;
    next();
  });

  // ─── Connection Handler ────────────────────────────────────────────────────
  io.on('connection', async (rawSocket) => {
    const socket = rawSocket as SocketWithUser;
    const uid = socket.user.uid;

    logger.info(`Socket connected: ${socket.id} (user: ${uid})`);
    onlineUsers.set(uid, socket.id);

    // Update Firestore presence
    await updatePresence(uid, 'online').catch(() => {});

    // Fetch user's active-status visibility preference (default: true)
    const userDoc = await getUserById(uid).catch(() => null);
    const showActiveStatus = userDoc?.showActiveStatus !== false;

    // Cache for later use (ACTIVE_STATUS_CHANGED and late-joiner sync)
    userShowStatus.set(uid, showActiveStatus);

    // Broadcast online status + visibility preference to all other connected clients
    socket.broadcast.emit(SOCKET_EVENTS.USER_ONLINE, { userId: uid, status: 'online', showActiveStatus });

    // ── Send all currently-online users to this newly connected socket ──────
    // Without this, users who were already online before this socket connected
    // would never appear in this user's onlineUsers set.
    onlineUsers.forEach((_, existingUid) => {
      if (existingUid !== uid) {
        socket.emit(SOCKET_EVENTS.USER_ONLINE, {
          userId: existingUid,
          status: 'online',
          showActiveStatus: userShowStatus.get(existingUid) ?? true,
        });
      }
    });

    // ─── Join personal room ────────────────────────────────────────────────
    socket.join(`user:${uid}`);

    // ─── Messaging ────────────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.JOIN_ROOM, (chatId: string) => {
      if (typeof chatId === 'string') {
        socket.join(`chat:${chatId}`);
        logger.debug(`User ${uid} joined room chat:${chatId}`);
      }
    });

    socket.on(SOCKET_EVENTS.LEAVE_ROOM, (chatId: string) => {
      if (typeof chatId === 'string') {
        socket.leave(`chat:${chatId}`);
      }
    });

    socket.on(
      SOCKET_EVENTS.SEND_MESSAGE,
      async (payload: {
        chatId: string;
        content: string;
        type: Message['type'];
        fileUrl?: string;
        fileName?: string;
        fileSize?: number;
        senderName?: string;
        senderAvatar?: string;
        callType?: 'voice' | 'video';
        callDuration?: number;
        callStatus?: 'completed' | 'missed' | 'cancelled' | 'no_answer' | 'declined';
        callStatusReceiver?: 'completed' | 'missed' | 'cancelled' | 'no_answer' | 'declined';
        replyTo?: Message['replyTo'];
        forwarded?: boolean;
      }) => {
        try {
          const chat = await getChatById(payload.chatId, uid);
          if (!chat) {
            socket.emit(SOCKET_EVENTS.ERROR, { error: 'Chat not found or access denied' });
            return;
          }

          const message: Message = {
            messageId: generateId(),
            chatId: payload.chatId,
            senderId: uid,
            content: sanitizeString(payload.content || ''),
            type: payload.type || 'text',
            timestamp: now(),
            readBy: [uid],
            ...(payload.senderName !== undefined && { senderName: sanitizeString(payload.senderName) }),
            ...(payload.senderAvatar !== undefined && { senderAvatar: payload.senderAvatar }),
            ...(payload.fileUrl !== undefined && { fileUrl: payload.fileUrl }),
            ...(payload.fileName !== undefined && { fileName: payload.fileName }),
            ...(payload.fileSize !== undefined && { fileSize: payload.fileSize }),
            ...(payload.callType !== undefined && { callType: payload.callType }),
            ...(payload.callDuration !== undefined && { callDuration: payload.callDuration }),
            ...(payload.callStatus !== undefined && { callStatus: payload.callStatus }),
            ...(payload.callStatusReceiver !== undefined && { callStatusReceiver: payload.callStatusReceiver }),
            ...(payload.replyTo !== undefined && { replyTo: payload.replyTo }),
            ...(payload.forwarded && { forwarded: true }),
          };

          await saveMessage(message);

          // Broadcast to all members in chat room
          io.to(`chat:${payload.chatId}`).emit(SOCKET_EVENTS.NEW_MESSAGE, message);

          // Notify offline members via their personal room
          for (const memberId of chat.members) {
            if (memberId !== uid && !onlineUsers.has(memberId)) {
              io.to(`user:${memberId}`).emit(SOCKET_EVENTS.NEW_MESSAGE, message);
            }
          }

          logger.debug(`Message sent in chat ${payload.chatId} by ${uid}`);
        } catch (err) {
          logger.error(`send_message error: ${(err as Error).message}`);
          socket.emit(SOCKET_EVENTS.ERROR, { error: 'Failed to send message' });
        }
      },
    );

    // ─── Typing Indicator ─────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.TYPING, (payload: { chatId: string; isTyping: boolean; userName: string }) => {
      socket.to(`chat:${payload.chatId}`).emit(SOCKET_EVENTS.USER_TYPING, {
        chatId: payload.chatId,
        userId: uid,
        userName: payload.userName,
        isTyping: payload.isTyping,
      });
    });
    // ─── Live Typing Preview ─────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.LIVE_TYPING, (payload: { chatId: string; text: string; userName: string }) => {
      socket.to(`chat:${payload.chatId}`).emit(SOCKET_EVENTS.LIVE_TYPING_UPDATE, {
        chatId: payload.chatId,
        userId: uid,
        userName: payload.userName,
        text: payload.text,
      });
    });
    // ─── Read Receipts ────────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.MESSAGE_READ, (payload: { chatId: string; messageId: string }) => {
      socket.to(`chat:${payload.chatId}`).emit(SOCKET_EVENTS.MESSAGE_READ_RECEIPT, {
        chatId: payload.chatId,
        messageId: payload.messageId,
        userId: uid,
      });
    });

    // ─── WebRTC Call Signaling ─────────────────────────────────────────────
    socket.on(
      SOCKET_EVENTS.CALL_USER,
      (payload: { targetUserId: string; callType: 'video' | 'voice'; callId: string; callerName: string; callerAvatar?: string }) => {
        logger.info(`Call initiated from ${uid} to ${payload.targetUserId}`);
        io.to(`user:${payload.targetUserId}`).emit(SOCKET_EVENTS.INCOMING_CALL, {
          callId: payload.callId,
          callerId: uid,
          callerName: payload.callerName,
          callerAvatar: payload.callerAvatar,
          callType: payload.callType,
        });
      },
    );

    socket.on(SOCKET_EVENTS.ACCEPT_CALL, (payload: { callId: string; callerId: string }) => {
      io.to(`user:${payload.callerId}`).emit(SOCKET_EVENTS.ACCEPT_CALL, {
        callId: payload.callId,
        acceptorId: uid,
      });
    });

    socket.on(SOCKET_EVENTS.REJECT_CALL, (payload: { callId: string; callerId: string }) => {
      io.to(`user:${payload.callerId}`).emit(SOCKET_EVENTS.CALL_REJECTED, {
        callId: payload.callId,
        rejectedBy: uid,
      });
    });

    socket.on(
      SOCKET_EVENTS.OFFER,
      (payload: { to: string; callId: string; offer: { type?: string; sdp?: string } }) => {
        io.to(`user:${payload.to}`).emit(SOCKET_EVENTS.OFFER, {
          from: uid,
          callId: payload.callId,
          offer: payload.offer,
        });
      },
    );

    socket.on(
      SOCKET_EVENTS.ANSWER,
      (payload: { to: string; callId: string; answer: { type?: string; sdp?: string } }) => {
        io.to(`user:${payload.to}`).emit(SOCKET_EVENTS.ANSWER, {
          from: uid,
          callId: payload.callId,
          answer: payload.answer,
        });
      },
    );

    socket.on(
      SOCKET_EVENTS.ICE_CANDIDATE,
      (payload: { to: string; callId: string; candidate: { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null } }) => {
        io.to(`user:${payload.to}`).emit(SOCKET_EVENTS.ICE_CANDIDATE, {
          from: uid,
          callId: payload.callId,
          candidate: payload.candidate,
        });
      },
    );

    socket.on(SOCKET_EVENTS.END_CALL, (payload: { to: string; callId: string }) => {
      io.to(`user:${payload.to}`).emit(SOCKET_EVENTS.CALL_ENDED, {
        callId: payload.callId,
        endedBy: uid,
      });
    });

    // ─── Active Status Visibility ──────────────────────────────────────────
    socket.on(SOCKET_EVENTS.ACTIVE_STATUS_CHANGED, async (payload: { showActiveStatus: boolean }) => {
      const newVal = payload.showActiveStatus === true;
      userShowStatus.set(uid, newVal); // keep in-memory cache current
      await updateActiveStatusSetting(uid, newVal).catch(() => {});
      // Notify all other connected clients so they can update their UI in real-time
      socket.broadcast.emit(SOCKET_EVENTS.ACTIVE_STATUS_CHANGED, { userId: uid, showActiveStatus: newVal });
    });

    // ─── Heartbeat ─────────────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.HEARTBEAT, () => {
      updatePresence(uid, 'online').catch(() => {});
    });

    // ─── Disconnect ────────────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.DISCONNECT, async () => {
      logger.info(`Socket disconnected: ${socket.id} (user: ${uid})`);
      onlineUsers.delete(uid);
      userShowStatus.delete(uid);

      await updatePresence(uid, 'offline').catch(() => {});
      socket.broadcast.emit(SOCKET_EVENTS.USER_OFFLINE, {
        userId: uid,
        status: 'offline',
        lastSeen: now(),
      });
    });
  });

  return io;
};

// ─── Types ─────────────────────────────────────────────────────────────────
interface SocketWithUser extends Socket {
  user: { uid: string; email?: string; name?: string };
}
