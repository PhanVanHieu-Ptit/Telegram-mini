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
      INSERT INTO users (username, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id, username, email, password_hash as "passwordHash", created_at as "createdAt", updated_at as "updatedAt"
    `;
    const values = [username, email, passwordHash];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash as "passwordHash", created_at as "createdAt", updated_at as "updatedAt"
      FROM users
      WHERE email = $1
    `;
    const result = await this.pool.query(query, [email]);
    return result.rows[0] || null;
  }

  async findUserById(id: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash as "passwordHash", created_at as "createdAt", updated_at as "updatedAt"
      FROM users
      WHERE id = $1
    `;
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }
}

export const postgresUserRepository = new PostgresUserRepository();