import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import type { IUserRepository } from './auth.repositories';
import type { User } from './auth.types';

const JWT_SECRET = process.env.JWT_SECRET!;

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'alice',
    email: 'alice@example.com',
    passwordHash: '$2b$10$hashedpassword',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<IUserRepository> = {}): IUserRepository {
  return {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserById: vi.fn().mockResolvedValue(null),
    createUser: vi.fn(),
    updateAvatar: vi.fn(),
    updateStatus: vi.fn(),
    ...overrides,
  } as unknown as IUserRepository;
}

describe('AuthService.register', () => {
  it('creates user and returns token + user without passwordHash', async () => {
    const user = makeUser();
    const repo = makeRepo({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue(user),
    });
    const service = new AuthService(repo);

    const result = await service.register({ username: 'alice', email: 'alice@example.com', password: 'pass' });

    expect(result.token).toBeTruthy();
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user.email).toBe('alice@example.com');
  });

  it('throws "User already exists" when email is taken', async () => {
    const repo = makeRepo({
      findUserByEmail: vi.fn().mockResolvedValue(makeUser()),
    });
    const service = new AuthService(repo);

    await expect(
      service.register({ username: 'alice', email: 'alice@example.com', password: 'pass' })
    ).rejects.toThrow('User already exists');
  });
});

describe('AuthService.login', () => {
  it('returns token + user without passwordHash for valid credentials', async () => {
    const service = new AuthService(makeRepo());
    const realHash = await service.hashPassword('correct-password');
    const user = makeUser({ passwordHash: realHash });

    const repo = makeRepo({ findUserByEmail: vi.fn().mockResolvedValue(user) });
    const svc = new AuthService(repo);

    const result = await svc.login({ email: 'alice@example.com', password: 'correct-password' });

    expect(result.token).toBeTruthy();
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('throws "Invalid credentials" when user not found', async () => {
    const repo = makeRepo({ findUserByEmail: vi.fn().mockResolvedValue(null) });
    const service = new AuthService(repo);

    await expect(
      service.login({ email: 'nobody@example.com', password: 'x' })
    ).rejects.toThrow('Invalid credentials');
  });

  it('throws "Invalid credentials" when password is wrong', async () => {
    const service = new AuthService(makeRepo());
    const realHash = await service.hashPassword('real-password');
    const user = makeUser({ passwordHash: realHash });

    const repo = makeRepo({ findUserByEmail: vi.fn().mockResolvedValue(user) });
    const svc = new AuthService(repo);

    await expect(
      svc.login({ email: 'alice@example.com', password: 'wrong-password' })
    ).rejects.toThrow('Invalid credentials');
  });

  it('throws "Invalid credentials" when user has no passwordHash (OAuth user)', async () => {
    const oauthUser = makeUser({ passwordHash: undefined });
    const repo = makeRepo({ findUserByEmail: vi.fn().mockResolvedValue(oauthUser) });
    const service = new AuthService(repo);

    await expect(
      service.login({ email: 'alice@example.com', password: 'any' })
    ).rejects.toThrow('Invalid credentials');
  });
});

describe('AuthService.generateJWT', () => {
  it('encodes userId and email in the token', () => {
    const service = new AuthService(makeRepo());
    const user = makeUser();

    const token = service.generateJWT(user);
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;

    expect(decoded.userId).toBe('user-1');
    expect(decoded.email).toBe('alice@example.com');
  });

  it('token expires in 7 days', () => {
    const service = new AuthService(makeRepo());
    const token = service.generateJWT(makeUser());
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, number>;

    const sevenDaysMs = 7 * 24 * 60 * 60;
    const ttl = decoded.exp - decoded.iat;
    expect(ttl).toBe(sevenDaysMs);
  });
});

describe('AuthService.validatePassword', () => {
  it('returns true for matching password', async () => {
    const service = new AuthService(makeRepo());
    const hash = await service.hashPassword('my-pass');
    expect(await service.validatePassword('my-pass', hash)).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const service = new AuthService(makeRepo());
    const hash = await service.hashPassword('my-pass');
    expect(await service.validatePassword('wrong', hash)).toBe(false);
  });
});

describe('AuthService.updateAvatar', () => {
  it('returns user without passwordHash', async () => {
    const user = makeUser({ avatar: 'https://cdn/avatar.png' });
    const repo = makeRepo({ updateAvatar: vi.fn().mockResolvedValue(user) });
    const service = new AuthService(repo);

    const result = await service.updateAvatar('user-1', 'https://cdn/avatar.png');
    expect(result).not.toHaveProperty('passwordHash');
  });
});

describe('AuthService.findUserById', () => {
  it('returns null when user does not exist', async () => {
    const repo = makeRepo({ findUserById: vi.fn().mockResolvedValue(null) });
    const service = new AuthService(repo);
    expect(await service.findUserById('missing')).toBeNull();
  });

  it('returns user without passwordHash', async () => {
    const user = makeUser();
    const repo = makeRepo({ findUserById: vi.fn().mockResolvedValue(user) });
    const service = new AuthService(repo);

    const result = await service.findUserById('user-1');
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('passwordHash');
  });
});
