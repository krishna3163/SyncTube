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
  PlaylistAddSchema,
  PlaylistRemoveSchema,
  PlaylistReorderSchema,
  PlaylistMoveTopSchema,
  ActionRequestSchema,
  RespondActionRequestSchema,
  ChatMessageSchema,
  ToggleMessageReactionSchema,
  SendReactionSchema,
  SendSoundEffectSchema,
} from './schemas.js';
import { PendingActionRequest, ChatMessage, EmojiReaction, SoundEffectPayload } from '../types.js';

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
        // Send current playlist to the newly joined client
        socket.emit('playlist_sync', { playlist: room.playlist });
        // Send current pending action requests
        socket.emit('pending_requests_sync', { requests: room.getPendingRequests() });

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

    // 11. PLAYLIST — ADD
    socket.on('playlist_add', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR')
          return sendError('FORBIDDEN', 'Only Host/Mod can modify playlist.');

        const parsed = PlaylistAddSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid playlist_add payload.');

        const { videoId, title } = parsed.data;
        const extracted = extractYouTubeId(videoId);
        if (!extracted) return sendError('BAD_REQUEST', 'Invalid YouTube URL or Video ID.');

        const item = {
          id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          videoId: extracted,
          title: title || `Video (${extracted})`,
          addedBy: participant.username,
        };
        room.addToPlaylist(item);
        io.to(room.id).emit('playlist_update', { playlist: room.playlist });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 12. PLAYLIST — REMOVE
    socket.on('playlist_remove', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR')
          return sendError('FORBIDDEN', 'Only Host/Mod can modify playlist.');

        const parsed = PlaylistRemoveSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid playlist_remove payload.');

        room.removeFromPlaylist(parsed.data.itemId);
        io.to(room.id).emit('playlist_update', { playlist: room.playlist });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 13. PLAYLIST — REORDER
    socket.on('playlist_reorder', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR')
          return sendError('FORBIDDEN', 'Only Host/Mod can modify playlist.');

        const parsed = PlaylistReorderSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid playlist_reorder payload.');

        room.reorderPlaylist(parsed.data.fromIndex, parsed.data.toIndex);
        io.to(room.id).emit('playlist_update', { playlist: room.playlist });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 14. PLAYLIST — MOVE TO TOP
    socket.on('playlist_move_top', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR')
          return sendError('FORBIDDEN', 'Only Host/Mod can modify playlist.');

        const parsed = PlaylistMoveTopSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid playlist_move_top payload.');

        room.moveToTop(parsed.data.itemId);
        io.to(room.id).emit('playlist_update', { playlist: room.playlist });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 9. TIME SYNC PING (NTP-style clock sync for ultra-low latency)
    socket.on('time_sync_ping', (rawPayload: unknown) => {
      const clientTime = (rawPayload && typeof (rawPayload as any).clientTime === 'number')
        ? (rawPayload as any).clientTime
        : Date.now();
      socket.emit('time_sync_pong', {
        clientTime,
        serverTime: Date.now(),
      });
    });

    // 10. HOST SYNC PULSE (Authoritative continuous playback position heartbeat)
    socket.on('host_sync_pulse', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR') return;

        const time = (rawPayload && typeof (rawPayload as any).time === 'number')
          ? (rawPayload as any).time
          : undefined;

        if (time !== undefined && !isNaN(time) && time >= 0) {
          if (room.playState === 'playing') {
            room.currentTime = time;
            room.updatedAt = Date.now();
            socket.to(room.id).emit('sync_pulse', {
              currentTime: time,
              serverTime: Date.now(),
            });
          }
        }
      } catch {}
    });

    // 15. PARTICIPANT ACTION REQUEST (Participant asks Admin/Mod to approve play/pause/seek/video change)
    socket.on('request_action', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');

        const parsed = ActionRequestSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid request_action payload.');

        const { type, data } = parsed.data;
        let extractedVideoId: string | undefined = undefined;
        if (type === 'change_video') {
          if (!data?.videoId) return sendError('BAD_REQUEST', 'Missing videoId for change_video request.');
          const extracted = extractYouTubeId(data.videoId);
          if (!extracted) return sendError('BAD_REQUEST', 'Invalid YouTube URL or Video ID.');
          extractedVideoId = extracted;
        }

        const request: PendingActionRequest = {
          id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          requesterId: participant.userId,
          requesterName: participant.username,
          type,
          data: data
            ? {
                time: data.time,
                videoId: extractedVideoId || data.videoId,
              }
            : undefined,
          createdAt: Date.now(),
        };

        room.addPendingRequest(request);
        io.to(room.id).emit('action_requested', { request });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 16. RESPOND TO ACTION REQUEST (Host/Moderator approves or rejects participant action request)
    socket.on('respond_action_request', async (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');

        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR') {
          return sendError('FORBIDDEN', 'Only Host and Moderator can approve or reject action requests.');
        }

        const parsed = RespondActionRequestSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid respond_action_request payload.');

        const { requestId, approved } = parsed.data;
        const request = room.getPendingRequest(requestId);
        if (!request) return sendError('NOT_FOUND', 'Action request not found or already resolved.');

        room.removePendingRequest(requestId);

        if (approved) {
          if (request.type === 'play') {
            room.play(request.data?.time);
          } else if (request.type === 'pause') {
            room.pause(request.data?.time);
          } else if (request.type === 'seek' && typeof request.data?.time === 'number') {
            room.seek(request.data.time);
          } else if (request.type === 'change_video' && request.data?.videoId) {
            room.changeVideo(request.data.videoId);
          }

          io.to(room.id).emit('sync_state', room.toSyncStatePayload());

          if (dbService) {
            dbService
              .saveRoom({
                id: room.id,
                video_id: room.videoId,
                play_state: room.playState,
                current_time: room.currentTime,
                updated_at: room.updatedAt,
              })
              .catch(() => {});
          }
        }

        io.to(room.id).emit('action_request_resolved', {
          requestId,
          approved,
          resolvedBy: participant.username,
          request,
        });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 17. CHAT MESSAGE
    socket.on('chat_message', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');

        const parsed = ChatMessageSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return sendError('BAD_REQUEST', 'Invalid chat_message payload. Message must be 1-500 characters.');
        }

        const message: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId: participant.userId,
          username: participant.username,
          userColor: parsed.data.userColor,
          avatarId: parsed.data.avatarId,
          role: participant.role,
          text: parsed.data.text,
          timestamp: Date.now(),
          replyTo: parsed.data.replyTo,
          reactions: {},
        };

        io.to(room.id).emit('chat_message', message);
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 17.5. TOGGLE MESSAGE REACTION
    socket.on('toggle_message_reaction', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');

        const parsed = ToggleMessageReactionSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid toggle_message_reaction payload.');

        io.to(room.id).emit('message_reaction_updated', {
          messageId: parsed.data.messageId,
          emoji: parsed.data.emoji,
          userId: participant.userId,
          username: participant.username,
        });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 18. EMOJI REACTION
    socket.on('send_reaction', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');

        const parsed = SendReactionSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid send_reaction payload.');

        const reaction: EmojiReaction = {
          id: `rx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          emoji: parsed.data.emoji,
          userId: participant.userId,
          username: participant.username,
          timestamp: Date.now(),
        };

        io.to(room.id).emit('reaction_received', reaction);
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 19. SOUND EFFECT
    socket.on('send_sound_effect', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');

        const parsed = SendSoundEffectSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid send_sound_effect payload.');

        const soundPayload: SoundEffectPayload = {
          soundId: parsed.data.soundId,
          userId: participant.userId,
          username: participant.username,
          timestamp: Date.now(),
        };

        io.to(room.id).emit('sound_effect_received', soundPayload);
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
