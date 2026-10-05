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
  videoId: z.string().trim().min(1).max(256),
  play: z.boolean().optional().default(false),
});

export const AssignRoleSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.enum(['HOST', 'MODERATOR', 'PARTICIPANT']),
});

export const RemoveParticipantSchema = z.object({
  userId: z.string().trim().min(1),
});

export const PlaylistAddSchema = z.object({
  videoId: z.string().trim().min(1).max(256),
  title: z.string().trim().max(200).optional(),
  duration: z.string().trim().max(50).optional(),
  channel: z.string().trim().max(100).optional(),
  thumbnail: z.string().trim().max(500).optional(),
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
      videoId: z.string().trim().max(256).optional(),
      title: z.string().trim().max(200).optional(),
      duration: z.string().trim().max(50).optional(),
      channel: z.string().trim().max(100).optional(),
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
