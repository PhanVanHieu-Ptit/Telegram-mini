import { pgPool } from "../../core/db";
import { AppError } from "../../core/errors/AppError";

import type { IConversationRepository } from "./message.repositories";
import type { ConversationDTO } from "./message.types";

interface ConversationRow {
  id: string;
  type: 'private' | 'group';
  name: string | null;
  avatar: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date | null;
}

export class PostgresConversationRepository implements IConversationRepository {
  async validateMember(conversationId: string, userId: string): Promise<void> {
    const isMember = await this.isMember(conversationId, userId);
    if (!isMember) {
      throw new AppError("User is not a member of this conversation", 403, "FORBIDDEN");
    }
  }

  async updateLastMessage(conversationId: string, messageId: string): Promise<void> {
    await pgPool.query(
      `
        UPDATE conversations
        SET last_message_id = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [conversationId, messageId],
    );
  }

  async incrementUnread(conversationId: string, userId: string): Promise<void> {
    await pgPool.query(
      `
        UPDATE conversation_members
        SET unread_count = unread_count + 1
        WHERE conversation_id = $1 AND user_id = $2
      `,
      [conversationId, userId],
    );
  }

  async resetUnread(conversationId: string, userId: string): Promise<void> {
    await pgPool.query(
      `
        UPDATE conversation_members
        SET unread_count = 0
        WHERE conversation_id = $1 AND user_id = $2
      `,
      [conversationId, userId],
    );
  }

  async updateUpdatedAt(conversationId: string): Promise<void> {
    await pgPool.query(
      `
        UPDATE conversations
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [conversationId],
    );
  }
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

    return (result.rowCount ?? 0) > 0;
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
        SELECT id, type, name, avatar, created_by, created_at, updated_at
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

  async updateLastReadMessage(
    conversationId: string,
    userId: string,
    messageId: string,
  ): Promise<void> {
    await pgPool.query(
      `
        UPDATE conversation_members
        SET last_read_message_id = $3
        WHERE conversation_id = $1 AND user_id = $2
      `,
      [conversationId, userId, messageId],
    );
  }

  async createConversation(data: {
    userIds: string[];
    type?: "private" | "group";
    name?: string;
    avatar?: string;
    createdBy?: string;
  }): Promise<ConversationDTO> {
    const { userIds, type = "private", name, avatar, createdBy } = data;
    const client = await pgPool.connect();

    try {
      await client.query("BEGIN");

      const conversationResult = await client.query<ConversationRow>(
        `
          INSERT INTO conversations (type, name, avatar, created_by)
          VALUES ($1, $2, $3, $4)
          RETURNING id, type, name, avatar, created_by, created_at, updated_at
        `,
        [type, name || null, avatar || null, createdBy || null],
      );

      const conversation = conversationResult.rows[0];

      if (userIds.length > 0) {
        // Prepare data for members insertion
        const memberEntries = userIds.map((uid) => ({
          uid,
          role: uid === createdBy ? 'owner' : 'member'
        }));

        const values = memberEntries
          .map((_, index) => `($1, $${index * 2 + 2}, $${index * 2 + 3})`)
          .join(", ");

        const flatValues = memberEntries.flatMap(m => [m.uid, m.role]);

        await client.query(
          `
            INSERT INTO conversation_members (conversation_id, user_id, role)
            VALUES ${values}
            ON CONFLICT (conversation_id, user_id) DO NOTHING
          `,
          [conversation.id, ...flatValues],
        );
      }

      await client.query("COMMIT");

      return {
        id: conversation.id,
        type: conversation.type,
        name: conversation.name,
        avatar: conversation.avatar,
        createdBy: conversation.created_by,
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
        SELECT c.id, c.type, c.name, c.avatar, c.created_by, c.created_at, c.updated_at
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
      type: row.type,
      name: row.name,
      avatar: row.avatar,
      createdBy: row.created_by,
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

