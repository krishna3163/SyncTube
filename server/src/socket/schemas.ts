import { z } from 'zod';

export const JoinRoomSchema = z.object({
  roomId: z.string().trim().min(1).max(32),
  username: z.string().trim().min(1).max(50),
  userId: z.string().trim().min(1).max(100).optional(),
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
});

export const AssignRoleSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.enum(['HOST', 'MODERATOR', 'PARTICIPANT']),
});

export const RemoveParticipantSchema = z.object({
  userId: z.string().trim().min(1),
});
