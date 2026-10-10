import { z } from 'zod';

export const JoinRoomSchema = z.object({
  roomId: z.string().trim().min(1).max(32),
  username: z.string().trim().min(1).max(50),
  userId: z.string().trim().min(1).max(100),
  identityToken: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  avatarId: z.string().trim().max(50).optional(),
});

export const LeaveRoomSchema = z.object({
  roomId: z.string().trim().min(1).max(32),
});

export const PlayPauseSchema = z.object({
  time: z.number().nonnegative().optional(),
}).optional();

export const SeekSchema = z.object({
  time: z.number().nonnegative(),
});

export const ChangeVideoSchema = z.object({
  videoId: z.string().trim().min(1).max(2048),
  play: z.boolean().optional().default(false),
  title: z.string().trim().max(200).optional(),
  platform: z.string().trim().max(50).optional(),
});

export const AssignRoleSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.enum(['HOST', 'MODERATOR', 'PARTICIPANT']),
});

export const RemoveParticipantSchema = z.object({
  userId: z.string().trim().min(1),
});

export const PlaylistAddSchema = z.object({
  videoId: z.string().trim().min(1).max(2048),
  title: z.string().trim().max(200).optional(),
  duration: z.string().trim().max(50).optional(),
  channel: z.string().trim().max(100).optional(),
  thumbnail: z.string().trim().max(1000).optional(),
  platform: z.string().trim().max(50).optional(),
});

export const PlaylistRemoveSchema = z.object({
  itemId: z.string().trim().min(1).max(100),
});

export const PlaylistReorderSchema = z.object({
  fromIndex: z.number().int().nonnegative(),
  toIndex: z.number().int().nonnegative(),
});

export const PlaylistMoveTopSchema = z.object({
  itemId: z.string().trim().min(1).max(100),
});

export const PlaylistVoteSchema = z.object({
  itemId: z.string().trim().min(1).max(100),
});

export const PlaylistShuffleSchema = z.object({}).optional();

export const PlaylistClearSchema = z.object({}).optional();

export const ActionRequestSchema = z.object({
  type: z.enum(['play', 'pause', 'seek', 'change_video', 'request_next_video']),
  data: z
    .object({
      time: z.number().nonnegative().optional(),
      videoId: z.string().trim().max(2048).optional(),
      title: z.string().trim().max(200).optional(),
      duration: z.string().trim().max(50).optional(),
      channel: z.string().trim().max(100).optional(),
      platform: z.string().trim().max(50).optional(),
    })
    .optional(),
});

export const RespondActionRequestSchema = z.object({
  requestId: z.string().trim().min(1).max(100),
  approved: z.boolean(),
  mode: z.enum(['now', 'next']).optional(),
});

export const ReplyToSchema = z.object({
  messageId: z.string().trim().min(1),
  username: z.string().trim().min(1).max(50),
  text: z.string().trim().min(1).max(500),
  avatarId: z.string().trim().max(50).optional(),
});

export const ChatMessageSchema = z.object({
  text: z.string().trim().min(1).max(500),
  userColor: z.string().trim().max(30).optional(),
  avatarId: z.string().trim().max(50).optional(),
  replyTo: ReplyToSchema.optional(),
});

export const ToggleMessageReactionSchema = z.object({
  messageId: z.string().trim().min(1),
  emoji: z.string().trim().min(1).max(10),
});

export const SendReactionSchema = z.object({
  emoji: z.string().trim().min(1).max(10),
  videoTime: z.number().nonnegative().optional(),
});

export const CreatePollSchema = z.object({
  question: z.string().trim().min(1).max(200),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(6),
});

export const VotePollSchema = z.object({
  optionIndex: z.number().int().nonnegative().max(5),
});

export const SendSoundEffectSchema = z.object({
  soundId: z.enum(['applause', 'airhorn', 'cheer', 'nani', 'wow', 'boom']),
});

export const UpdateAvatarSchema = z.object({
  avatarId: z.string().trim().min(1).max(50),
});

// ── V2 Socket Event Schemas ──────────────────────────────
export const PartyReadySchema = z.object({
  status: z.enum(['ready', 'loading', 'buffering', 'desynced', 'not_connected']),
  reportedPosition: z.number().nonnegative().optional(),
  activePlatform: z.string().trim().max(50).optional(),
  activeMediaId: z.string().trim().max(2048).optional(),
});

export const SyncPlaySchema = z.object({
  position: z.number().nonnegative().optional(),
  eventId: z.string().trim().max(100).optional(),
  revision: z.number().int().nonnegative().optional(),
}).optional();

export const SyncPauseSchema = z.object({
  position: z.number().nonnegative().optional(),
  eventId: z.string().trim().max(100).optional(),
  revision: z.number().int().nonnegative().optional(),
}).optional();

export const SyncSeekSchema = z.object({
  position: z.number().nonnegative(),
  eventId: z.string().trim().max(100).optional(),
  revision: z.number().int().nonnegative().optional(),
});

export const SyncDriftCheckSchema = z.object({
  clientPosition: z.number().nonnegative(),
  clientTimestamp: z.number().nonnegative(),
});

export const MediaChangedSchema = z.object({
  platform: z.string().trim().min(1).max(50),
  mediaId: z.string().trim().min(1).max(2048),
  title: z.string().trim().max(200).optional(),
  url: z.string().trim().max(2048).optional(),
  duration: z.number().nonnegative().optional(),
});

export const ChatTypingSchema = z.object({
  isTyping: z.boolean(),
});

export const ExtensionStatusSchema = z.object({
  installed: z.boolean(),
  activePlatform: z.string().trim().max(50).optional(),
  currentTabUrl: z.string().trim().max(2048).optional(),
});

export const RoomStartBrowserStreamSchema = z.object({
  sessionId: z.string().trim().min(1).max(100),
  sessionToken: z.string().trim().min(1).max(200),
  guestControl: z.boolean().optional().default(false),
});

export const RoomStopBrowserStreamSchema = z.object({}).optional();

export const RoomBrowserGuestControlSchema = z.object({
  guestControl: z.boolean(),
});

export const RoomBrowserInputSchema = z.object({
  action: z.enum([
    'click',
    'mouse_move',
    'mouse_down',
    'mouse_up',
    'wheel',
    'key_down',
    'key_up',
    'key_press',
    'navigate',
    'back',
    'forward',
    'reload',
  ]),
  x: z.number().optional(),
  y: z.number().optional(),
  button: z.enum(['left', 'right', 'middle']).optional(),
  clickCount: z.number().int().positive().max(3).optional(),
  deltaX: z.number().optional(),
  deltaY: z.number().optional(),
  key: z.string().max(100).optional(),
  url: z.string().max(2048).optional(),
});

export const RoomStartTabStreamSchema = z.object({
  title: z.string().trim().max(200).optional(),
});

export const ToggleLikeSchema = z.object({
  roomId: z.string().trim().max(32).optional(),
}).optional();

export const SetCategorySchema = z.object({
  category: z.string().trim().min(1).max(50),
});

export const WebRtcOfferSchema = z.object({
  targetSocketId: z.string().trim().min(1),
  offer: z.any(),
});

export const WebRtcAnswerSchema = z.object({
  targetSocketId: z.string().trim().min(1),
  answer: z.any(),
});

export const WebRtcIceCandidateSchema = z.object({
  targetSocketId: z.string().trim().min(1),
  candidate: z.any(),
});

export const WebRtcRequestStreamSchema = z.object({
  streamerSocketId: z.string().trim().optional(),
}).optional();

