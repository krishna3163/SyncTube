import { callTopologyPolicyManager } from '../media/callTopologyPolicy.js';
import { mediasoupManager } from '../media/mediasoupManager.js';
import {
  SfuGetCapabilitiesSchema,
  SfuCreateTransportSchema,
  SfuConnectTransportSchema,
  SfuProduceSchema,
  SfuConsumeSchema,
  SfuConsumerResumeSchema,
  SfuPreferredLayersSchema,
  SfuCloseProducerSchema,
  CallSfuReadySchema,
  CallP2POfferSchema,
  CallP2PAnswerSchema,
  CallP2PIceCandidateSchema,
} from './schemas.js';
import { Server, Socket } from 'socket.io';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { RoomManager } from '../models/RoomManager.js';
import { DatabaseService } from '../services/db.js';
import { canPerformAction } from '../services/permissions.js';
import { extractYouTubeId } from '../utils/youtube.js';
import { detectMediaSource } from '../utils/media.js';
import { serverSentry } from '../services/sentry.js';
import {
  ExtensionStatusSchema,
  AssignRoleSchema,
  ChangeVideoSchema,
  JoinRoomSchema,
  LeaveRoomSchema,
  PlayPauseSchema,
  RemoveParticipantSchema,
  SeekSchema,
  PlaylistAddSchema,
  PlaylistAddBatchSchema,
  AdminToggleBlockSchema,
  AdminStopScreenShareSchema,
  PlaylistRemoveSchema,
  PlaylistReorderSchema,
  PlaylistMoveTopSchema,
  PlaylistVoteSchema,
  PlaylistShuffleSchema,
  PlaylistClearSchema,
  ActionRequestSchema,
  RespondActionRequestSchema,
  ChatMessageSchema,
  ToggleMessageReactionSchema,
  SendReactionSchema,
  SendSoundEffectSchema,
  UpdateAvatarSchema,
  CreatePollSchema,
  VotePollSchema,
  PartyReadySchema,
  SyncPlaySchema,
  SyncPauseSchema,
  SyncSeekSchema,
  SyncDriftCheckSchema,
  MediaChangedSchema,
  ChatTypingSchema,
  RoomStartTabStreamSchema,
  ToggleLikeSchema,
  SetCategorySchema,
  SetDescriptionSchema,
  SetTagsSchema,
  WebRtcOfferSchema,
  WebRtcAnswerSchema,
  WebRtcIceCandidateSchema,
  WebRtcRequestStreamSchema,
  CallJoinSchema,
  CallMediaStateSchema,
} from './schemas.js';
import { PendingActionRequest, ChatMessage, EmojiReaction, SoundEffectPayload } from '../types.js';

export interface CallParticipant {
  socketId: string;
  userId: string;
  username: string;
  avatarId?: string;
  hasAudio: boolean;
  hasVideo: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
}

const activeRoomCalls = new Map<string, Map<string, CallParticipant>>();
const activeRoomScreenShares = new Map<string, { socketId: string; userId: string; username: string; title: string }>();
const userReactionTimestamps = new Map<string, number[]>();
const userSoundEffectCooldowns = new Map<string, number>();

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
    // Helper to send error to client with Sentry reporting
    const sendError = (code: 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST' | 'ALREADY_EXISTS' | 'INTERNAL_ERROR', message: string) => {
      if (code === 'INTERNAL_ERROR') {
        serverSentry.captureMessage(`Socket Error [${code}]: ${message}`, 'error');
      }
      const safeMessage = (code === 'INTERNAL_ERROR' && process.env.NODE_ENV === 'production')
        ? 'An internal server error occurred.'
        : message;
      socket.emit('error', { code, message: safeMessage });
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

        const { roomId, username, userId, identityToken } = parsed.data;
        const normalizedRoomId = roomId.toUpperCase();
        let room = roomManager.getRoom(normalizedRoomId);

        // If not in memory, check if exists in DB
        if (!room && dbService) {
          const dbRecord = await dbService.getRoom(normalizedRoomId);
          if (dbRecord) {
            room = roomManager.getRoom(normalizedRoomId);
            if (!room) {
              room = roomManager.createRoom(dbRecord.id, dbRecord.video_id);
              room.playState = dbRecord.play_state as any;
              room.currentTime = dbRecord.current_time;
              room.updatedAt = Number(dbRecord.updated_at);
            }
          }
        }

        if (!room) {
          return sendError('NOT_FOUND', `Room "${roomId}" does not exist.`);
        }

        if (room.isRemoved(userId)) {
          return sendError('FORBIDDEN', 'You have been removed from this room.');
        }

        const credentialHash = room.getIdentityCredentialHash(userId);
        if (credentialHash) {
          const candidateHash = identityToken
            ? createHash('sha256').update(identityToken).digest('hex')
            : '';
          const stored = Buffer.from(credentialHash, 'hex');
          const candidate = Buffer.from(candidateHash, 'hex');
          if (stored.length !== candidate.length || !timingSafeEqual(stored, candidate)) {
            return sendError('FORBIDDEN', 'Identity verification failed. Rejoin using this browser session.');
          }
        } else {
          if (room.getParticipant(userId)) {
            return sendError('FORBIDDEN', 'Identity verification failed. Rejoin using this browser session.');
          }
          const issuedToken = randomBytes(32).toString('hex');
          room.registerIdentityCredential(
            userId,
            createHash('sha256').update(issuedToken).digest('hex')
          );
          socket.emit('identity_credential', { roomId: normalizedRoomId, userId, token: issuedToken });
        }

        // Leave any previous room
        if (socket.data.roomId && socket.data.roomId !== normalizedRoomId) {
          socket.leave(socket.data.roomId);
        }

        socket.data.roomId = normalizedRoomId;
        socket.data.userId = userId;
        socket.join(normalizedRoomId);
        room.clearDisconnectTimer(userId);

        const isCreator = room.creatorUserId === userId;
        const participant = room.addParticipant(userId, socket.id, username, isCreator, parsed.data.avatarId);

        // Send current authoritative room state to the newly joined client
        socket.emit('sync_state', room.toSyncStatePayload());
        if (room.activePoll) socket.emit('poll_updated', room.activePoll);
        // Send current playlist to the newly joined client
        socket.emit('playlist_sync', { playlist: room.playlist });
        // Send current pending action requests
        socket.emit('pending_requests_sync', { requests: room.getPendingRequests() });
        // Send recent chat message history
        socket.emit('chat_history', { messages: room.getChatMessages() });

        // Send V2 Universal state snapshot and readiness
        socket.emit('sync:state', room.getUniversalSnapshot());
        socket.emit('party:readiness_update', { readiness: room.universalSync.getAllReadiness() });

        // Send active call state upon joining so every viewer sees sidebar-call-header immediately!
        const existingCalls = activeRoomCalls.get(normalizedRoomId);
        socket.emit('call:participants_updated', {
          count: existingCalls ? existingCalls.size : 0,
          participants: existingCalls ? Array.from(existingCalls.values()) : [],
        });

        // Send active screen share if one is currently in progress
        const existingScreen = activeRoomScreenShares.get(normalizedRoomId);
        if (existingScreen) {
          socket.emit('room:tab_stream_started', {
            streamerSocketId: existingScreen.socketId,
            streamerId: existingScreen.userId,
            streamerName: existingScreen.username,
            title: existingScreen.title,
          });
        }


        // Broadcast to everyone in the room that a user joined
        io.to(normalizedRoomId).emit('user_joined', {
          username: participant.username,
          userId: participant.userId,
          role: participant.role,
          avatarId: participant.avatarId,
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
          const previousHostUserId = room.hostUserId;
          const removed = room.removeParticipantBySocket(socket.id);
          socket.leave(roomId);
          socket.data.roomId = undefined;

          if (removed) {
            io.to(roomId).emit('user_left', {
              username: removed.username,
              userId: removed.userId,
              participants: room.getAllParticipants(),
            });
            if (room.hostUserId && room.hostUserId !== previousHostUserId) {
              const promoted = room.getParticipant(room.hostUserId);
              if (promoted) {
                io.to(roomId).emit('role_assigned', {
                  userId: promoted.userId,
                  username: promoted.username,
                  role: promoted.role,
                  participants: room.getAllParticipants(),
                });
              }
            }
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

        const media = detectMediaSource(parsed.data.videoId);
        if (!media) {
          return sendError('BAD_REQUEST', 'Invalid YouTube URL, video stream, or movie link.');
        }

        const mediaTitle = parsed.data.title || media.title;
        const mediaPlatform = parsed.data.platform || media.platform;
        room.changeVideo(media.mediaId, mediaTitle, mediaPlatform);
        if (parsed.data.play) {
          room.play(0);
        }

        io.to(room.id).emit('sync_state', room.toSyncStatePayload());
        io.to(room.id).emit('media_changed', {
          platform: mediaPlatform,
          mediaId: media.mediaId,
          title: mediaTitle,
          url: media.url,
        });

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
          // Tear down any active call and SFU resources for kicked participant
          const roomCalls = activeRoomCalls.get(room.id);
          if (roomCalls && roomCalls.has(targetSocketId)) {
            roomCalls.delete(targetSocketId);
            const decision = callTopologyPolicyManager.evaluateOnLeave(room.id, targetSocketId);
            mediasoupManager.handleParticipantLeave(room.id, targetSocketId);
            if (decision.activeCallerCount <= 1) {
              mediasoupManager.disposeCallRouter(room.id);
            }
            io.to(room.id).emit('call:user_left', { socketId: targetSocketId });
            io.to(room.id).emit('call:participants_updated', {
              count: roomCalls.size,
              participants: Array.from(roomCalls.values()),
            });
            if (decision.shouldTransition) {
              io.to(room.id).emit('call:topology_transition', {
                previousMode: decision.previousMode,
                mode: decision.targetMode,
                version: decision.version,
                activeCallers: decision.callers,
              });
            }
          }

          // If target was sharing screen, clean up screen share
          const roomShare = activeRoomScreenShares.get(room.id);
          if (roomShare && roomShare.socketId === targetSocketId) {
            activeRoomScreenShares.delete(room.id);
            io.to(room.id).emit('room:tab_stream_stopped', {
              streamerSocketId: targetSocketId,
              streamerId: userId,
            });
          }

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

        const { videoId, title, duration, channel, thumbnail, platform } = parsed.data;
        const media = detectMediaSource(videoId);
        if (!media) return sendError('BAD_REQUEST', 'Invalid YouTube URL, video stream, or movie link.');
        if (room.playlist.some((playlistItem) => playlistItem.videoId === media.mediaId)) {
          return sendError('ALREADY_EXISTS', 'That video or movie is already in the playlist.');
        }

        const item = {
          id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          videoId: media.mediaId,
          title: title || media.title,
          duration: duration || '',
          channel: channel || (media.platform === 'youtube' ? '' : media.platform.toUpperCase()),
          thumbnail: thumbnail || (media.platform === 'youtube' ? `https://img.youtube.com/vi/${media.mediaId}/hqdefault.jpg` : ''),
          addedBy: participant.username,
          addedByAvatarId: participant.avatarId,
          votes: [],
          platform: platform || media.platform,
        };
        room.addToPlaylist(item);
        io.to(room.id).emit('playlist_update', { playlist: room.playlist });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 11-batch. PLAYLIST — ADD BATCH (Import whole YouTube playlist)
    socket.on('playlist_add_batch', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR')
          return sendError('FORBIDDEN', 'Only Host/Mod can modify playlist.');

        const parsed = PlaylistAddBatchSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid playlist_add_batch payload.');

        let addedCount = 0;
        for (const itemData of parsed.data.items) {
          const { videoId, title, duration, channel, thumbnail, platform } = itemData;
          const media = detectMediaSource(videoId);
          if (!media) continue;
          if (room.playlist.some((playlistItem) => playlistItem.videoId === media.mediaId)) {
            continue;
          }

          const item = {
            id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            videoId: media.mediaId,
            title: title || media.title,
            duration: duration || '',
            channel: channel || (media.platform === 'youtube' ? '' : media.platform.toUpperCase()),
            thumbnail: thumbnail || (media.platform === 'youtube' ? `https://img.youtube.com/vi/${media.mediaId}/hqdefault.jpg` : ''),
            addedBy: participant.username,
            addedByAvatarId: participant.avatarId,
            votes: [],
            platform: platform || media.platform,
          };
          room.addToPlaylist(item);
          addedCount++;
        }

        if (addedCount > 0) {
          io.to(room.id).emit('playlist_update', { playlist: room.playlist });
        }
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 11b. PLAYLIST — VOTE (Any room participant can vote/upvote)
    socket.on('playlist_vote', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');

        const parsed = PlaylistVoteSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid playlist_vote payload.');

        const success = room.votePlaylistItem(parsed.data.itemId, participant.userId);
        if (success) {
          io.to(room.id).emit('playlist_update', { playlist: room.playlist });
        }
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 11c. PLAYLIST — SHUFFLE
    socket.on('playlist_shuffle', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR')
          return sendError('FORBIDDEN', 'Only Host/Mod can shuffle playlist.');
        if (!PlaylistShuffleSchema.safeParse(rawPayload).success)
          return sendError('BAD_REQUEST', 'Invalid playlist_shuffle payload.');

        room.shufflePlaylist();
        io.to(room.id).emit('playlist_update', { playlist: room.playlist });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 11d. PLAYLIST — CLEAR
    socket.on('playlist_clear', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR')
          return sendError('FORBIDDEN', 'Only Host/Mod can clear playlist.');
        if (!PlaylistClearSchema.safeParse(rawPayload).success)
          return sendError('BAD_REQUEST', 'Invalid playlist_clear payload.');

        room.clearPlaylist();
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

            socket.on('set_playback_speed', (rawPayload: unknown) => {
              try {
                const { room, participant } = getContext();
                if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');
                if (participant.role !== 'HOST' && participant.role !== 'MODERATOR') {
                  return sendError('FORBIDDEN', 'Only hosts and moderators can change playback speed.');
                }
                const speed = rawPayload && typeof (rawPayload as { speed?: unknown }).speed === 'number'
                  ? (rawPayload as { speed: number }).speed
                  : NaN;
                if (!Number.isFinite(speed) || speed < 0.25 || speed > 2) {
                  return sendError('BAD_REQUEST', 'Playback speed must be between 0.25x and 2x.');
                }
                io.to(room.id).emit('playback_speed_updated', { speed });
              } catch (err) {
                sendError('INTERNAL_ERROR', (err as Error).message);
              }
            });
          }
        }
      } catch {}
    });

    // 15. PARTICIPANT ACTION REQUEST (Participant asks Admin/Mod to approve play/pause/seek/video change/next video)
    socket.on('request_action', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');

        const parsed = ActionRequestSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid request_action payload.');

        const { type, data } = parsed.data;
        let extractedVideoId: string | undefined = undefined;
        if (type === 'change_video' || type === 'request_next_video') {
          if (!data?.videoId) return sendError('BAD_REQUEST', `Missing videoId for ${type} request.`);
          const media = detectMediaSource(data.videoId);
          if (!media) return sendError('BAD_REQUEST', 'Invalid YouTube URL, video stream, or movie link.');
          extractedVideoId = media.mediaId;
        }

        const request: PendingActionRequest = {
          id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          requesterId: participant.userId,
          requesterName: participant.username,
          requesterAvatarId: participant.avatarId,
          type,
          data: data
            ? {
                time: data.time,
                videoId: extractedVideoId || data.videoId,
                title: data.title,
                duration: data.duration,
                channel: data.channel,
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

        const { requestId, approved, mode } = parsed.data;
        const request = room.getPendingRequest(requestId);
        if (!request) return sendError('NOT_FOUND', 'Action request not found or already resolved.');

        room.removePendingRequest(requestId);

        if (approved) {
          if (request.type === 'play') {
            room.play(request.data?.time);
            io.to(room.id).emit('sync_state', room.toSyncStatePayload());
          } else if (request.type === 'pause') {
            room.pause(request.data?.time);
            io.to(room.id).emit('sync_state', room.toSyncStatePayload());
          } else if (request.type === 'seek' && typeof request.data?.time === 'number') {
            room.seek(request.data.time);
            io.to(room.id).emit('sync_state', room.toSyncStatePayload());
          } else if (request.type === 'request_next_video' || (request.type === 'change_video' && mode === 'next')) {
            // Added to top of playlist as next up
            if (request.data?.videoId) {
              const newItem = {
                id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                videoId: request.data.videoId,
                title: request.data.title || `Video (${request.data.videoId})`,
                duration: request.data.duration || '',
                channel: request.data.channel || '',
                thumbnail: `https://img.youtube.com/vi/${request.data.videoId}/hqdefault.jpg`,
                addedBy: request.requesterName,
                addedByAvatarId: request.requesterAvatarId,
                votes: [],
              };
              room.addToPlaylist(newItem, true);
              io.to(room.id).emit('playlist_update', { playlist: room.playlist });
            }
          } else if (request.type === 'change_video' && request.data?.videoId) {
            room.changeVideo(request.data.videoId);
            io.to(room.id).emit('sync_state', room.toSyncStatePayload());
          } else if (request.type === 'join_call') {
            const targetPart = room.getParticipant(request.requesterId);
            if (targetPart?.socketId) {
              io.to(targetPart.socketId).emit('call:join_approved', { approvedBy: participant.username });
            }
          } else if (request.type === 'share_screen') {
            const targetPart = room.getParticipant(request.requesterId);
            if (targetPart?.socketId) {
              io.to(targetPart.socketId).emit('call:share_screen_approved', { approvedBy: participant.username });
            }
          }

          if (dbService && (request.type === 'play' || request.type === 'pause' || request.type === 'seek' || (request.type === 'change_video' && mode !== 'next'))) {
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
        } else {
          if (request.type === 'join_call') {
            const targetPart = room.getParticipant(request.requesterId);
            if (targetPart?.socketId) {
              io.to(targetPart.socketId).emit('call:join_denied', { deniedBy: participant.username });
            }
          } else if (request.type === 'share_screen') {
            const targetPart = room.getParticipant(request.requesterId);
            if (targetPart?.socketId) {
              io.to(targetPart.socketId).emit('call:share_screen_denied', { deniedBy: participant.username });
            }
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

        if (room.isBlockedFromChat(participant.userId)) {
          return sendError('FORBIDDEN', 'You have been muted in chat by the host.');
        }

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

        if (parsed.data.avatarId) {
          participant.avatarId = parsed.data.avatarId;
        }

        room.addChatMessage(message);
        io.to(room.id).emit('chat_message', message);
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 17.2. UPDATE AVATAR
    socket.on('update_avatar', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');

        const parsed = UpdateAvatarSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid update_avatar payload.');

        participant.avatarId = parsed.data.avatarId;
        io.to(room.id).emit('participant_avatar_updated', {
          userId: participant.userId,
          username: participant.username,
          avatarId: parsed.data.avatarId,
          participants: room.getAllParticipants(),
        });
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

        room.toggleMessageReaction(parsed.data.messageId, parsed.data.emoji, participant.userId);
        const message = room.getChatMessages().find((item) => item.id === parsed.data.messageId);

        io.to(room.id).emit('message_reaction_updated', {
          messageId: parsed.data.messageId,
          emoji: parsed.data.emoji,
          userId: participant.userId,
          username: participant.username,
          reactions: message?.reactions || {},
        });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 18. EMOJI REACTION (with per-user rate limit: max 10 reactions per 3s)
    socket.on('send_reaction', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');

        const now = Date.now();
        const timestamps = userReactionTimestamps.get(participant.userId) || [];
        const recentTimestamps = timestamps.filter((t) => now - t < 3000);
        if (recentTimestamps.length >= 10) {
          return sendError('BAD_REQUEST', 'Too many reactions. Please wait a moment.');
        }
        recentTimestamps.push(now);
        userReactionTimestamps.set(participant.userId, recentTimestamps);

        const parsed = SendReactionSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid send_reaction payload.');

        const reaction: EmojiReaction = {
          id: `rx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          emoji: parsed.data.emoji,
          userId: participant.userId,
          username: participant.username,
          timestamp: Date.now(),
          videoTime: parsed.data.videoTime,
        };

        io.to(room.id).emit('reaction_received', reaction);
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    socket.on('create_poll', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR') return sendError('FORBIDDEN', 'Only hosts and moderators can create polls.');
        const parsed = CreatePollSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid poll payload.');
        room.activePoll = {
          id: `poll_${Date.now()}`,
          question: parsed.data.question,
          options: parsed.data.options,
          votes: {},
          createdBy: participant.userId,
        };
        io.to(room.id).emit('poll_updated', room.activePoll);
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    socket.on('vote_poll', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');
        if (!room.activePoll) return sendError('NOT_FOUND', 'No active poll in this room.');
        const parsed = VotePollSchema.safeParse(rawPayload);
        if (!parsed.success || parsed.data.optionIndex < 0 || parsed.data.optionIndex >= room.activePoll.options.length) {
          return sendError('BAD_REQUEST', 'Invalid poll option index.');
        }

        // Clean existing vote across all option keys
        for (const [key, voters] of Object.entries(room.activePoll.votes)) {
          room.activePoll.votes[key] = voters.filter((id) => id !== participant.userId);
        }

        const selectedKey = String(parsed.data.optionIndex);
        if (!room.activePoll.votes[selectedKey]) {
          room.activePoll.votes[selectedKey] = [];
        }
        room.activePoll.votes[selectedKey].push(participant.userId);

        io.to(room.id).emit('poll_updated', room.activePoll);
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // 19. SOUND EFFECT (with per-user cooldown: min 1000ms cooldown)
    socket.on('send_sound_effect', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return sendError('NOT_FOUND', 'You must join a room first.');

        const now = Date.now();
        const lastSound = userSoundEffectCooldowns.get(participant.userId) || 0;
        if (now - lastSound < 1000) {
          return sendError('BAD_REQUEST', 'Soundboard is cooling down. Please wait a moment.');
        }
        userSoundEffectCooldowns.set(participant.userId, now);

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

    // ── V2 UNIVERSAL SYNC & PARTY EVENT HANDLERS ────────────────
    
    // PARTY READINESS
    socket.on('party:ready', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;

        const parsed = PartyReadySchema.safeParse(rawPayload);
        if (!parsed.success) {
          return sendError('BAD_REQUEST', 'Invalid party:ready payload.');
        }

        room.universalSync.setParticipantReadiness(
          participant.userId,
          participant.username,
          parsed.data.status,
          {
            reportedPosition: parsed.data.reportedPosition,
            activePlatform: parsed.data.activePlatform,
            activeMediaId: parsed.data.activeMediaId,
          }
        );

        io.to(room.id).emit('party:readiness_update', {
          readiness: room.universalSync.getAllReadiness(),
          updatedUserId: participant.userId,
        });

        // If host enabled auto-play when ready
        if (room.universalSync.shouldAutoPlayWhenReady()) {
          room.play(undefined, undefined, 'system_ready');
          io.to(room.id).emit('sync_state', room.toSyncStatePayload());
          io.to(room.id).emit('sync:state', room.getUniversalSnapshot());
        }
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // SYNC:PLAY (V2 with revision conflict check & idempotency)
    socket.on('sync:play', async (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;

        if (!canPerformAction(participant.role, 'play')) {
          return sendError('FORBIDDEN', 'Only hosts and moderators can play media.');
        }

        const parsed = SyncPlaySchema.safeParse(rawPayload || {});
        if (!parsed.success) {
          return sendError('BAD_REQUEST', 'Invalid sync:play payload.');
        }

        const currentRev = room.universalSync.getRevision();
        if (parsed.data?.revision !== undefined && parsed.data.revision < currentRev) {
          // Reject stale event to prevent race condition
          socket.emit('sync:rejected', { reason: 'stale_revision', currentRevision: currentRev });
          socket.emit('sync:state', room.getUniversalSnapshot());
          return;
        }

        room.play(parsed.data?.position, parsed.data?.eventId, participant.userId);

        if (dbService) {
          await dbService.saveRoom({
            id: room.id,
            video_id: room.videoId,
            play_state: room.playState,
            current_time: room.currentTime,
            updated_at: room.updatedAt,
          });
        }

        io.to(room.id).emit('sync_state', room.toSyncStatePayload());
        io.to(room.id).emit('sync:state', room.getUniversalSnapshot());
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // SYNC:PAUSE (V2 with revision conflict check & idempotency)
    socket.on('sync:pause', async (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;

        if (!canPerformAction(participant.role, 'pause')) {
          return sendError('FORBIDDEN', 'Only hosts and moderators can pause media.');
        }

        const parsed = SyncPauseSchema.safeParse(rawPayload || {});
        if (!parsed.success) {
          return sendError('BAD_REQUEST', 'Invalid sync:pause payload.');
        }

        const currentRev = room.universalSync.getRevision();
        if (parsed.data?.revision !== undefined && parsed.data.revision < currentRev) {
          socket.emit('sync:rejected', { reason: 'stale_revision', currentRevision: currentRev });
          socket.emit('sync:state', room.getUniversalSnapshot());
          return;
        }

        room.pause(parsed.data?.position, parsed.data?.eventId, participant.userId);

        if (dbService) {
          await dbService.saveRoom({
            id: room.id,
            video_id: room.videoId,
            play_state: room.playState,
            current_time: room.currentTime,
            updated_at: room.updatedAt,
          });
        }

        io.to(room.id).emit('sync_state', room.toSyncStatePayload());
        io.to(room.id).emit('sync:state', room.getUniversalSnapshot());
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // SYNC:SEEK (V2 with revision conflict check)
    socket.on('sync:seek', async (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;

        if (!canPerformAction(participant.role, 'seek')) {
          return sendError('FORBIDDEN', 'Only hosts and moderators can seek media.');
        }

        const parsed = SyncSeekSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return sendError('BAD_REQUEST', 'Invalid sync:seek payload.');
        }

        const currentRev = room.universalSync.getRevision();
        if (parsed.data.revision !== undefined && parsed.data.revision < currentRev) {
          socket.emit('sync:rejected', { reason: 'stale_revision', currentRevision: currentRev });
          socket.emit('sync:state', room.getUniversalSnapshot());
          return;
        }

        room.seek(parsed.data.position, parsed.data.eventId, participant.userId);

        if (dbService) {
          await dbService.saveRoom({
            id: room.id,
            video_id: room.videoId,
            play_state: room.playState,
            current_time: room.currentTime,
            updated_at: room.updatedAt,
          });
        }

        io.to(room.id).emit('sync_state', room.toSyncStatePayload());
        io.to(room.id).emit('sync:state', room.getUniversalSnapshot());
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // SYNC:DRIFT_CHECK
    socket.on('sync:drift_check', (rawPayload: unknown) => {
      try {
        const { room } = getContext();
        if (!room) return;

        const parsed = SyncDriftCheckSchema.safeParse(rawPayload);
        if (!parsed.success) return;

        const now = Date.now();
        const rtt = Math.max(0, now - parsed.data.clientTimestamp);
        const assessment = room.universalSync.assessDrift(parsed.data.clientPosition, rtt);

        socket.emit('sync:drift_assessment', {
          ...assessment,
          serverTimestamp: now,
          rttMs: rtt,
          snapshot: room.getUniversalSnapshot(),
        });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // MEDIA:CHANGED (V2 Universal Media Change)
    socket.on('media:changed', async (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;

        if (!canPerformAction(participant.role, 'change_video')) {
          return sendError('FORBIDDEN', 'Only hosts and moderators can change media.');
        }

        const parsed = MediaChangedSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return sendError('BAD_REQUEST', 'Invalid media:changed payload.');
        }

        room.changeVideo(parsed.data.mediaId, parsed.data.title, parsed.data.platform);

        if (dbService) {
          await dbService.saveRoom({
            id: room.id,
            video_id: room.videoId,
            play_state: room.playState,
            current_time: room.currentTime,
            updated_at: room.updatedAt,
          });
        }

        io.to(room.id).emit('sync_state', room.toSyncStatePayload());
        io.to(room.id).emit('sync:state', room.getUniversalSnapshot());
        io.to(room.id).emit('media:changed', {
          mediaIdentity: room.universalSync.getMediaIdentity(),
          changedBy: participant.username,
        });
      } catch (err) {
        sendError('INTERNAL_ERROR', (err as Error).message);
      }
    });

    // CHAT:TYPING
    socket.on('chat:typing', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;

        const parsed = ChatTypingSchema.safeParse(rawPayload);
        if (!parsed.success) return;

        socket.to(room.id).emit('chat:user_typing', {
          userId: participant.userId,
          username: participant.username,
          isTyping: parsed.data.isTyping,
        });
      } catch {
        // non-critical typing indicator error ignored
      }
    });

    // EXTENSION:STATUS
    socket.on('extension:status', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;

        const parsed = ExtensionStatusSchema.safeParse(rawPayload);
        if (!parsed.success) return;

        socket.emit('extension:acknowledged', {
          supportedPlatforms: ['youtube', 'generic', 'netflix', 'prime', 'disney'],
          roomMedia: room.universalSync.getMediaIdentity(),
        });
      } catch {
        // non-critical extension status error ignored
      }
    });


    // 26. ROOM TAB / SCREEN SHARING (SINGLE STREAMER ENFORCEMENT)
    socket.on('room:start_tab_stream', (rawPayload: unknown, callback?: (res: any) => void) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) {
          const err = 'You must join a room first.';
          callback?.({ success: false, error: err });
          return sendError('NOT_FOUND', err);
        }

        if (room.isBlockedFromScreenShare(participant.userId)) {
          const err = 'You have been restricted from sharing your screen by the host.';
          callback?.({ success: false, error: err });
          return sendError('FORBIDDEN', err);
        }

        // ONE SCREEN SHARE AT A TIME ENFORCEMENT
        const existingShare = activeRoomScreenShares.get(room.id);
        if (existingShare && existingShare.socketId !== socket.id) {
          const err = `Only one screen share is allowed at a time. @${existingShare.username} is currently sharing.`;
          callback?.({ success: false, error: err });
          return sendError('ALREADY_EXISTS', err);
        }

        const parsed = RoomStartTabStreamSchema.safeParse(rawPayload);
        const title = parsed.success && parsed.data?.title ? parsed.data.title : `${participant.username}'s Screen`;

        activeRoomScreenShares.set(room.id, {
          socketId: socket.id,
          userId: participant.userId,
          username: participant.username,
          title,
        });

        room.changeVideo('tab:share', title, 'tab_share');
        room.setIsLive(true);

        io.to(room.id).emit('sync_state', room.toSyncStatePayload());
        io.to(room.id).emit('room:tab_stream_started', {
          streamerSocketId: socket.id,
          streamerId: participant.userId,
          streamerName: participant.username,
          title,
        });

        callback?.({ success: true, title });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message });
        sendError('INTERNAL_ERROR', err?.message || 'Failed to start tab stream.');
      }
    });

    socket.on('room:stop_tab_stream', () => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;

        const currentShare = activeRoomScreenShares.get(room.id);
        if (currentShare && (currentShare.socketId === socket.id || canPerformAction(participant.role, 'change_video'))) {
          activeRoomScreenShares.delete(room.id);

          // Revert stage to current playlist video or empty
          const fallbackVideo = room.playlist[0]?.videoId ?? '';
          const fallbackTitle = room.playlist[0]?.title ?? '';
          room.changeVideo(fallbackVideo, fallbackTitle, fallbackVideo ? 'youtube' : 'generic');

          io.to(room.id).emit('sync_state', room.toSyncStatePayload());
          io.to(room.id).emit('room:tab_stream_stopped', {
            stoppedBy: participant.username,
          });
        }
      } catch (err: any) {
        sendError('INTERNAL_ERROR', err?.message || 'Failed to stop tab stream.');
      }
    });

    // 27. ROOM LIKES & CATEGORY
    socket.on('room:like_toggle', async () => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;
        const res = room.toggleLike(participant.userId);
        if (dbService) {
          await dbService.saveRoom({
            id: room.id,
            video_id: room.videoId,
            play_state: room.playState,
            current_time: room.currentTime,
            updated_at: room.updatedAt,
            created_at: room.createdAt,
            likes: room.likes,
            category: room.category,
          });
        }
        io.to(room.id).emit('room:likes_updated', {
          likes: res.likes,
          userId: participant.userId,
          hasLiked: res.hasLiked,
        });
      } catch (err: any) {
        sendError('INTERNAL_ERROR', err?.message || 'Failed to toggle room like.');
      }
    });

    socket.on('room:set_category', async (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;
        if (!canPerformAction(participant.role, 'change_video')) {
          return sendError('FORBIDDEN', 'Only Host can change stream category.');
        }
        const parsed = SetCategorySchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid stream category.');
        room.setCategory(parsed.data.category);
        if (dbService) {
          await dbService.saveRoom({
            id: room.id,
            video_id: room.videoId,
            play_state: room.playState,
            current_time: room.currentTime,
            updated_at: room.updatedAt,
            created_at: room.createdAt,
            likes: room.likes,
            category: room.category,
          });
        }
        io.to(room.id).emit('room:category_updated', { category: room.category });
      } catch (err: any) {
        sendError('INTERNAL_ERROR', err?.message || 'Failed to set stream category.');
      }
    });

    socket.on('room:set_description', async (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;
        if (!canPerformAction(participant.role, 'change_video')) {
          return sendError('FORBIDDEN', 'Only Host can edit stream description.');
        }
        const parsed = SetDescriptionSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid stream description.');
        room.setDescription(parsed.data.description);
        io.to(room.id).emit('room:description_updated', { description: room.description });
      } catch (err: any) {
        sendError('INTERNAL_ERROR', err?.message || 'Failed to set stream description.');
      }
    });

    socket.on('room:set_tags', async (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;
        if (!canPerformAction(participant.role, 'change_video')) {
          return sendError('FORBIDDEN', 'Only Host can edit stream tags.');
        }
        const parsed = SetTagsSchema.safeParse(rawPayload);
        if (!parsed.success) return sendError('BAD_REQUEST', 'Invalid stream tags.');
        room.setTags(parsed.data.tags);
        io.to(room.id).emit('room:tags_updated', { tags: room.tags });
      } catch (err: any) {
        sendError('INTERNAL_ERROR', err?.message || 'Failed to set stream tags.');
      }
    });

    // 28. ROOM GO LIVE
    socket.on('room:go_live', () => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) {
          return sendError('NOT_FOUND', 'You must join a room first.');
        }

        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR') {
          return sendError('FORBIDDEN', 'Only the host or moderator can take the room live.');
        }

        room.setIsLive(true);
        if (room.videoId && room.playState === 'paused') {
          room.play(room.currentTime || 0);
        }

        io.to(room.id).emit('sync_state', room.toSyncStatePayload());
        io.to(room.id).emit('room:went_live', {
          roomId: room.id,
          hostUsername: participant.username,
          timestamp: Date.now(),
        });
      } catch (err: any) {
        sendError('INTERNAL_ERROR', err?.message || 'Failed to start live stream.');
      }
    });

    // 28. WEBRTC SIGNALING FOR REAL-TIME TAB / SCREEN SHARING
    socket.on('webrtc:offer', (rawPayload: unknown) => {
      try {
        const parsed = WebRtcOfferSchema.safeParse(rawPayload);
        if (!parsed.success) return;
        io.to(parsed.data.targetSocketId).emit('webrtc:offer', {
          fromSocketId: socket.id,
          fromUserId: socket.data.userId,
          offer: parsed.data.offer,
        });
      } catch {}
    });

    socket.on('webrtc:answer', (rawPayload: unknown) => {
      try {
        const parsed = WebRtcAnswerSchema.safeParse(rawPayload);
        if (!parsed.success) return;
        io.to(parsed.data.targetSocketId).emit('webrtc:answer', {
          fromSocketId: socket.id,
          fromUserId: socket.data.userId,
          answer: parsed.data.answer,
        });
      } catch {}
    });

    socket.on('webrtc:ice_candidate', (rawPayload: unknown) => {
      try {
        const parsed = WebRtcIceCandidateSchema.safeParse(rawPayload);
        if (!parsed.success) return;
        io.to(parsed.data.targetSocketId).emit('webrtc:ice_candidate', {
          fromSocketId: socket.id,
          fromUserId: socket.data.userId,
          candidate: parsed.data.candidate,
        });
      } catch {}
    });

    socket.on('webrtc:request_stream', (rawPayload?: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;

        const parsed = WebRtcRequestStreamSchema.safeParse(rawPayload);
        const streamerShare = activeRoomScreenShares.get(room.id);
        const targetSocketId = (parsed.success && parsed.data?.streamerSocketId)
          ? parsed.data.streamerSocketId
          : (streamerShare ? streamerShare.socketId : (room.hostUserId ? room.getParticipant(room.hostUserId)?.socketId : undefined));

        if (targetSocketId && targetSocketId !== socket.id) {
          io.to(targetSocketId).emit('webrtc:viewer_joined', {
            viewerSocketId: socket.id,
            viewerUserId: participant.userId,
            viewerName: participant.username,
          });
        }
      } catch {}
    });

    // 29. VOICE & VIDEO ADAPTIVE CALL SIGNALING (Hybrid WebRTC P2P + Mediasoup SFU)
    socket.on('call:join', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;

        if (room.isBlockedFromCall(participant.userId)) {
          return sendError('FORBIDDEN', 'You have been restricted from joining voice & video calls by the host.');
        }

        const roomId = room.id;
        const parsed = CallJoinSchema.safeParse(rawPayload);
        const options = parsed.success ? parsed.data : { hasAudio: true, hasVideo: false, isMuted: false, isCameraOff: true };

        if (!activeRoomCalls.has(roomId)) {
          activeRoomCalls.set(roomId, new Map());
        }
        const roomCalls = activeRoomCalls.get(roomId)!;

        const newCaller: CallParticipant = {
          socketId: socket.id,
          userId: participant.userId,
          username: participant.username,
          avatarId: participant.avatarId,
          hasAudio: options.hasAudio,
          hasVideo: options.hasVideo,
          isMuted: options.isMuted,
          isCameraOff: options.isCameraOff,
          isScreenSharing: false,
        };

        // Evaluate topology with CallTopologyPolicyManager
        const decision = callTopologyPolicyManager.evaluateOnJoin(roomId, socket.id);

        if (decision.targetMode === 'sfu') {
          mediasoupManager.getOrCreateCallRouter(roomId).catch((err: any) => {
            console.error('Failed to pre-warm Mediasoup router:', err);
          });
        }

        // Existing participants in the call
        const existingCallers = Array.from(roomCalls.values());

        // Send existing participants & initial topology state to the joining caller
        socket.emit('call:existing_participants', {
          participants: existingCallers,
          topology: {
            mode: decision.targetMode,
            version: decision.version,
            activeCallers: decision.callers,
            isTransitioning: decision.targetMode === 'sfu' && decision.previousMode === 'p2p',
          },
        });

        // Add to room's active call map
        roomCalls.set(socket.id, newCaller);

        // Notify other room participants in call
        socket.to(roomId).emit('call:user_joined', newCaller);

        // Notify room of current total caller count
        io.to(roomId).emit('call:participants_updated', {
          count: roomCalls.size,
          participants: Array.from(roomCalls.values()),
        });

        // Notify room if topology shifted (e.g. 2nd caller enables P2P or 3rd caller triggers SFU)
        if (decision.shouldTransition) {
          io.to(roomId).emit('call:topology_transition', {
            previousMode: decision.previousMode,
            mode: decision.targetMode,
            version: decision.version,
            activeCallers: decision.callers,
          });
        }
      } catch (err: any) {
        sendError('INTERNAL_ERROR', err?.message || 'Failed to join voice/video call');
      }
    });

    socket.on('call:sfu_ready', (rawPayload: unknown) => {
      try {
        const { room } = getContext();
        if (!room) return;
        const parsed = CallSfuReadySchema.safeParse(rawPayload);
        const version = parsed.success && parsed.data?.version ? parsed.data.version : 1;
        const confirmed = callTopologyPolicyManager.confirmTransition(room.id, version);
        if (confirmed) {
          io.to(room.id).emit('call:topology_confirmed', {
            mode: 'sfu',
            version,
          });
        }
      } catch {}
    });

    socket.on('call:media_state', (rawPayload: unknown) => {
      try {
        const { room } = getContext();
        if (!room) return;
        const roomId = room.id;
        const parsed = CallMediaStateSchema.safeParse(rawPayload);
        if (!parsed.success) return;

        const roomCalls = activeRoomCalls.get(roomId);
        if (roomCalls && roomCalls.has(socket.id)) {
          const caller = roomCalls.get(socket.id)!;
          caller.isMuted = parsed.data.isMuted;
          caller.isCameraOff = parsed.data.isCameraOff;
          caller.isScreenSharing = parsed.data.isScreenSharing;

          socket.to(roomId).emit('call:user_media_state', {
            socketId: socket.id,
            userId: socket.data.userId,
            ...parsed.data,
          });
        }
      } catch {}
    });

    socket.on('call:speaking', (rawPayload: { isSpeaking: boolean }) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        socket.to(roomId).emit('call:user_speaking', {
          socketId: socket.id,
          userId: socket.data.userId,
          isSpeaking: Boolean(rawPayload?.isSpeaking),
        });
      } catch {}
    });

    socket.on('call:leave', () => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const roomCalls = activeRoomCalls.get(roomId);
        if (roomCalls && roomCalls.has(socket.id)) {
          roomCalls.delete(socket.id);
          io.to(roomId).emit('call:user_left', {
            socketId: socket.id,
            userId: socket.data.userId,
          });
          io.to(roomId).emit('call:participants_updated', {
            count: roomCalls.size,
            participants: Array.from(roomCalls.values()),
          });
          if (roomCalls.size === 0) {
            activeRoomCalls.delete(roomId);
          }

          // Topology evaluation & SFU participant cleanup
          const decision = callTopologyPolicyManager.evaluateOnLeave(roomId, socket.id);
          mediasoupManager.handleParticipantLeave(roomId, socket.id);

          if (decision.activeCallerCount <= 1) {
            mediasoupManager.disposeCallRouter(roomId);
          }

          if (decision.shouldTransition) {
            io.to(roomId).emit('call:topology_transition', {
              previousMode: decision.previousMode,
              mode: decision.targetMode,
              version: decision.version,
              activeCallers: decision.callers,
            });
          }
        }
      } catch {}
    });

    // Host remote mute participant
    socket.on('call:host_mute_user', (rawPayload: { targetSocketId?: string; targetUserId?: string }) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const room = roomManager.getRoom(roomId);
        const caller = room?.getParticipant(socket.data.userId || '');
        if (caller?.role !== 'HOST' && caller?.role !== 'MODERATOR') {
          return sendError('FORBIDDEN', 'Only the Host or Moderators can mute participants.');
        }

        const targetSocketId = rawPayload?.targetSocketId;
        const targetUserId = rawPayload?.targetUserId;

        if (targetSocketId) {
          io.to(targetSocketId).emit('call:force_muted', {
            mutedBy: caller.username,
          });
        } else if (targetUserId) {
          const targetPart = room?.getParticipant(targetUserId);
          if (targetPart?.socketId) {
            io.to(targetPart.socketId).emit('call:force_muted', {
              mutedBy: caller.username,
            });
          }
        }
      } catch {}
    });

    // Host stop participant screen share (WebRTC or Tab/Stage stream)
    socket.on('call:host_stop_screenshare', (rawPayload: { targetSocketId?: string; targetUserId?: string }) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const room = roomManager.getRoom(roomId);
        if (!room) return;
        const caller = room.getParticipant(socket.data.userId || '');
        if (caller?.role !== 'HOST' && caller?.role !== 'MODERATOR') {
          return sendError('FORBIDDEN', 'Only the Host or Moderators can stop screen shares.');
        }

        // 1. Revert active room tab/stage screen share if active
        const currentShare = activeRoomScreenShares.get(roomId);
        if (currentShare && (!rawPayload?.targetUserId || currentShare.userId === rawPayload.targetUserId || currentShare.socketId === rawPayload.targetSocketId)) {
          activeRoomScreenShares.delete(roomId);
          const fallbackVideo = room.playlist[0]?.videoId ?? '';
          const fallbackTitle = room.playlist[0]?.title ?? '';
          room.changeVideo(fallbackVideo, fallbackTitle, fallbackVideo ? 'youtube' : 'generic');
          io.to(roomId).emit('sync_state', room.toSyncStatePayload());
          io.to(roomId).emit('room:tab_stream_stopped', { stoppedBy: caller.username });
        }

        // 2. Broadcast call:force_stop_screenshare to target caller or all room callers
        if (rawPayload?.targetSocketId) {
          io.to(rawPayload.targetSocketId).emit('call:force_stop_screenshare');
        } else if (rawPayload?.targetUserId) {
          const targetPart = room.getParticipant(rawPayload.targetUserId);
          if (targetPart?.socketId) {
            io.to(targetPart.socketId).emit('call:force_stop_screenshare');
          }
        } else {
          io.to(roomId).emit('call:force_stop_screenshare');
        }
      } catch {}
    });

    // Admin toggle block from voice & video call
    socket.on('admin:toggle_block_call', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR') {
          return sendError('FORBIDDEN', 'Only Host and Moderators can manage call permissions.');
        }
        const parsed = AdminToggleBlockSchema.safeParse(rawPayload);
        if (!parsed.success) return;
        const targetUserId = parsed.data.targetUserId;
        const isBlocked = room.toggleBlockCall(targetUserId);
        const targetPart = room.getParticipant(targetUserId);

        if (isBlocked && targetPart?.socketId) {
          io.to(targetPart.socketId).emit('call:force_left');
          const roomCalls = activeRoomCalls.get(room.id);
          if (roomCalls && roomCalls.has(targetPart.socketId)) {
            roomCalls.delete(targetPart.socketId);
            const decision = callTopologyPolicyManager.evaluateOnLeave(room.id, targetPart.socketId);
            mediasoupManager.handleParticipantLeave(room.id, targetPart.socketId);
            if (decision.activeCallerCount <= 1) {
              mediasoupManager.disposeCallRouter(room.id);
            }
            io.to(room.id).emit('call:user_left', { socketId: targetPart.socketId });
            io.to(room.id).emit('call:participants_updated', {
              count: roomCalls.size,
              callers: Array.from(roomCalls.values()),
            });
            if (decision.shouldTransition) {
              io.to(room.id).emit('call:topology_transition', {
                previousMode: decision.previousMode,
                mode: decision.targetMode,
                version: decision.version,
                activeCallers: decision.callers,
              });
            }
          }
        }

        io.to(room.id).emit('user_joined', {
          username: targetPart?.username || '',
          userId: targetUserId,
          role: targetPart?.role || 'PARTICIPANT',
          avatarId: targetPart?.avatarId,
          participants: room.getAllParticipants(),
        });
      } catch {}
    });

    // Admin toggle block from chat
    socket.on('admin:toggle_block_chat', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR') {
          return sendError('FORBIDDEN', 'Only Host and Moderators can manage chat permissions.');
        }
        const parsed = AdminToggleBlockSchema.safeParse(rawPayload);
        if (!parsed.success) return;
        const targetUserId = parsed.data.targetUserId;
        room.toggleBlockChat(targetUserId);
        const targetPart = room.getParticipant(targetUserId);

        io.to(room.id).emit('user_joined', {
          username: targetPart?.username || '',
          userId: targetUserId,
          role: targetPart?.role || 'PARTICIPANT',
          avatarId: targetPart?.avatarId,
          participants: room.getAllParticipants(),
        });
      } catch {}
    });

    // Admin toggle block from screen sharing
    socket.on('admin:toggle_block_screenshare', (rawPayload: unknown) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR') {
          return sendError('FORBIDDEN', 'Only Host and Moderators can manage screen share permissions.');
        }
        const parsed = AdminToggleBlockSchema.safeParse(rawPayload);
        if (!parsed.success) return;
        const targetUserId = parsed.data.targetUserId;
        const isBlocked = room.toggleBlockScreenShare(targetUserId);
        const targetPart = room.getParticipant(targetUserId);

        if (isBlocked && targetPart?.socketId) {
          io.to(targetPart.socketId).emit('call:force_stop_screenshare');
        }

        io.to(room.id).emit('user_joined', {
          username: targetPart?.username || '',
          userId: targetUserId,
          role: targetPart?.role || 'PARTICIPANT',
          avatarId: targetPart?.avatarId,
          participants: room.getAllParticipants(),
        });
      } catch {}
    });

    // Admin emergency stop all screen shares
    socket.on('admin:force_stop_screenshare', () => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return;
        if (participant.role !== 'HOST' && participant.role !== 'MODERATOR') {
          return sendError('FORBIDDEN', 'Only Host and Moderators can stop screen shares.');
        }

        const currentShare = activeRoomScreenShares.get(room.id);
        if (currentShare) {
          activeRoomScreenShares.delete(room.id);
          const fallbackVideo = room.playlist[0]?.videoId ?? '';
          const fallbackTitle = room.playlist[0]?.title ?? '';
          room.changeVideo(fallbackVideo, fallbackTitle, fallbackVideo ? 'youtube' : 'generic');
          io.to(room.id).emit('sync_state', room.toSyncStatePayload());
          io.to(room.id).emit('room:tab_stream_stopped', { stoppedBy: participant.username });
        }

        io.to(room.id).emit('call:force_stop_screenshare');
      } catch {}
    });

    // ==========================================
    // 30. WEBRTC P2P 1-TO-1 CALL SIGNALING (Strict Room-Scope & Caller Verification)
    // ==========================================
    socket.on('call:p2p:offer', (rawPayload: unknown) => {
      try {
        const { room } = getContext();
        if (!room) return;
        const parsed = CallP2POfferSchema.safeParse(rawPayload);
        if (!parsed.success) return;

        if (!callTopologyPolicyManager.isCallerInRoom(room.id, parsed.data.targetSocketId)) {
          return sendError('FORBIDDEN', 'Signaling target is not an active caller in this room.');
        }

        io.to(parsed.data.targetSocketId).emit('call:p2p:offer', {
          fromSocketId: socket.id,
          fromUserId: socket.data.userId,
          offer: parsed.data.offer,
        });
      } catch {}
    });

    socket.on('call:p2p:answer', (rawPayload: unknown) => {
      try {
        const { room } = getContext();
        if (!room) return;
        const parsed = CallP2PAnswerSchema.safeParse(rawPayload);
        if (!parsed.success) return;

        if (!callTopologyPolicyManager.isCallerInRoom(room.id, parsed.data.targetSocketId)) {
          return sendError('FORBIDDEN', 'Signaling target is not an active caller in this room.');
        }

        io.to(parsed.data.targetSocketId).emit('call:p2p:answer', {
          fromSocketId: socket.id,
          fromUserId: socket.data.userId,
          answer: parsed.data.answer,
        });
      } catch {}
    });

    socket.on('call:p2p:ice_candidate', (rawPayload: unknown) => {
      try {
        const { room } = getContext();
        if (!room) return;
        const parsed = CallP2PIceCandidateSchema.safeParse(rawPayload);
        if (!parsed.success) return;

        if (!callTopologyPolicyManager.isCallerInRoom(room.id, parsed.data.targetSocketId)) {
          return sendError('FORBIDDEN', 'Signaling target is not an active caller in this room.');
        }

        io.to(parsed.data.targetSocketId).emit('call:p2p:ice_candidate', {
          fromSocketId: socket.id,
          fromUserId: socket.data.userId,
          candidate: parsed.data.candidate,
        });
      } catch {}
    });

    // ==========================================
    // 31. MEDIASOUP SFU SIGNALING (Group Calls >= 3)
    // ==========================================
    socket.on('sfu:get_router_capabilities', async (_payload: unknown, callback?: (res: any) => void) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return callback?.({ success: false, error: 'Not authenticated in room.' });

        if (room.isBlockedFromCall(participant.userId)) {
          return callback?.({ success: false, error: 'You are blocked from voice & video calls in this room.' });
        }

        if (!callTopologyPolicyManager.isCallerInRoom(room.id, socket.id)) {
          return callback?.({ success: false, error: 'Caller not in active room call.' });
        }

        const rtpCapabilities = await mediasoupManager.getRouterCapabilities(room.id);
        callback?.({ success: true, rtpCapabilities });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || 'Failed to get router capabilities.' });
      }
    });

    socket.on('sfu:create_transport', async (rawPayload: unknown, callback?: (res: any) => void) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return callback?.({ success: false, error: 'Not authenticated in room.' });

        if (room.isBlockedFromCall(participant.userId)) {
          return callback?.({ success: false, error: 'You are blocked from voice & video calls in this room.' });
        }

        if (!callTopologyPolicyManager.isCallerInRoom(room.id, socket.id)) {
          return callback?.({ success: false, error: 'Caller not in active room call.' });
        }

        const parsed = SfuCreateTransportSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return callback?.({ success: false, error: 'Invalid transport creation payload.' });
        }

        const transportDto = await mediasoupManager.createWebRtcTransport(room.id, socket.id, parsed.data.direction);
        callback?.({ success: true, transport: transportDto });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || 'Failed to create transport.' });
      }
    });

    socket.on('sfu:connect_transport', async (rawPayload: unknown, callback?: (res: any) => void) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return callback?.({ success: false, error: 'Not authenticated in room.' });

        if (room.isBlockedFromCall(participant.userId)) {
          return callback?.({ success: false, error: 'You are blocked from voice & video calls in this room.' });
        }

        if (!callTopologyPolicyManager.isCallerInRoom(room.id, socket.id)) {
          return callback?.({ success: false, error: 'Caller not in active room call.' });
        }

        const parsed = SfuConnectTransportSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return callback?.({ success: false, error: 'Invalid transport connect payload.' });
        }

        await mediasoupManager.connectWebRtcTransport(room.id, socket.id, parsed.data.transportId, parsed.data.dtlsParameters as any);
        callback?.({ success: true });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || 'Failed to connect transport.' });
      }
    });

    socket.on('sfu:produce', async (rawPayload: unknown, callback?: (res: any) => void) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return callback?.({ success: false, error: 'Not authenticated in room.' });

        if (room.isBlockedFromCall(participant.userId)) {
          return callback?.({ success: false, error: 'You are blocked from voice & video calls in this room.' });
        }

        if (!callTopologyPolicyManager.isCallerInRoom(room.id, socket.id)) {
          return callback?.({ success: false, error: 'Caller not in active room call.' });
        }

        const parsed = SfuProduceSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return callback?.({ success: false, error: 'Invalid produce payload.' });
        }

        const producerId = await mediasoupManager.createProducer(
          room.id,
          socket.id,
          participant.userId,
          parsed.data.transportId,
          parsed.data.kind,
          parsed.data.rtpParameters as any,
          parsed.data.appData
        );

        socket.to(room.id).emit('call:producer_added', {
          producerId,
          producerSocketId: socket.id,
          producerUserId: participant.userId,
          producerUsername: participant.username,
          kind: parsed.data.kind,
        });

        callback?.({ success: true, producerId });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || 'Failed to produce media.' });
      }
    });

    socket.on('sfu:consume', async (rawPayload: unknown, callback?: (res: any) => void) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return callback?.({ success: false, error: 'Not authenticated in room.' });

        if (room.isBlockedFromCall(participant.userId)) {
          return callback?.({ success: false, error: 'You are blocked from voice & video calls in this room.' });
        }

        if (!callTopologyPolicyManager.isCallerInRoom(room.id, socket.id)) {
          return callback?.({ success: false, error: 'Caller not in active room call.' });
        }

        const parsed = SfuConsumeSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return callback?.({ success: false, error: 'Invalid consume payload.' });
        }

        const consumerDto = await mediasoupManager.createConsumer(
          room.id,
          socket.id,
          parsed.data.transportId,
          parsed.data.producerId,
          parsed.data.rtpCapabilities as any
        );

        callback?.({ success: true, consumer: consumerDto });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || 'Failed to consume producer.' });
      }
    });

    socket.on('sfu:consumer_resume', async (rawPayload: unknown, callback?: (res: any) => void) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return callback?.({ success: false, error: 'Not authenticated in room.' });

        if (room.isBlockedFromCall(participant.userId)) {
          return callback?.({ success: false, error: 'You are blocked from voice & video calls in this room.' });
        }

        if (!callTopologyPolicyManager.isCallerInRoom(room.id, socket.id)) {
          return callback?.({ success: false, error: 'Caller not in active room call.' });
        }

        const parsed = SfuConsumerResumeSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return callback?.({ success: false, error: 'Invalid consumer resume payload.' });
        }

        await mediasoupManager.resumeConsumer(room.id, socket.id, parsed.data.consumerId);
        callback?.({ success: true });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || 'Failed to resume consumer.' });
      }
    });

    socket.on('sfu:consumer_preferred_layers', async (rawPayload: unknown, callback?: (res: any) => void) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return callback?.({ success: false, error: 'Not authenticated in room.' });

        if (!callTopologyPolicyManager.isCallerInRoom(room.id, socket.id)) {
          return callback?.({ success: false, error: 'Caller not in active room call.' });
        }

        const parsed = SfuPreferredLayersSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return callback?.({ success: false, error: 'Invalid preferred layers payload.' });
        }

        await mediasoupManager.setPreferredLayers(
          room.id,
          socket.id,
          parsed.data.consumerId,
          parsed.data.spatialLayer,
          parsed.data.temporalLayer
        );
        callback?.({ success: true });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || 'Failed to set preferred layers.' });
      }
    });

    socket.on('sfu:close_producer', (rawPayload: unknown, callback?: (res: any) => void) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return callback?.({ success: false, error: 'Not authenticated in room.' });

        if (!callTopologyPolicyManager.isCallerInRoom(room.id, socket.id)) {
          return callback?.({ success: false, error: 'Caller not in active room call.' });
        }

        const parsed = SfuCloseProducerSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return callback?.({ success: false, error: 'Invalid close producer payload.' });
        }

        mediasoupManager.closeProducer(room.id, socket.id, parsed.data.producerId);
        socket.to(room.id).emit('call:producer_removed', {
          producerId: parsed.data.producerId,
          producerSocketId: socket.id,
        });

        callback?.({ success: true });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || 'Failed to close producer.' });
      }
    });

    socket.on('sfu:get_active_producers', (_payload: unknown, callback?: (res: any) => void) => {
      try {
        const { room, participant } = getContext();
        if (!room || !participant) return callback?.({ success: false, error: 'Not authenticated in room.' });

        if (!callTopologyPolicyManager.isCallerInRoom(room.id, socket.id)) {
          return callback?.({ success: false, error: 'Caller not in active room call.' });
        }

        const producers = mediasoupManager.getActiveProducers(room.id, socket.id);
        callback?.({ success: true, producers });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || 'Failed to get active producers.' });
      }
    });

    // DISCONNECT
    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      // Clean up call presence immediately
      const roomCalls = activeRoomCalls.get(roomId);
      if (roomCalls && roomCalls.has(socket.id)) {
        roomCalls.delete(socket.id);
        io.to(roomId).emit('call:user_left', {
          socketId: socket.id,
          userId: socket.data.userId,
        });
        io.to(roomId).emit('call:participants_updated', {
          count: roomCalls.size,
          participants: Array.from(roomCalls.values()),
        });
        if (roomCalls.size === 0) {
          activeRoomCalls.delete(roomId);
        }

        const decision = callTopologyPolicyManager.evaluateOnLeave(roomId, socket.id);
        mediasoupManager.handleParticipantLeave(roomId, socket.id);

        if (decision.activeCallerCount <= 1) {
          mediasoupManager.disposeCallRouter(roomId);
        }

        if (decision.shouldTransition) {
          io.to(roomId).emit('call:topology_transition', {
            previousMode: decision.previousMode,
            mode: decision.targetMode,
            version: decision.version,
            activeCallers: decision.callers,
          });
        }

        const roomShare = activeRoomScreenShares.get(roomId);
        if (roomShare && roomShare.socketId === socket.id) {
          activeRoomScreenShares.delete(roomId);
          const room = roomManager.getRoom(roomId);
          if (room) {
            const fallbackVideo = room.playlist[0]?.videoId ?? '';
            const fallbackTitle = room.playlist[0]?.title ?? '';
            room.changeVideo(fallbackVideo, fallbackTitle, fallbackVideo ? 'youtube' : 'generic');
            io.to(roomId).emit('sync_state', room.toSyncStatePayload());
          }
          io.to(roomId).emit('room:tab_stream_stopped', {
            stoppedBy: 'Streamer disconnected',
          });
        }
      }

      const room = roomManager.getRoom(roomId);
      if (room) {
        const userId = socket.data.userId;
        if (!userId) return;

        const reconnectGraceMs = 60_000;
        const timer = setTimeout(() => {
          const participant = room.getParticipant(userId);
          if (!participant || participant.socketId !== socket.id) return;

          const previousHostUserId = room.hostUserId;
          const removed = room.removeParticipantBySocket(socket.id);
          if (removed) {
            io.to(roomId).emit('user_left', {
              username: removed.username,
              userId: removed.userId,
              participants: room.getAllParticipants(),
            });
            if (room.hostUserId && room.hostUserId !== previousHostUserId) {
              const promoted = room.getParticipant(room.hostUserId);
              if (promoted) {
                io.to(roomId).emit('role_assigned', {
                  userId: promoted.userId,
                  username: promoted.username,
                  role: promoted.role,
                  participants: room.getAllParticipants(),
                });
              }
            }
          }
        }, reconnectGraceMs);

        room.setDisconnectTimer(userId, timer);
      }
    });
  });
}
