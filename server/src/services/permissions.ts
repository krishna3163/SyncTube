import { Role } from '../types.js';

export type Action =
  | 'play'
  | 'pause'
  | 'seek'
  | 'change_video'
  | 'assign_role'
  | 'remove_participant'
  | 'transfer_host';

const PERMISSION_MATRIX: Record<Action, Role[]> = {
  play: ['HOST', 'MODERATOR'],
  pause: ['HOST', 'MODERATOR'],
  seek: ['HOST', 'MODERATOR'],
  change_video: ['HOST', 'MODERATOR'],
  assign_role: ['HOST'],
  remove_participant: ['HOST'],
  transfer_host: ['HOST'],
};

export function canPerformAction(role: Role | undefined, action: Action): boolean {
  if (!role) return false;
  const allowedRoles = PERMISSION_MATRIX[action];
  return Boolean(allowedRoles && allowedRoles.includes(role));
}
