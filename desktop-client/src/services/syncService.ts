import { db, SyncAction } from './dbService';
import { getSocket, SOCKET_EVENTS } from './socketService';
import { upsertSavedMessage as upsertSavedMessageApi, deleteSavedMessage as deleteSavedMessageApi } from './apiService';

class SyncService {
  private processing = false;

  async addAction(action: Omit<SyncAction, 'id' | 'status' | 'retryCount'>) {
    await db.syncQueue.add({
      ...action,
      status: 'pending',
      retryCount: 0
    });
    
    // If we are currently online, try to process immediately
    if (navigator.onLine) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.processing || !navigator.onLine) return;
    this.processing = true;

    try {
      const pendingActions = await db.syncQueue
        .where('status').anyOf('pending', 'failed')
        .toArray();

      // Sort by timestamp if needed, but auto-incrementing ID naturally orders them
      pendingActions.sort((a, b) => (a.id || 0) - (b.id || 0));

      for (const action of pendingActions) {
        if (!navigator.onLine) break; // Stop processing if network drops
        
        try {
          await this.executeAction(action);
          
          // Action succeeded, remove from queue
          if (action.id !== undefined) {
             await db.syncQueue.delete(action.id);
          }
        } catch (error) {
          console.error('[SyncService] Action failed:', action, error);
          if (action.id !== undefined) {
            await db.syncQueue.update(action.id, {
               status: 'failed',
               retryCount: action.retryCount + 1
            });
          }
        }
      }
    } catch (e) {
      console.error('[SyncService] Queue processing error:', e);
    } finally {
      this.processing = false;
    }
  }

  private async executeAction(action: SyncAction): Promise<void> {
    const { type, payload } = action;
    const socket = getSocket();
    if (!socket?.connected) throw new Error('Socket not connected');

    switch (type) {
      case 'sendMessage':
        // Payload should match socketService.sendMessage
        socket.emit(SOCKET_EVENTS.SEND_MESSAGE, payload);
        break;
      case 'sendReaction':
        socket.emit(SOCKET_EVENTS.REACTION_ADDED, payload);
        break;
      case 'removeReaction':
        socket.emit(SOCKET_EVENTS.REACTION_REMOVED, payload);
        break;
      case 'upsertSavedMessage':
        await upsertSavedMessageApi(payload.messageId, payload.entry);
        break;
      case 'deleteSavedMessage':
        await deleteSavedMessageApi(payload.messageId);
        break;
      default:
        console.warn(`[SyncService] Unknown action type: ${type}`);
        break;
    }
    
    // For simplicity, we assume fire-and-forget success if navigator is online.
    // In a future enhancement, we could use socket acknowledgements.
    return Promise.resolve();
  }
}

export const syncService = new SyncService();
