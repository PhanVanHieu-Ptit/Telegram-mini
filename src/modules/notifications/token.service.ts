import { pgPool } from "../../core/db";

export class TokenService {
  async registerToken(userId: string, token: string, deviceType?: string): Promise<void> {
    await pgPool.query(
      `
      INSERT INTO fcm_tokens (user_id, token, device_type, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, token) DO UPDATE
      SET updated_at = NOW(), device_type = EXCLUDED.device_type
      `,
      [userId, token, deviceType || null]
    );
  }

  async removeToken(userId: string, token: string): Promise<void> {
    await pgPool.query(
      `DELETE FROM fcm_tokens WHERE user_id = $1 AND token = $2`,
      [userId, token]
    );
  }

  async clearUserTokens(userId: string): Promise<void> {
    await pgPool.query(
      `DELETE FROM fcm_tokens WHERE user_id = $1`,
      [userId]
    );
  }

  async getTokensByUserId(userId: string): Promise<string[]> {
    const result = await pgPool.query<{ token: string }>(
      `SELECT token FROM fcm_tokens WHERE user_id = $1`,
      [userId]
    );
    return result.rows.map(row => row.token);
  }

  async removeInvalidToken(token: string): Promise<void> {
    await pgPool.query(
      `DELETE FROM fcm_tokens WHERE token = $1`,
      [token]
    );
  }
}
