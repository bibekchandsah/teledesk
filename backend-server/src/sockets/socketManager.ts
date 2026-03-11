import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { authenticateSocket } from '../middleware/authMiddleware';
import { updatePresence, getUserById, updateActiveStatusSetting } from '../services/userService';
import { saveMessage, getChatById, markMessageDelivered, getUndeliveredMessagesForUser, addReaction, removeReaction } from '../services/chatService';
import { Message } from '../../../shared/types';
import { generateId, now, sanitizeString, extractClientIP } from '../utils/helpers';
import { SOCKET_EVENTS } from '../../../shared/constants/events';
import logger from '../utils/logger';

// Map of userId -> socketId for presence tracking
const onlineUsers = new Map<string, string>();
// Map of sessionFingerprint -> socketId for device-specific targeting
const sessionSockets = new Map<string, string>();
// Cache of userId -> showActiveStatus so late-joining users get accurate state
const userShowStatus = new Map<string, boolean>();

// Export for device session service and debugging
export const getSessionSockets = () => {
  logger.debug(`Current session mappings: ${JSON.stringify(Array.from(sessionSockets.entries()))}`);
  return sessionSockets;
};
// Active calls: callId -> full call data needed for re-delivery
const activeCalls = new Map<string, {
  callerId: string;
  receiverId: string;
  status: 'ringing' | 'active';
  callerName: string;
  callerAvatar?: string;
  callType: 'video' | 'voice';
}>();
// Reverse lookup: userId -> callId
const userActiveCall = new Map<string, string>();

export const initializeSocket = (httpServer: HttpServer): SocketServer => {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()) ?? ['http://localhost:5173'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Set up socket IO for device session service
  const { setSocketIO } = require('../services/deviceSessionService');
  setSocketIO(io);

  // ─── Authentication Middleware ─────────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string;
    const userAgent = socket.handshake.headers['user-agent'] || 'Unknown';
    const ipAddress = extractClientIP(socket);
    
    const user = await authenticateSocket(token, userAgent, ipAddress);
    if (!user) {
      logger.warn(`Socket auth failed for socket ${socket.id}`);
      return next(new Error('Authentication failed'));
    }
    
    // Log session fingerprint for debugging
    if (user.sessionFingerprint) {
      logger.debug(`Socket auth successful: ${socket.id}, session: ${user.sessionFingerprint}, IP: ${ipAddress}, UA: ${userAgent.slice(0, 50)}...`);
    }
    
    (socket as SocketWithUser).user = user;
    next();
  });

  // ─── Connection Handler ────────────────────────────────────────────────────
  io.on('connection', async (rawSocket) => {
    const socket = rawSocket as SocketWithUser;
    const uid = socket.user.uid;
    const sessionFingerprint = socket.user.sessionFingerprint;

    logger.info(`Socket connected: ${socket.id} (user: ${uid}, session: ${sessionFingerprint})`);
    onlineUsers.set(uid, socket.id);
    
    // Track session fingerprint for device-specific targeting
    if (sessionFingerprint) {
      sessionSockets.set(sessionFingerprint, socket.id);
      logger.debug(`Mapped session ${sessionFingerprint} to socket ${socket.id}`);
    }

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

    // ─── Backfill delivery for messages sent while offline ────────────────
    // Find messages this user never received a delivery ack for (e.g. window
    // was closed when the message arrived) and notify each online sender so
    // their UI can flip from single tick → double tick immediately.
    getUndeliveredMessagesForUser(uid)
      .then(async (undelivered) => {
        if (undelivered.length === 0) return;
        // Mark delivered in DB first, then notify senders
        await Promise.all(undelivered.map((msg) => markMessageDelivered(msg.messageId, uid)));
        for (const msg of undelivered) {
          if (onlineUsers.has(msg.senderId)) {
            io.to(`user:${msg.senderId}`).emit(SOCKET_EVENTS.MESSAGE_DELIVERED, {
              chatId: msg.chatId,
              messageId: msg.messageId,
              userId: uid,
            });
          }
        }
      })
      .catch((err) => logger.error(`deliver-on-connect error: ${(err as Error).message}`));

    // ─── Re-deliver pending incoming call if receiver was offline ─────────
    // When user B was offline at the time user A called, they missed INCOMING_CALL.
    // As soon as they reconnect within the 30-second ringing window, deliver it now
    // and notify user A that user B's device is now ringing.
    const pendingCallId = userActiveCall.get(uid);
    if (pendingCallId) {
      const pendingCall = activeCalls.get(pendingCallId);
      if (pendingCall && pendingCall.status === 'ringing' && pendingCall.receiverId === uid) {
        // Deliver the incoming call to the receiver who just came online
        socket.emit(SOCKET_EVENTS.INCOMING_CALL, {
          callId: pendingCallId,
          callerId: pendingCall.callerId,
          callerName: pendingCall.callerName,
          callerAvatar: pendingCall.callerAvatar,
          callType: pendingCall.callType,
        });
        // Notify the caller that the callee's device is now ringing
        if (onlineUsers.has(pendingCall.callerId)) {
          io.to(`user:${pendingCall.callerId}`).emit(SOCKET_EVENTS.CALL_RINGING, { callId: pendingCallId });
        }
        logger.info(`Re-delivered pending call ${pendingCallId} to ${uid} after reconnect`);
      }
    }

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
        messageId?: string;
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

          // Determine which non-sender members are already online so we can
          // pre-populate deliveredTo before the DB INSERT.  This eliminates the
          // race condition where the Supabase realtime INSERT event fires and
          // fetches the message from the DB before the separate
          // markMessageDelivered() call has completed, causing the delivered
          // state to be wiped out by the incoming setMessages() call.
          const onlineRecipients = chat.members.filter(
            (m) => m !== uid && onlineUsers.has(m),
          );

          const message: Message = {
            // Honor client-provided messageId for optimistic UI (must be valid UUID format)
            messageId: (payload.messageId && /^[0-9a-f-]{36}$/.test(payload.messageId))
              ? payload.messageId
              : generateId(),
            chatId: payload.chatId,
            senderId: uid,
            content: sanitizeString(payload.content || ''),
            type: payload.type || 'text',
            timestamp: now(),
            readBy: [uid],
            // Pre-populate so every subsequent DB read (realtime, pagination, reload)
            // already reflects the delivered state without a separate UPDATE.
            deliveredTo: onlineRecipients,
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

          // Broadcast to all members in chat room (handles open chat windows)
          io.to(`chat:${payload.chatId}`).emit(SOCKET_EVENTS.NEW_MESSAGE, message);

          // Always notify every non-sender via their personal room too.
          // This ensures online members who have NOT joined the chat room
          // (i.e. they are on a different chat or the chat list) still receive
          // the message for unread-count tracking. The client store deduplicates.
          for (const memberId of chat.members) {
            if (memberId !== uid) {
              io.to(`user:${memberId}`).emit(SOCKET_EVENTS.NEW_MESSAGE, message);
              // Notify the sender's socket immediately so the optimistic message
              // gets its deliveredTo patched before the Supabase realtime fires.
              if (onlineUsers.has(memberId)) {
                io.to(`user:${uid}`).emit(SOCKET_EVENTS.MESSAGE_DELIVERED, {
                  chatId: payload.chatId,
                  messageId: message.messageId,
                  userId: memberId,
                });
              }
            }
          }

          logger.debug(`Message sent in chat ${payload.chatId} by ${uid}`);
        } catch (err) {
          logger.error(`send_message error: ${(err as Error).message}`);
          socket.emit(SOCKET_EVENTS.ERROR, { error: 'Failed to send message' });
        }
      },
    );

    // ─── Delivery ACK (recipient → server → sender) ──────────────────────
    // Fired by the recipient's client as soon as it receives NEW_MESSAGE.
    // More reliable than the server-side onlineUsers map check at send time.
    socket.on(
      SOCKET_EVENTS.DELIVER_ACK,
      async (payload: { chatId: string; messageId: string; senderId: string }) => {
        try {
          await markMessageDelivered(payload.messageId, uid);
          if (onlineUsers.has(payload.senderId)) {
            io.to(`user:${payload.senderId}`).emit(SOCKET_EVENTS.MESSAGE_DELIVERED, {
              chatId: payload.chatId,
              messageId: payload.messageId,
              userId: uid,
            });
          }
        } catch (err) {
          logger.error(`deliver_ack error: ${(err as Error).message}`);
        }
      },
    );

    // ─── Typing Indicator ─────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.TYPING, async (payload: { chatId: string; isTyping: boolean; userName: string }) => {
      const data = {
        chatId: payload.chatId,
        userId: uid,
        userName: payload.userName,
        isTyping: payload.isTyping,
      };
      socket.to(`chat:${payload.chatId}`).emit(SOCKET_EVENTS.USER_TYPING, data);
      // Also notify members via personal room (in case receiver is on different chat)
      const chat = await getChatById(payload.chatId, uid).catch(() => null);
      if (chat) {
        for (const memberId of chat.members) {
          if (memberId !== uid) {
            io.to(`user:${memberId}`).emit(SOCKET_EVENTS.USER_TYPING, data);
          }
        }
      }
    });
    // ─── Live Typing Preview ─────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.LIVE_TYPING, async (payload: { chatId: string; text: string; userName: string }) => {
      const data = {
        chatId: payload.chatId,
        userId: uid,
        userName: payload.userName,
        text: payload.text,
      };
      // Emit to chat room (users who have this chat open)
      socket.to(`chat:${payload.chatId}`).emit(SOCKET_EVENTS.LIVE_TYPING_UPDATE, data);
      // Also emit to every member's personal room so they receive it
      // even when navigated elsewhere (receiver respects their own setting client-side)
      const chat = await getChatById(payload.chatId, uid).catch(() => null);
      if (chat) {
        for (const memberId of chat.members) {
          if (memberId !== uid) {
            io.to(`user:${memberId}`).emit(SOCKET_EVENTS.LIVE_TYPING_UPDATE, data);
          }
        }
      }
    });
    // ─── Read Receipts ────────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.MESSAGE_READ, async (payload: { chatId: string; messageId: string }) => {
      const receipt = { chatId: payload.chatId, userId: uid };
      // Notify everyone currently in the chat room
      socket.to(`chat:${payload.chatId}`).emit(SOCKET_EVENTS.MESSAGE_READ_RECEIPT, receipt);
      // Also notify every member via their personal room (handles users not in the room)
      const chat = await getChatById(payload.chatId, uid).catch(() => null);
      if (chat) {
        for (const memberId of chat.members) {
          if (memberId !== uid) {
            io.to(`user:${memberId}`).emit(SOCKET_EVENTS.MESSAGE_READ_RECEIPT, receipt);
          }
        }
      }
    });

    // ─── WebRTC Call Signaling ─────────────────────────────────────────────
    socket.on(
      SOCKET_EVENTS.CALL_USER,
      (payload: { targetUserId: string; callType: 'video' | 'voice'; callId: string; callerName: string; callerAvatar?: string }) => {
        logger.info(`Call initiated from ${uid} to ${payload.targetUserId}`);
        // Track this call
        activeCalls.set(payload.callId, {
          callerId: uid,
          receiverId: payload.targetUserId,
          status: 'ringing',
          callerName: payload.callerName,
          callerAvatar: payload.callerAvatar,
          callType: payload.callType,
        });
        userActiveCall.set(uid, payload.callId);
        userActiveCall.set(payload.targetUserId, payload.callId);
        // Deliver call to receiver
        io.to(`user:${payload.targetUserId}`).emit(SOCKET_EVENTS.INCOMING_CALL, {
          callId: payload.callId,
          callerId: uid,
          callerName: payload.callerName,
          callerAvatar: payload.callerAvatar,
          callType: payload.callType,
        });
        // If receiver is online, immediately notify caller their phone is ringing
        if (onlineUsers.has(payload.targetUserId)) {
          io.to(`user:${uid}`).emit(SOCKET_EVENTS.CALL_RINGING, { callId: payload.callId });
        }
      },
    );

    socket.on(SOCKET_EVENTS.ACCEPT_CALL, (payload: { callId: string; callerId: string }) => {
      const call = activeCalls.get(payload.callId);
      if (call) activeCalls.set(payload.callId, { ...call, status: 'active' });
      io.to(`user:${payload.callerId}`).emit(SOCKET_EVENTS.ACCEPT_CALL, {
        callId: payload.callId,
        acceptorId: uid,
      });
    });

    socket.on(SOCKET_EVENTS.REJECT_CALL, (payload: { callId: string; callerId: string }) => {
      activeCalls.delete(payload.callId);
      userActiveCall.delete(uid);
      userActiveCall.delete(payload.callerId);
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
      activeCalls.delete(payload.callId);
      userActiveCall.delete(uid);
      userActiveCall.delete(payload.to);
      io.to(`user:${payload.to}`).emit(SOCKET_EVENTS.CALL_ENDED, {
        callId: payload.callId,
        endedBy: uid,
      });
    });

    socket.on(SOCKET_EVENTS.CALL_MUTE_CHANGED, (payload: { to: string; callId: string; isMuted: boolean }) => {
      io.to(`user:${payload.to}`).emit(SOCKET_EVENTS.CALL_MUTE_CHANGED, {
        callId: payload.callId,
        from: uid,
        isMuted: payload.isMuted,
      });
    });

    socket.on(SOCKET_EVENTS.CALL_VIDEO_CHANGED, (payload: { to: string; callId: string; isVideoOff: boolean }) => {
      io.to(`user:${payload.to}`).emit(SOCKET_EVENTS.CALL_VIDEO_CHANGED, {
        callId: payload.callId,
        from: uid,
        isVideoOff: payload.isVideoOff,
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

    // ─── Message Status Visibility ─────────────────────────────────────────
    socket.on(SOCKET_EVENTS.MESSAGE_STATUS_CHANGED, async (payload: { showMessageStatus: boolean }) => {
      const newVal = payload.showMessageStatus === true;
      await getUserById(uid).then(user => {
        if (user) {
          const { upsertUser } = require('../services/userService');
          return upsertUser(uid, { showMessageStatus: newVal });
        }
      }).catch(() => {});
      // Notify all other connected clients so they can update their UI in real-time
      socket.broadcast.emit(SOCKET_EVENTS.MESSAGE_STATUS_CHANGED, { userId: uid, showMessageStatus: newVal });
    });

    // ─── Message Reactions ─────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.REACTION_ADDED, async (payload: { messageId: string; chatId: string; emoji: string }) => {
      try {
        const result = await addReaction(payload.messageId, payload.emoji, uid);
        if (!result) return;
        
        const reactor = await getUserById(uid);
        const update = { 
          messageId: payload.messageId, 
          chatId: payload.chatId, 
          reactions: result.reactions,
          readBy: result.readBy,
          reactorId: uid,
          reactorName: reactor?.name,
          reactorUsername: reactor?.username,
          emoji: payload.emoji,
          senderId: result.senderId,
          content: result.content
        };
        io.to(`chat:${payload.chatId}`).emit(SOCKET_EVENTS.REACTION_UPDATED, update);
        for (const memberId of result.members) {
          io.to(`user:${memberId}`).emit(SOCKET_EVENTS.REACTION_UPDATED, update);
        }
      } catch (err) {
        logger.error(`reaction_added error: ${(err as Error).message}`);
      }
    });

    socket.on(SOCKET_EVENTS.REACTION_REMOVED, async (payload: { messageId: string; chatId: string; emoji: string }) => {
      try {
        const result = await removeReaction(payload.messageId, payload.emoji, uid);
        if (!result) return;
        const update = { messageId: payload.messageId, chatId: payload.chatId, reactions: result.reactions };
        io.to(`chat:${payload.chatId}`).emit(SOCKET_EVENTS.REACTION_UPDATED, update);
        for (const memberId of result.members) {
          io.to(`user:${memberId}`).emit(SOCKET_EVENTS.REACTION_UPDATED, update);
        }
      } catch (err) {
        logger.error(`reaction_removed error: ${(err as Error).message}`);
      }
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
      
      // Clean up session fingerprint mapping
      if (sessionFingerprint) {
        sessionSockets.delete(sessionFingerprint);
        logger.debug(`Removed session ${sessionFingerprint} from socket mapping`);
      }
      // If this user was in an active call, notify the other party
      const activeCallId = userActiveCall.get(uid);
      if (activeCallId) {
        const call = activeCalls.get(activeCallId);
        if (call) {
          const otherId = call.callerId === uid ? call.receiverId : call.callerId;
          io.to(`user:${otherId}`).emit(SOCKET_EVENTS.CALL_ENDED, {
            callId: activeCallId,
            endedBy: uid,
            byDisconnect: true,
          });
          activeCalls.delete(activeCallId);
          userActiveCall.delete(otherId);
        }
        userActiveCall.delete(uid);
      }
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
  user: { uid: string; email?: string; name?: string; sessionFingerprint?: string };
}
