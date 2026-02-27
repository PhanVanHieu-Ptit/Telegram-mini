import { pgPool } from "../../core/db";
import { AppError } from "../../core/errors/AppError";

import type { IConversationRepository } from "./message.repositories";
import type { ConversationDTO, ConversationListItemDTO, MessageDTO } from "./message.types";

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

  async getUserConversations(userId: string): Promise<ConversationListItemDTO[]> {
    try {
      const result = await pgPool.query<{
        id: string;
        participant_ids: string;
        unread_count: number;
        pinned: boolean;
        muted: boolean;
        updated_at: Date;
        last_message_id: string | null;
      }>(
        `
          SELECT
            c.id,
            string_agg(DISTINCT cm.user_id::text, ',') as participant_ids,
            cm_user.unread_count,
            cm_user.pinned,
            cm_user.muted,
            c.updated_at,
            c.last_message_id
          FROM conversations c
          INNER JOIN conversation_members cm
            ON cm.conversation_id = c.id
          INNER JOIN conversation_members cm_user
            ON cm_user.conversation_id = c.id AND cm_user.user_id = $1::uuid
          GROUP BY c.id, c.updated_at, c.last_message_id, cm_user.unread_count, cm_user.pinned, cm_user.muted
          ORDER BY COALESCE(c.updated_at, c.created_at) DESC
        `,
        [userId],
      );

      // For each conversation, fetch the last message from MongoDB if available
      const conversations: ConversationListItemDTO[] = [];
      for (const row of result.rows) {
        const participantIds = row.participant_ids ? row.participant_ids.split(',').map(id => id.trim()) : [];

        let lastMessage: MessageDTO | undefined;
        if (row.last_message_id) {
          try {
            lastMessage = await this.getLastMessage(row.last_message_id);
          } catch (error) {
            console.error('Failed to fetch last message:', error);
            // Continue without last message
          }
        }

        conversations.push({
          id: row.id,
          participantIds,
          lastMessage,
          unreadCount: row.unread_count || 0,
          pinned: row.pinned || false,
          muted: row.muted || false,
          updatedAt: row.updated_at.toISOString(),
        });
      }

      return conversations;
    } catch (error) {
      console.error('Error fetching user conversations:', error);
      throw error;
    }
  }

  private async getLastMessage(messageId: string): Promise<MessageDTO | undefined> {
    // This will be implemented to fetch from MongoDB
    // For now, returning undefined
    return undefined;
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

