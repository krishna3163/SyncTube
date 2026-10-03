import pg from 'pg';

const { Pool } = pg;

export interface RoomRecord {
  id: string;
  video_id: string;
  play_state: string;
  current_time: number;
  updated_at: number;
  created_at?: Date;
}

export class DatabaseService {
  private pool: pg.Pool | null = null;
  private isConnected: boolean = false;

  constructor(databaseUrl?: string) {
    const url = databaseUrl || process.env.DATABASE_URL;
    if (url) {
      this.pool = new Pool({
        connectionString: url,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      });
    }
  }

  public async init(): Promise<void> {
    if (!this.pool) {
      console.log('[DB] No DATABASE_URL provided. Running with in-memory state.');
      return;
    }

    try {
      const client = await this.pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS rooms (
          id VARCHAR(32) PRIMARY KEY,
          video_id VARCHAR(32) NOT NULL,
          play_state VARCHAR(16) NOT NULL,
          current_time DOUBLE PRECISION NOT NULL,
          updated_at BIGINT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      client.release();
      this.isConnected = true;
      console.log('[DB] PostgreSQL connected and initialized.');
    } catch (err) {
      console.warn('[DB] Failed to connect to PostgreSQL. Falling back to in-memory state:', (err as Error).message);
      this.isConnected = false;
    }
  }

  public async saveRoom(record: RoomRecord): Promise<void> {
    if (!this.isConnected || !this.pool) return;

    try {
      await this.pool.query(
        `
        INSERT INTO rooms (id, video_id, play_state, current_time, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          video_id = EXCLUDED.video_id,
          play_state = EXCLUDED.play_state,
          current_time = EXCLUDED.current_time,
          updated_at = EXCLUDED.updated_at;
        `,
        [record.id, record.video_id, record.play_state, record.current_time, record.updated_at]
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
      return res.rows[0];
    } catch (err) {
      console.error('[DB] Failed to fetch room from DB:', (err as Error).message);
      return null;
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
    }
  }
}
