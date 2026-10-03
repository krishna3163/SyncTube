import { io, Socket } from 'socket.io-client';
import { Role } from '../types.js';

const getSocketUrl = (): string => {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  // If in development and not specified, point to port 10000
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:10000';
  }
  return window.location.origin;
};

export const socket: Socket = io(getSocketUrl(), {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

export const emitJoinRoom = (roomId: string, username: string, userId: string) => {
  socket.emit('join_room', { roomId, username, userId });
};

export const emitLeaveRoom = (roomId: string) => {
  socket.emit('leave_room', { roomId });
};

export const emitPlay = (time?: number) => {
  socket.emit('play', time !== undefined ? { time } : {});
};

export const emitPause = (time?: number) => {
  socket.emit('pause', time !== undefined ? { time } : {});
};

export const emitSeek = (time: number) => {
  socket.emit('seek', { time });
};

export const emitChangeVideo = (videoId: string) => {
  socket.emit('change_video', { videoId });
};

export const emitAssignRole = (userId: string, role: Role) => {
  socket.emit('assign_role', { userId, role });
};

export const emitRemoveParticipant = (userId: string) => {
  socket.emit('remove_participant', { userId });
};
