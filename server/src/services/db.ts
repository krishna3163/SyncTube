export interface BookmarkRecord {
  id: string;
  roomId: string;
  userId: string;
  timestamp: number;
  label: string;
  createdAt: number;
}

import pg from 'pg';
import type { UserRecord, SessionRecord } from './auth.js';

const { Pool } = pg;

export interface RoomRecord {
  id: string;
  video_id: string;
  play_state: string;
  current_time: number;
  updated_at: number;
  created_at?: Date | number;
  owner_id?: string;
  visibility?: 'public' | 'private' | 'unlisted';
  name?: string;
  likes?: number;
  category?: string;
}

export interface WatchHistoryItem {
  id: string;
  userId: string;
  platform: string;
  mediaId: string;
  title: string;
  watchedAt: number;
  progress: number;
}

export interface FriendshipRecord {
  id: string;
  requesterId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
  updatedAt: number;
}

export class DatabaseService {
  private pool: pg.Pool | null = null;
  private isConnected: boolean = false;

  constructor(databaseUrl?: string) {
    const url = databaseUrl || process.env.DATABASE_URL;
    if (url) {
      // Tuned for 10k concurrent users: larger pool, timeouts, keepAlive
      // For true 10k rps behind a load balancer use PgBouncer (transaction mode) and set DATABASE_URL to its port.
      const poolMax = parseInt(process.env.PG_POOL_MAX || (process.env.NODE_ENV === 'production' ? '20' : '10'), 10);
      const poolMin = parseInt(process.env.PG_POOL_MIN || '2', 10);
      this.pool = new Pool({
        connectionString: url,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
        max: Number.isFinite(poolMax) ? poolMax : 20,
        min: Number.isFinite(poolMin) ? poolMin : 2,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5000,
        keepAlive: true,
        // Allow overriding statement timeout for long polling
        statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT || '10000', 10),
      });
      this.pool.on('error', (err) => {
        console.error('[DB] Unexpected pool error:', err.message);
      });
    }
  }

  public isConnectedToDb(): boolean {
    return this.isConnected && this.pool !== null;
  }

  public async init(): Promise<void> {
    if (!this.pool) {
      console.log('[DB] No DATABASE_URL provided. Running with in-memory state.');
      return;
    }

    try {
      const client = await this.pool.connect();
      await client.query(`
        -- Users table
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          username VARCHAR(100) NOT NULL,
          password_hash TEXT NOT NULL,
          avatar_id VARCHAR(50),
          bio TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );

        -- Sessions table
        CREATE TABLE IF NOT EXISTS sessions (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash VARCHAR(64) UNIQUE NOT NULL,
          expires_at BIGINT NOT NULL,
          created_at BIGINT NOT NULL
        );

        -- Rooms table
        CREATE TABLE IF NOT EXISTS rooms (
          id VARCHAR(32) PRIMARY KEY,
          video_id VARCHAR(256) NOT NULL,
          play_state VARCHAR(16) NOT NULL,
          current_time DOUBLE PRECISION NOT NULL,
          updated_at BIGINT NOT NULL,
          owner_id VARCHAR(64),
          visibility VARCHAR(16) DEFAULT 'public',
          name VARCHAR(120),
          likes INT DEFAULT 0,
          category VARCHAR(50) DEFAULT 'cinema',
          created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::BIGINT
        );

        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;
        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'cinema';
        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS created_at BIGINT;

        -- Watch History table
        CREATE TABLE IF NOT EXISTS watch_history (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          platform VARCHAR(32) NOT NULL,
          media_id VARCHAR(256) NOT NULL,
          title TEXT NOT NULL,
          watched_at BIGINT NOT NULL,
          progress DOUBLE PRECISION DEFAULT 0
        );

        -- Friendships table
        CREATE TABLE IF NOT EXISTS friendships (
          id VARCHAR(64) PRIMARY KEY,
          requester_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          receiver_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          CONSTRAINT unique_friend_pair UNIQUE(requester_id, receiver_id)
        );

                -- Bookmarks table
        CREATE TABLE IF NOT EXISTS bookmarks (
          id VARCHAR(64) PRIMARY KEY,
          room_id VARCHAR(32) NOT NULL,
          user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          timestamp DOUBLE PRECISION NOT NULL,
          label TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_bookmarks_room ON bookmarks(room_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
        CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id);
        CREATE INDEX IF NOT EXISTS idx_friendships_users ON friendships(requester_id, receiver_id);
      `);
      client.release();
      this.isConnected = true;
      console.log('[DB] PostgreSQL connected and initialized with V2 schemas.');
    } catch (err) {
      console.warn('[DB] Failed to connect to PostgreSQL. Falling back to in-memory state:', (err as Error).message);
      this.isConnected = false;
    }
  }

  // Room operations
  public async saveRoom(record: RoomRecord): Promise<void> {
    if (!this.isConnected || !this.pool) return;

    try {
      const createdAtVal = typeof record.created_at === 'number'
        ? record.created_at
        : record.created_at instanceof Date
        ? record.created_at.getTime()
        : Date.now();

      await this.pool.query(
        `
        INSERT INTO rooms (id, video_id, play_state, current_time, updated_at, owner_id, visibility, name, likes, category, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          video_id = EXCLUDED.video_id,
          play_state = EXCLUDED.play_state,
          current_time = EXCLUDED.current_time,
          updated_at = EXCLUDED.updated_at,
          owner_id = COALESCE(EXCLUDED.owner_id, rooms.owner_id),
          visibility = COALESCE(EXCLUDED.visibility, rooms.visibility),
          name = COALESCE(EXCLUDED.name, rooms.name),
          likes = COALESCE(EXCLUDED.likes, rooms.likes),
          category = COALESCE(EXCLUDED.category, rooms.category);
        `,
        [
          record.id,
          record.video_id,
          record.play_state,
          record.current_time,
          record.updated_at,
          record.owner_id || null,
          record.visibility || 'public',
          record.name || null,
          record.likes || 0,
          record.category || 'cinema',
          createdAtVal,
        ]
      );
    } catch (err) {
      console.error('[DB] Failed to save room to DB:', (err as Error).message);
    }
  }

  public async getRoom(id: string): Promise<RoomRecord | null> {
    if (!this.isConnected || !this.pool) return null;

    try {
      const res = await this.pool.query('SELECT * FROM rooms WHERE id = $1', [id.toUpperCase()]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        video_id: row.video_id,
        play_state: row.play_state,
        current_time: Number(row.current_time),
        updated_at: Number(row.updated_at),
        owner_id: row.owner_id,
        visibility: row.visibility,
        name: row.name,
        likes: Number(row.likes || 0),
        category: row.category || 'cinema',
        created_at: Number(row.created_at || row.updated_at || Date.now()),
      };
    } catch (err) {
      console.error('[DB] Failed to fetch room from DB:', (err as Error).message);
      return null;
    }
  }

  // User operations
  public async saveUser(user: UserRecord): Promise<void> {
    if (!this.isConnected || !this.pool) return;
    try {
      await this.pool.query(
        `
        INSERT INTO users (id, email, username, password_hash, avatar_id, bio, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username,
          avatar_id = EXCLUDED.avatar_id,
          bio = EXCLUDED.bio,
          updated_at = EXCLUDED.updated_at;
        `,
        [user.id, user.email, user.username, user.passwordHash, user.avatarId || null, user.bio || '', user.createdAt, user.updatedAt]
      );
    } catch (err) {
      console.error('[DB] Failed to save user to DB:', (err as Error).message);
    }
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    if (!this.isConnected || !this.pool) return null;
    try {
      const res = await this.pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        email: row.email,
        username: row.username,
        passwordHash: row.password_hash,
        avatarId: row.avatar_id,
        bio: row.bio,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      };
    } catch (err) {
      console.error('[DB] Failed to find user by email:', (err as Error).message);
      return null;
    }
  }

  public async findUserById(id: string): Promise<UserRecord | null> {
    if (!this.isConnected || !this.pool) return null;
    try {
      const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        email: row.email,
        username: row.username,
        passwordHash: row.password_hash,
        avatarId: row.avatar_id,
        bio: row.bio,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      };
    } catch (err) {
      console.error('[DB] Failed to find user by id:', (err as Error).message);
      return null;
    }
  }

  // Session operations
  public async saveSession(session: SessionRecord): Promise<void> {
    if (!this.isConnected || !this.pool) return;
    try {
      await this.pool.query(
        `
        INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING;
        `,
        [session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt]
      );
    } catch (err) {
      console.error('[DB] Failed to save session:', (err as Error).message);
    }
  }

  public async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    if (!this.isConnected || !this.pool) return null;
    try {
      const res = await this.pool.query('SELECT * FROM sessions WHERE token_hash = $1', [tokenHash]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: Number(row.expires_at),
        createdAt: Number(row.created_at),
      };
    } catch (err) {
      console.error('[DB] Failed to find session:', (err as Error).message);
      return null;
    }
  }

  public async deleteSession(tokenHash: string): Promise<void> {
    if (!this.isConnected || !this.pool) return;
    try {
      await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    } catch (err) {
      console.error('[DB] Failed to delete session:', (err as Error).message);
    }
  }

  // Watch history operations
  public async addWatchHistory(item: WatchHistoryItem): Promise<void> {
    if (!this.isConnected || !this.pool) return;
    try {
      await this.pool.query(
        `
        INSERT INTO watch_history (id, user_id, platform, media_id, title, watched_at, progress)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          watched_at = EXCLUDED.watched_at,
          progress = EXCLUDED.progress;
        `,
        [item.id, item.userId, item.platform, item.mediaId, item.title, item.watchedAt, item.progress]
      );
    } catch (err) {
      console.error('[DB] Failed to add watch history:', (err as Error).message);
    }
  }

  public async getWatchHistory(userId: string, limit: number = 20): Promise<WatchHistoryItem[]> {
    if (!this.isConnected || !this.pool) return [];
    try {
      const res = await this.pool.query(
        'SELECT * FROM watch_history WHERE user_id = $1 ORDER BY watched_at DESC LIMIT $2',
        [userId, limit]
      );
      return res.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        platform: row.platform,
        mediaId: row.media_id,
        title: row.title,
        watchedAt: Number(row.watched_at),
        progress: Number(row.progress),
      }));
    } catch (err) {
      console.error('[DB] Failed to fetch watch history:', (err as Error).message);
      return [];
    }
  }

  // Bookmark operations
  public async addBookmark(bookmark: BookmarkRecord): Promise<void> {
    if (!this.isConnected || !this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO bookmarks (id, room_id, user_id, timestamp, label, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING;`,
        [bookmark.id, bookmark.roomId, bookmark.userId, bookmark.timestamp, bookmark.label, bookmark.createdAt]
      );
    } catch (err) {
      console.error('[DB] Failed to save bookmark:', (err as Error).message);
    }
  }

  public async getBookmarks(roomId: string): Promise<BookmarkRecord[]> {
    if (!this.isConnected || !this.pool) return [];
    try {
      const res = await this.pool.query('SELECT * FROM bookmarks WHERE room_id = $1 ORDER BY timestamp ASC', [roomId]);
      return res.rows.map((row) => ({
        id: row.id,
        roomId: row.room_id,
        userId: row.user_id,
        timestamp: Number(row.timestamp),
        label: row.label,
        createdAt: Number(row.created_at),
      }));
    } catch (err) {
      console.error('[DB] Failed to get bookmarks:', (err as Error).message);
      return [];
    }
  }

  // Friend operations
  public async sendFriendRequest(requesterId: string, receiverId: string): Promise<boolean> {
    if (!this.isConnected || !this.pool) return true;
    try {
      const id = `${requesterId}_${receiverId}`;
      const now = Date.now();
      await this.pool.query(
        `INSERT INTO friendships (id, requester_id, receiver_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', $4, $5)
         ON CONFLICT (requester_id, receiver_id) DO UPDATE SET status = 'pending', updated_at = $5;`,
        [id, requesterId, receiverId, now, now]
      );
      return true;
    } catch {
      return false;
    }
  }

  public async getFriends(userId: string): Promise<FriendshipRecord[]> {
    if (!this.isConnected || !this.pool) return [];
    try {
      const res = await this.pool.query(
        `SELECT * FROM friendships WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
        [userId]
      );
      return res.rows.map((row) => ({
        id: row.id,
        requesterId: row.requester_id,
        receiverId: row.receiver_id,
        status: row.status,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      }));
    } catch {
      return [];
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
    }
  }
}
