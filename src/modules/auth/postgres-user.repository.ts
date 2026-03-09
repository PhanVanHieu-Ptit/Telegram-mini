import { type Pool } from 'pg';
import { pgPool } from '../../core/db';
import type { User, RegisterParams } from './auth.types';

export class PostgresUserRepository {
  private pool: Pool;

  constructor(pool: Pool = pgPool) {
    this.pool = pool;
  }

  async createUser(params: RegisterParams & { passwordHash: string }): Promise<User> {
    const { username, email, passwordHash } = params;
    const query = `
      INSERT INTO users (username, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, username, email, password_hash as "passwordHash", google_id as "googleId", facebook_id as "facebookId", display_name as "displayName", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
    `;
    const values = [username, email, passwordHash];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async createGoogleUser(params: {
    username: string;
    email: string;
    googleId: string;
    displayName: string;
    avatar: string;
  }): Promise<User> {
    const { username, email, googleId, displayName, avatar } = params;
    const query = `
      INSERT INTO users (username, email, google_id, display_name, avatar)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, password_hash as "passwordHash", google_id as "googleId", facebook_id as "facebookId", display_name as "displayName", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
    `;
    const values = [username, email, googleId, displayName, avatar];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findUserByGoogleId(googleId: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash as "passwordHash", google_id as "googleId", facebook_id as "facebookId", display_name as "displayName", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
      FROM users
      WHERE google_id = $1
    `;
    const result = await this.pool.query(query, [googleId]);
    return result.rows[0] || null;
  }

  async findUserByFacebookId(facebookId: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash as "passwordHash", google_id as "googleId", facebook_id as "facebookId", display_name as "displayName", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
      FROM users
      WHERE facebook_id = $1
    `;
    const result = await this.pool.query(query, [facebookId]);
    return result.rows[0] || null;
  }

  async createFacebookUser(params: {
    username: string;
    email: string;
    facebookId: string;
    displayName: string;
    avatar: string;
  }): Promise<User> {
    const { username, email, facebookId, displayName, avatar } = params;
    const query = `
      INSERT INTO users (username, email, facebook_id, display_name, avatar)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, password_hash as "passwordHash", google_id as "googleId", facebook_id as "facebookId", display_name as "displayName", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
    `;
    const values = [username, email, facebookId, displayName, avatar];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash as "passwordHash", google_id as "googleId", facebook_id as "facebookId", display_name as "displayName", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
      FROM users
      WHERE email = $1
    `;
    const result = await this.pool.query(query, [email]);
    return result.rows[0] || null;
  }

  async findUserById(id: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash as "passwordHash", google_id as "googleId", facebook_id as "facebookId", display_name as "displayName", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
      FROM users
      WHERE id = $1
    `;
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async updateAvatar(userId: string, avatarUrl: string): Promise<User> {
    const query = `
      UPDATE users
      SET avatar = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, username, email, password_hash as "passwordHash", google_id as "googleId", facebook_id as "facebookId", display_name as "displayName", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
    `;
    const result = await this.pool.query(query, [avatarUrl, userId]);
    return result.rows[0];
  }

  async updateStatus(userId: string, status: string): Promise<User> {
    const query = `
      UPDATE users
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, username, email, password_hash as "passwordHash", google_id as "googleId", facebook_id as "facebookId", display_name as "displayName", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
    `;
    const result = await this.pool.query(query, [status, userId]);
    return result.rows[0];
  }

  async linkGoogleId(userId: string, googleId: string): Promise<User> {
    const query = `
      UPDATE users
      SET google_id = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, username, email, password_hash as "passwordHash", google_id as "googleId", facebook_id as "facebookId", display_name as "displayName", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
    `;
    const result = await this.pool.query(query, [googleId, userId]);
    return result.rows[0];
  }

  async linkFacebookId(userId: string, facebookId: string): Promise<User> {
    const query = `
      UPDATE users
      SET facebook_id = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, username, email, password_hash as "passwordHash", google_id as "googleId", facebook_id as "facebookId", display_name as "displayName", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
    `;
    const result = await this.pool.query(query, [facebookId, userId]);
    return result.rows[0];
  }

  async deleteUser(userId: string): Promise<void> {
    const query = 'DELETE FROM users WHERE id = $1';
    await this.pool.query(query, [userId]);
  }
}


export const postgresUserRepository = new PostgresUserRepository();