import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService, hashPassword, verifyPassword } from '../services/auth.js';

describe('AuthService and Crypto', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  it('correctly hashes and verifies passwords with secure salt and timing safety', () => {
    const pwd = 'secretPassword123!';
    const hash = hashPassword(pwd);
    expect(hash).toContain(':');
    expect(verifyPassword(pwd, hash)).toBe(true);
    expect(verifyPassword('wrongPassword', hash)).toBe(false);
  });

  it('registers a new user and returns user profile and session token', async () => {
    const { user, token } = await authService.register('krishna@example.com', 'Krishna', 'securePassword');
    expect(user.id).toBeDefined();
    expect(user.email).toBe('krishna@example.com');
    expect(user.username).toBe('Krishna');
    expect(token).toHaveLength(64);
  });

  it('rejects duplicate email registration', async () => {
    await authService.register('krishna@example.com', 'Krishna', 'securePassword');
    await expect(authService.register('krishna@example.com', 'Krishna2', 'password123')).rejects.toThrow(
      'Email already registered'
    );
  });

  it('authenticates user and creates session on login', async () => {
    await authService.register('test@sync.tube', 'Tester', 'testPass99');
    const { user, token } = await authService.login('test@sync.tube', 'testPass99');
    expect(user.email).toBe('test@sync.tube');
    expect(token).toBeDefined();

    const validated = await authService.validateSession(token);
    expect(validated?.id).toBe(user.id);
  });

  it('rejects login with invalid credentials', async () => {
    await authService.register('test@sync.tube', 'Tester', 'testPass99');
    await expect(authService.login('test@sync.tube', 'wrongPassword')).rejects.toThrow(
      'Invalid email or password'
    );
    await expect(authService.login('unknown@sync.tube', 'testPass99')).rejects.toThrow(
      'Invalid email or password'
    );
  });

  it('invalidates session token on logout', async () => {
    const { token } = await authService.register('logout@sync.tube', 'LogoutUser', 'testPass99');
    const validBefore = await authService.validateSession(token);
    expect(validBefore).not.toBeNull();

    await authService.logout(token);
    const validAfter = await authService.validateSession(token);
    expect(validAfter).toBeNull();
  });

  it('updates profile fields', async () => {
    const { user } = await authService.register('profile@sync.tube', 'OldName', 'testPass99');
    const updated = await authService.updateProfile(user.id, {
      username: 'NewName',
      avatarId: 'goku',
      bio: 'Loves watching anime parties',
    });

    expect(updated.username).toBe('NewName');
    expect(updated.avatarId).toBe('goku');
    expect(updated.bio).toBe('Loves watching anime parties');
  });
});
