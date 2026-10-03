import { Server, Socket } from 'socket.io';
import { RoomManager } from '../models/RoomManager.js';
import { DatabaseService } from '../services/db.js';
import { canPerformAction } from '../services/permissions.js';
import { extractYouTubeId } from '../utils/youtube.js';
import {
  AssignRoleSchema,
  ChangeVideoSchema,
  JoinRoomSchema,
  LeaveRoomSchema,
  PlayPauseSchema,
  RemoveParticipantSchema,
  SeekSchema,
} from './schemas.js';

interface SocketData {
  roomId?: string;
  userId?: string;
}

export function setupSocketHandlers(
  io: Server,
  roomManager: RoomManager,
  dbService?: DatabaseService
): void {
  io.on('connection', (socket: Socket<any, any, any, SocketData>) => {
    // Helper to send error to client
    const sendError = (code: 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST' | 'INTERNAL_ERROR', message: string) => {
      socket.emit('error', { code, message });
    };

    // Helper to get active room & participant for this socket
    const getContext = () => {
      const roomId = socket.data.roomId;
      if (!roomId) {
        return { room: undefined, participant: undefined };
      }
      const room = roomManager.getRoom(roomId);
      const participant = room?.getParticipantBySocket(socket.id);
      return { room, participant };
    };

    // 1. JOIN ROOM
    socket.on('join_room', async (rawPayload: unknown) => {
      try {
        const parsed = JoinRoomSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return sendError('BAD_REQUEST', 'Invalid join_room payload.');
        }

        const { roomId, username, userId: providedUserId } = parsed.data;
        const normalizedRoomId = roomId.toUpperCase();
        let room = roomManager.getRoom(normalizedRoomId);

        // If not in memory, check if exists in DB
        if (!room && dbService) {
          const dbRecord = await dbService.getRoom(normalizedRoomId);
          if (dbRecord) {
            room = roomManager.createRoom(dbRecord.id, dbRecord.video_id);
            room.playState = dbRecord.play_state as any;
            room.currentTime = dbRecord.current_time;
            room.updatedAt = Number(dbRecord.updated_at);
          }
        }

        if (!room) {
          return sendError('NOT_FOUND', `Room "${roomId}" does not exist.`);
        }

        const userId = providedUserId || `user_${socket.id.substring(0, 8)}`;

        if (room.isRemoved(userId)) {
          return sendError('FORBIDDEN', 'You have been removed from this room.');
        }

        // Leave any previous room
        if (socket.data.roomId && socket.data.roomId !== normalizedRoomId) {
          socket.leave(socket.data.roomId);
        }

        socket.data.roomId = normalizedRoomId;
        socket.data.userId = userId;
        socket.join(normalizedRoomId);

        const participant = room.addParticipant(userId, socket.id, username);

        // Send current authoritative room state to the newly joined client
        socket.emit('sync_state', room.toSyncStatePayload());

        // Broadcast to everyone in the room that a user joined
        io.to(normalizedRoomId).emit('user_joined', {
          username: participant.username,
          userId: participant.userId,
          role: participant.role,
          participants: room.getAllParticipants(),
        });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 2. LEAVE ROOM
    socket.on('leave_room', (rawPayload: unknown) => {
      try {
        const parsed = LeaveRoomSchema.safeParse(rawPayload);
        const roomId = parsed.success ? parsed.data.roomId.toUpperCase() : socket.data.roomId;

        if (!roomId) return;

        const room = roomManager.getRoom(roomId);
        if (room) {
          const removed = room.removeParticipantBySocket(socket.id);
          socket.leave(roomId);
          socket.data.roomId = undefined;

          if (removed) {
            io.to(roomId).emit('user_left', {
              username: removed.username,
              userId: removed.userId,
              participants: room.getAllParticipants(),
            });
          }
        }
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 3. PLAY
    socket.on('play', (rawPayload?: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) {
          return sendError('NOT_FOUND', 'You must join a room first.');
        }

        if (!canPerformAction(participant.role, 'play')) {
          return sendError('FORBIDDEN', 'You do not have permission to play video.');
        }

        const parsed = PlayPauseSchema.safeParse(rawPayload);
        const time = parsed.success && parsed.data ? parsed.data.time : undefined;

        room.play(time);

        io.to(room.id).emit('sync_state', room.toSyncStatePayload());

        if (dbService) {
          dbService.saveRoom({
            id: room.id,
            video_id: room.videoId,
            play_state: room.playState,
            current_time: room.currentTime,
            updated_at: room.updatedAt,
          }).catch(() => {});
        }
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 4. PAUSE
    socket.on('pause', (rawPayload?: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) {
          return sendError('NOT_FOUND', 'You must join a room first.');
        }

        if (!canPerformAction(participant.role, 'pause')) {
          return sendError('FORBIDDEN', 'You do not have permission to pause video.');
        }

        const parsed = PlayPauseSchema.safeParse(rawPayload);
        const time = parsed.success && parsed.data ? parsed.data.time : undefined;

        room.pause(time);

        io.to(room.id).emit('sync_state', room.toSyncStatePayload());

        if (dbService) {
          dbService.saveRoom({
            id: room.id,
            video_id: room.videoId,
            play_state: room.playState,
            current_time: room.currentTime,
            updated_at: room.updatedAt,
          }).catch(() => {});
        }
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 5. SEEK
    socket.on('seek', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) {
          return sendError('NOT_FOUND', 'You must join a room first.');
        }

        if (!canPerformAction(participant.role, 'seek')) {
          return sendError('FORBIDDEN', 'You do not have permission to seek video.');
        }

        const parsed = SeekSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return sendError('BAD_REQUEST', 'Invalid seek payload. Time must be non-negative number.');
        }

        room.seek(parsed.data.time);

        io.to(room.id).emit('sync_state', room.toSyncStatePayload());

        if (dbService) {
          dbService.saveRoom({
            id: room.id,
            video_id: room.videoId,
            play_state: room.playState,
            current_time: room.currentTime,
            updated_at: room.updatedAt,
          }).catch(() => {});
        }
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 6. CHANGE VIDEO
    socket.on('change_video', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) {
          return sendError('NOT_FOUND', 'You must join a room first.');
        }

        if (!canPerformAction(participant.role, 'change_video')) {
          return sendError('FORBIDDEN', 'You do not have permission to change video.');
        }

        const parsed = ChangeVideoSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return sendError('BAD_REQUEST', 'Invalid change_video payload.');
        }

        const extractedId = extractYouTubeId(parsed.data.videoId);
        if (!extractedId) {
          return sendError('BAD_REQUEST', 'Invalid YouTube URL or Video ID.');
        }

        room.changeVideo(extractedId);

        io.to(room.id).emit('sync_state', room.toSyncStatePayload());

        if (dbService) {
          dbService.saveRoom({
            id: room.id,
            video_id: room.videoId,
            play_state: room.playState,
            current_time: room.currentTime,
            updated_at: room.updatedAt,
          }).catch(() => {});
        }
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 7. ASSIGN ROLE
    socket.on('assign_role', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) {
          return sendError('NOT_FOUND', 'You must join a room first.');
        }

        if (!canPerformAction(participant.role, 'assign_role')) {
          return sendError('FORBIDDEN', 'Only the Host can assign roles.');
        }

        const parsed = AssignRoleSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return sendError('BAD_REQUEST', 'Invalid assign_role payload.');
        }

        const { userId, role } = parsed.data;
        const target = room.getParticipant(userId);
        if (!target) {
          return sendError('NOT_FOUND', 'Target user is not in the room.');
        }

        const updated = room.assignRole(userId, role);
        if (!updated) {
          return sendError('INTERNAL_ERROR', 'Could not assign role.');
        }

        io.to(room.id).emit('role_assigned', {
          userId: updated.userId,
          username: updated.username,
          role: updated.role,
          participants: room.getAllParticipants(),
        });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 8. REMOVE PARTICIPANT
    socket.on('remove_participant', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) {
          return sendError('NOT_FOUND', 'You must join a room first.');
        }

        if (!canPerformAction(participant.role, 'remove_participant')) {
          return sendError('FORBIDDEN', 'Only the Host can remove participants.');
        }

        const parsed = RemoveParticipantSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return sendError('BAD_REQUEST', 'Invalid remove_participant payload.');
        }

        const { userId } = parsed.data;
        if (userId === participant.userId) {
          return sendError('BAD_REQUEST', 'Host cannot remove themselves.');
        }

        const target = room.getParticipant(userId);
        if (!target) {
          return sendError('NOT_FOUND', 'Target user is not in the room.');
        }

        const targetSocketId = target.socketId;
        const removed = room.kickParticipant(userId);

        if (removed) {
          // Notify target socket directly and remove from room
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) {
            targetSocket.emit('error', {
              code: 'FORBIDDEN',
              message: 'You have been removed from the room by the host.',
            });
            targetSocket.leave(room.id);
            targetSocket.data.roomId = undefined;
          }

          // Broadcast to remaining participants
          io.to(room.id).emit('participant_removed', {
            userId: removed.userId,
            participants: room.getAllParticipants(),
          });
        }
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // DISCONNECT
    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = roomManager.getRoom(roomId);
      if (room) {
        const removed = room.removeParticipantBySocket(socket.id);
        if (removed) {
          io.to(roomId).emit('user_left', {
            username: removed.username,
            userId: removed.userId,
            participants: room.getAllParticipants(),
          });
        }
      }
    });
  });
}
