import { pgPool } from "../../core/db";
import { UserDB, UserResponse } from "./user.types";

export class UserService {
  async getAllUsers(): Promise<UserResponse[]> {
    const query = `
      SELECT 
        id, 
        username,
        display_name, 
        avatar_url, 
        online, 
        last_seen_at
      FROM users
    `;

    try {
      const { rows } = await pgPool.query<UserDB>(query);

      return rows.map((user) => ({
        id: user.id,
        displayName: user.display_name || user.username || "Unknown",
        avatarUrl: user.avatar_url,
        online: user.online || false,
        lastSeenAt: user.last_seen_at ? user.last_seen_at.toISOString() : undefined,
      }));
    } catch (error) {
      console.error("Error fetching users from database:", error);
      throw error; 
    }
  }

  async getUserById(id: string): Promise<UserResponse | null> {
    const query = `
      SELECT 
        id, 
        username,
        display_name, 
        avatar_url, 
        online, 
        last_seen_at
      FROM users
      WHERE id = $1
    `;

    try {
      const { rows } = await pgPool.query<UserDB>(query, [id]);

      if (rows.length === 0) return null;

      const user = rows[0];
      return {
        id: user.id,
        displayName: user.display_name || user.username || "Unknown",
        avatarUrl: user.avatar_url,
        online: user.online || false,
        lastSeenAt: user.last_seen_at ? user.last_seen_at.toISOString() : undefined,
      };
    } catch (error) {
      console.error(`Error fetching user ${id} from database:`, error);
      throw error;
    }
  }
}

export const userService = new UserService();
