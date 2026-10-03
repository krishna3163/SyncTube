import { describe, it, expect, beforeEach } from 'vitest';
import { Room } from '../models/Room.js';
import { RoomManager } from '../models/RoomManager.js';

describe('Room & RoomManager Models', () => {
  let roomManager: RoomManager;

  beforeEach(() => {
    roomManager = new RoomManager();
  });

  describe('RoomManager', () => {
    it('generates 6-character room codes and creates rooms', () => {
      const room = roomManager.createRoom();
      expect(room.id).toHaveLength(6);
      expect(roomManager.hasRoom(room.id)).toBe(true);
      expect(roomManager.getRoom(room.id)).toBe(room);
    });

    it('creates room with custom ID', () => {
      const room = roomManager.createRoom('TEST01');
      expect(room.id).toBe('TEST01');
      expect(roomManager.getRoom('test01')).toBe(room);
    });

    it('prevents creating duplicate room ID', () => {
      roomManager.createRoom('DUPL01');
      expect(() => roomManager.createRoom('DUPL01')).toThrow();
    });

    it('removes rooms', () => {
      const room = roomManager.createRoom('DEL001');
      expect(roomManager.removeRoom('DEL001')).toBe(true);
      expect(roomManager.hasRoom('DEL001')).toBe(false);
    });
  });

  describe('Room lifecycle', () => {
    let room: Room;

    beforeEach(() => {
      room = new Room('ROOM12');
    });

    it('assigns HOST to first participant', () => {
      const host = room.addParticipant('user-1', 'socket-1', 'Alice');
      expect(host.role).toBe('HOST');
      expect(room.hostUserId).toBe('user-1');

      const participant = room.addParticipant('user-2', 'socket-2', 'Bob');
      expect(participant.role).toBe('PARTICIPANT');
    });

    it('updates socketId when existing user rejoins', () => {
      room.addParticipant('user-1', 'socket-1', 'Alice');
      const updated = room.addParticipant('user-1', 'socket-1-new', 'Alice');
      expect(updated.socketId).toBe('socket-1-new');
      expect(room.getParticipantBySocket('socket-1-new')?.userId).toBe('user-1');
    });

    it('manages playback state correctly', () => {
      room.play(10);
      expect(room.playState).toBe('playing');
      expect(room.currentTime).toBe(10);

      room.pause(25);
      expect(room.playState).toBe('paused');
      expect(room.currentTime).toBe(25);

      room.seek(50);
      expect(room.currentTime).toBe(50);

      room.changeVideo('M7lc1UVf-VE');
      expect(room.videoId).toBe('M7lc1UVf-VE');
      expect(room.currentTime).toBe(0);
      expect(room.playState).toBe('paused');
    });

    it('handles role assignments', () => {
      room.addParticipant('user-1', 'socket-1', 'Alice');
      room.addParticipant('user-2', 'socket-2', 'Bob');

      // Promote to MODERATOR
      const updated = room.assignRole('user-2', 'MODERATOR');
      expect(updated?.role).toBe('MODERATOR');

      // Demote back to PARTICIPANT
      const demoted = room.assignRole('user-2', 'PARTICIPANT');
      expect(demoted?.role).toBe('PARTICIPANT');
    });

    it('kicks participant and prevents re-entry', () => {
      room.addParticipant('user-1', 'socket-1', 'Alice');
      room.addParticipant('user-2', 'socket-2', 'Bob');

      const kicked = room.kickParticipant('user-2');
      expect(kicked?.userId).toBe('user-2');
      expect(room.getParticipant('user-2')).toBeUndefined();
      expect(room.isRemoved('user-2')).toBe(true);

      // Attempt to rejoin
      expect(() => {
        room.addParticipant('user-2', 'socket-2-new', 'Bob');
      }).toThrow('User has been removed from this room');
    });

    it('handles host departure and promotes next eligible participant', () => {
      room.addParticipant('user-1', 'socket-1', 'Alice');
      room.addParticipant('user-2', 'socket-2', 'Bob');
      room.addParticipant('user-3', 'socket-3', 'Charlie');

      room.assignRole('user-3', 'MODERATOR');

      // Host leaves
      room.removeParticipantBySocket('socket-1');

      // Moderator user-3 should become the new HOST
      expect(room.hostUserId).toBe('user-3');
      expect(room.getParticipant('user-3')?.role).toBe('HOST');
    });
  });
});
