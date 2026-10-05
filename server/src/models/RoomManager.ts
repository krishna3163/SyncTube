import { Room } from './Room.js';
import { randomInt } from 'node:crypto';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  public generateRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude confusing chars like 0/O, 1/I
    let id = '';
    do {
      id = '';
      for (let i = 0; i < 6; i++) {
        id += chars.charAt(randomInt(chars.length));
      }
    } while (this.rooms.has(id));
    return id;
  }

  public createRoom(
    customId?: string,
    initialVideoId: string = '',
    creatorIdentity?: { userId: string; credentialHash: string }
  ): Room {
    const id = customId ? customId.toUpperCase() : this.generateRoomId();
    if (this.rooms.has(id)) {
      throw new Error(`Room with ID ${id} already exists`);
    }
    const room = new Room(id, initialVideoId, creatorIdentity);
    this.rooms.set(id, room);
    return room;
  }

  public getRoom(id: string): Room | undefined {
    if (!id) return undefined;
    return this.rooms.get(id.toUpperCase());
  }

  public hasRoom(id: string): boolean {
    if (!id) return false;
    return this.rooms.has(id.toUpperCase());
  }

  public removeRoom(id: string): boolean {
    return this.rooms.delete(id.toUpperCase());
  }

  public getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  public getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Cleans up rooms that have no participants and have been inactive for maxInactiveMs.
   * Default timeout: 1 hour.
   * Returns the count of deleted rooms.
   */
  public cleanupStaleRooms(maxInactiveMs: number = 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, room] of this.rooms.entries()) {
      if (room.getParticipantCount() === 0 && now - room.updatedAt > maxInactiveMs) {
        this.rooms.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }
}
