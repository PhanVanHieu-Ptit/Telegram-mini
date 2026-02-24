import { pgPool } from "../../core/db";

import type { IConversationRepository } from "./message.repositories";
import type { ConversationDTO } from "./message.types";

interface ConversationRow {
  id: string;
  created_at: Date;
  updated_at: Date | null;
}

export class PostgresConversationRepository implements IConversationRepository {
  async isMember(conversationId: string, userId: string): Promise<boolean> {
    const result = await pgPool.query(
      `
        SELECT 1
        FROM conversation_members
        WHERE conversation_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [conversationId, userId],
    );

    return result.rowCount > 0;
  }

  async updateConversationTimestamp(conversationId: string): Promise<void> {
    await pgPool.query(
      `
        UPDATE conversations
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [conversationId],
    );
  }

  async getConversationById(
    conversationId: string,
  ): Promise<ConversationRow | null> {
    const result = await pgPool.query<ConversationRow>(
      `
        SELECT id, created_at, updated_at
        FROM conversations
        WHERE id = $1
        LIMIT 1
      `,
      [conversationId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  }

  async updateUpdatedAt(conversationId: string): Promise<void> {
    await this.updateConversationTimestamp(conversationId);
  }

  async createConversation(userIds: string[]): Promise<ConversationDTO> {
    const client = await pgPool.connect();

    try {
      await client.query("BEGIN");

      const conversationResult = await client.query<ConversationRow>(
        `
          INSERT INTO conversations DEFAULT VALUES
          RETURNING id, created_at, updated_at
        `,
      );

      const conversation = conversationResult.rows[0];

      if (userIds.length > 0) {
        const values = userIds
          .map((_, index) => `($1, $${index + 2})`)
          .join(", ");

        await client.query(
          `
            INSERT INTO conversation_members (conversation_id, user_id)
            VALUES ${values}
            ON CONFLICT (conversation_id, user_id) DO NOTHING
          `,
          [conversation.id, ...userIds],
        );
      }

      await client.query("COMMIT");

      return {
        id: conversation.id,
        createdAt: conversation.created_at.toISOString(),
        updatedAt: conversation.updated_at?.toISOString(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserConversations(userId: string): Promise<ConversationDTO[]> {
    const result = await pgPool.query<ConversationRow>(
      `
        SELECT c.id, c.created_at, c.updated_at
        FROM conversations c
        INNER JOIN conversation_members cm
          ON cm.conversation_id = c.id
        WHERE cm.user_id = $1
        ORDER BY COALESCE(c.updated_at, c.created_at) DESC
      `,
      [userId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async joinConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    await pgPool.query(
      `
        INSERT INTO conversation_members (conversation_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (conversation_id, user_id) DO NOTHING
      `,
      [conversationId, userId],
    );

    await this.updateConversationTimestamp(conversationId);
  }
}

