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
      RETURNING id, username, email, password_hash as "passwordHash", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
    `;
    const values = [username, email, passwordHash];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash as "passwordHash", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
      FROM users
      WHERE email = $1
    `;
    const result = await this.pool.query(query, [email]);
    return result.rows[0] || null;
  }

  async findUserById(id: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash as "passwordHash", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
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
      RETURNING id, username, email, password_hash as "passwordHash", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
    `;
    const result = await this.pool.query(query, [avatarUrl, userId]);
    return result.rows[0];
  }

  async updateStatus(userId: string, status: string): Promise<User> {
    const query = `
      UPDATE users
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, username, email, password_hash as "passwordHash", avatar, status, created_at as "createdAt", updated_at as "updatedAt"
    `;
    const result = await this.pool.query(query, [status, userId]);
    return result.rows[0];
  }
}


export const postgresUserRepository = new PostgresUserRepository();