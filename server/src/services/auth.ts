import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { DatabaseService } from './db.js';

export interface UserRecord {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  avatarId?: string;
  bio?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  avatarId?: string;
  bio?: string;
  createdAt: number;
}

const SALT_BYTES = 16;
const KEY_LEN = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = scryptSync(password, salt, KEY_LEN).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, combinedHash: string): boolean {
  try {
    const [salt, hash] = combinedHash.split(':');
    if (!salt || !hash) return false;
    const derived = scryptSync(password, salt, KEY_LEN);
    const stored = Buffer.from(hash, 'hex');
    if (derived.length !== stored.length) return false;
    return timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  // In-memory fallback stores when DB is unavailable
  private users: Map<string, UserRecord> = new Map(); // id -> user
  private emailToId: Map<string, string> = new Map(); // lowercase email -> id
  private sessions: Map<string, SessionRecord> = new Map(); // session tokenHash -> session

  constructor(private dbService?: DatabaseService) {}

  public async register(email: string, username: string, password: string, avatarId?: string): Promise<{ user: UserProfile; token: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    // Check existing
    if (this.emailToId.has(normalizedEmail)) {
      throw new Error('Email already registered');
    }

    if (this.dbService && this.dbService.isConnectedToDb()) {
      const existing = await this.dbService.findUserByEmail(normalizedEmail);
      if (existing) {
        throw new Error('Email already registered');
      }
    }

    const userId = randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password);
    const now = Date.now();

    const userRecord: UserRecord = {
      id: userId,
      email: normalizedEmail,
      username: cleanUsername,
      passwordHash,
      avatarId: avatarId || 'pikachu',
      bio: '',
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(userId, userRecord);
    this.emailToId.set(normalizedEmail, userId);

    if (this.dbService && this.dbService.isConnectedToDb()) {
      await this.dbService.saveUser(userRecord);
    }

    const token = await this.createSession(userId);

    return {
      user: this.toPublicProfile(userRecord),
      token,
    };
  }

  public async login(email: string, password: string): Promise<{ user: UserProfile; token: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    let user: UserRecord | undefined;

    if (this.dbService && this.dbService.isConnectedToDb()) {
      const dbUser = await this.dbService.findUserByEmail(normalizedEmail);
      if (dbUser) user = dbUser;
    }

    if (!user) {
      const localId = this.emailToId.get(normalizedEmail);
      if (localId) user = this.users.get(localId);
    }

    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isValid = verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    const token = await this.createSession(user.id);

    return {
      user: this.toPublicProfile(user),
      token,
    };
  }

  public async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const sessionId = randomBytes(16).toString('hex');
    const now = Date.now();

    const session: SessionRecord = {
      id: sessionId,
      userId,
      tokenHash,
      expiresAt: now + SESSION_TTL_MS,
      createdAt: now,
    };

    this.sessions.set(tokenHash, session);

    if (this.dbService && this.dbService.isConnectedToDb()) {
      await this.dbService.saveSession(session);
    }

    return token;
  }

  public async validateSession(token: string): Promise<UserProfile | null> {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const now = Date.now();

    let session: SessionRecord | undefined = this.sessions.get(tokenHash);

    if (!session && this.dbService && this.dbService.isConnectedToDb()) {
      session = (await this.dbService.findSessionByTokenHash(tokenHash)) || undefined;
      if (session) {
        this.sessions.set(tokenHash, session);
      }
    }

    if (!session || session.expiresAt < now) {
      return null;
    }

    let user: UserRecord | undefined = this.users.get(session.userId);
    if (!user && this.dbService && this.dbService.isConnectedToDb()) {
      const dbUser = await this.dbService.findUserById(session.userId);
      if (dbUser) {
        user = dbUser;
        this.users.set(user.id, user);
        this.emailToId.set(user.email, user.id);
      }
    }

    if (!user) return null;
    return this.toPublicProfile(user);
  }

  public async logout(token: string): Promise<void> {
    if (!token) return;
    const tokenHash = hashToken(token);
    this.sessions.delete(tokenHash);

    if (this.dbService && this.dbService.isConnectedToDb()) {
      await this.dbService.deleteSession(tokenHash);
    }
  }

  public async updateProfile(userId: string, updates: { username?: string; avatarId?: string; bio?: string }): Promise<UserProfile> {
    let user = this.users.get(userId);
    if (!user && this.dbService && this.dbService.isConnectedToDb()) {
      user = (await this.dbService.findUserById(userId)) || undefined;
    }

    if (!user) {
      throw new Error('User not found');
    }

    if (updates.username && updates.username.trim()) {
      user.username = updates.username.trim();
    }
    if (updates.avatarId !== undefined) {
      user.avatarId = updates.avatarId.trim();
    }
    if (updates.bio !== undefined) {
      user.bio = updates.bio.trim();
    }
    user.updatedAt = Date.now();

    this.users.set(userId, user);

    if (this.dbService && this.dbService.isConnectedToDb()) {
      await this.dbService.saveUser(user);
    }

    return this.toPublicProfile(user);
  }

  public async getUserById(userId: string): Promise<UserProfile | null> {
    let user = this.users.get(userId);
    if (!user && this.dbService && this.dbService.isConnectedToDb()) {
      user = (await this.dbService.findUserById(userId)) || undefined;
    }
    if (!user) return null;
    return this.toPublicProfile(user);
  }

  public toPublicProfile(user: UserRecord): UserProfile {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarId: user.avatarId,
      bio: user.bio,
      createdAt: user.createdAt,
    };
  }
}
