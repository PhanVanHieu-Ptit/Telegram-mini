import { pgPool } from "../../core/db";
import { AppError } from "../../core/errors/AppError";
import { mongoMessageRepository } from "./mongo-message.repository";

import type { IConversationRepository } from "./message.repositories";
import type { ConversationDTO, ConversationListItemDTO, MessageDTO, ConversationMember } from "./message.types";

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
      console.log(`[PostgresRepo] createConversation success: ${conversation.id}`);

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
      console.error("[PostgresRepo] createConversation error:", error);
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
        type: 'private' | 'group';
        participant_ids: string;
        members_json: string;
        unread_count: number;
        pinned: boolean;
        muted: boolean;
        updated_at: Date;
        name: string;
        last_message_id: string | null;
      }>(
        `
          SELECT
            c.id,
            c.type,
            string_agg(DISTINCT cm.user_id::text, ',') as participant_ids,
            json_agg(
              json_build_object(
                'id', u.id,
                'fullName', COALESCE(u.display_name, u.username, ''),
                'avatarUrl', u.avatar,
                'email', u.email,
                'role', cm.role
              )
            ) FILTER (WHERE u.id IS NOT NULL)::text as members_json,
            cm_user.unread_count,
            cm_user.pinned,
            cm_user.muted,
            c.updated_at,
            c.name,
            c.last_message_id
          FROM conversations c
          INNER JOIN conversation_members cm
            ON cm.conversation_id = c.id
          LEFT JOIN users u
            ON u.id = cm.user_id
          INNER JOIN conversation_members cm_user
            ON cm_user.conversation_id = c.id AND cm_user.user_id = $1::uuid
          GROUP BY c.id, c.type, c.updated_at, c.last_message_id, cm_user.unread_count, cm_user.pinned, cm_user.muted
          ORDER BY COALESCE(c.updated_at, c.created_at) DESC
        `,
        [userId],
      );

      // For each conversation, fetch the last message from MongoDB if available
      const conversations: ConversationListItemDTO[] = [];
      for (const row of result.rows) {
        const participantIds = row.participant_ids ? row.participant_ids.split(',').map(id => id.trim()) : [];

        // Parse members from JSON
        let members: ConversationMember[] = [];
        try {
          if (row.members_json) {
            // Handle both string and object cases
            const membersData = typeof row.members_json === 'string'
              ? JSON.parse(row.members_json)
              : row.members_json;
            members = Array.isArray(membersData) ? membersData : [];
          }
        } catch (error) {
          console.error('Failed to parse members JSON:', error);
          members = [];
        }

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
          type: row.type,
          participantIds,
          members,
          lastMessage,
          unreadCount: row.unread_count || 0,
          pinned: row.pinned || false,
          muted: row.muted || false,
          updatedAt: row.updated_at.toISOString(),
          chatName: row.name || ''
        });
      }

      return conversations;
    } catch (error) {
      console.error('Error fetching user conversations:', error);
      throw error;
    }
  }

  private async getLastMessage(messageId: string): Promise<MessageDTO | undefined> {
    return await mongoMessageRepository.findById(messageId) ?? undefined;
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

  async getMemberIds(conversationId: string): Promise<string[]> {
    const result = await pgPool.query<{ user_id: string }>(
      `
        SELECT user_id
        FROM conversation_members
        WHERE conversation_id = $1
      `,
      [conversationId],
    );

    return result.rows.map((row) => row.user_id);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await pgPool.query(
      `
        DELETE FROM conversations
        WHERE id = $1
      `,
      [conversationId],
    );
  }

  async getMemberRole(conversationId: string, userId: string): Promise<string | null> {
    const result = await pgPool.query<{ role: string }>(
      `
        SELECT role
        FROM conversation_members
        WHERE conversation_id = $1 AND user_id = $2
      `,
      [conversationId, userId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0].role;
  }

  async findPrivateConversation(userIds: string[]): Promise<ConversationDTO | null> {
    try {
      // If userIds has only one user, it's a "Saved Messages" chat
      const uniqueUserIds = [...new Set(userIds)];
      const isSelf = uniqueUserIds.length === 1;

      let query = "";
      let params: any[] = [];

      if (isSelf) {
        query = `
          SELECT c.*
          FROM conversations c
          WHERE c.type = 'private'
            AND EXISTS (
              SELECT 1 FROM conversation_members cm
              WHERE cm.conversation_id = c.id
              GROUP BY cm.conversation_id
              HAVING COUNT(*) = 1 AND MAX(cm.user_id::text) = $1
            )
        `;
        params = [uniqueUserIds[0]];
      } else {
        query = `
          SELECT c.*
          FROM conversations c
          JOIN conversation_members cm1 ON c.id = cm1.conversation_id
          JOIN conversation_members cm2 ON c.id = cm2.conversation_id
          WHERE c.type = 'private'
            AND cm1.user_id = $1::uuid
            AND cm2.user_id = $2::uuid
            AND cm1.user_id != cm2.user_id
            AND (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) = 2
        `;
        params = [uniqueUserIds[0], uniqueUserIds[1]];
      }

      const result = await pgPool.query<ConversationRow>(query, params);

      if (result.rowCount === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        type: row.type,
        name: row.name,
        avatar: row.avatar,
        createdBy: row.created_by,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at?.toISOString(),
      };
    } catch (error) {
      console.error("[PostgresConversationRepository] findPrivateConversation error:", error);
      throw error;
    }
  }

  async getConversationListItem(conversationId: string, userId: string): Promise<ConversationListItemDTO | null> {
    try {
      const result = await pgPool.query<{
        id: string;
        type: 'private' | 'group';
        participant_ids: string;
        members_json: string;
        unread_count: number;
        pinned: boolean;
        muted: boolean;
        updated_at: Date;
        name: string;
        last_message_id: string | null;
      }>(
        `
          SELECT
            c.id,
            c.type,
            string_agg(DISTINCT cm.user_id::text, ',') as participant_ids,
            json_agg(
              json_build_object(
                'id', u.id,
                'fullName', COALESCE(u.display_name, u.username, ''),
                'avatarUrl', u.avatar,
                'email', u.email,
                'role', cm.role
              )
            ) FILTER (WHERE u.id IS NOT NULL)::text as members_json,
            cm_user.unread_count,
            cm_user.pinned,
            cm_user.muted,
            c.updated_at,
            c.name,
            c.last_message_id
          FROM conversations c
          INNER JOIN conversation_members cm
            ON cm.conversation_id = c.id
          LEFT JOIN users u
            ON u.id = cm.user_id
          INNER JOIN conversation_members cm_user
            ON cm_user.conversation_id = c.id AND cm_user.user_id = $2::uuid
          WHERE c.id = $1::uuid
          GROUP BY c.id, c.type, c.updated_at, c.last_message_id, cm_user.unread_count, cm_user.pinned, cm_user.muted
        `,
        [conversationId, userId],
      );

      if (result.rows.length === 0) {
        console.warn(`[PostgresRepo] getConversationListItem: No rows found for conv ${conversationId} and user ${userId}`);
        return null;
      }
      const row = result.rows[0];

      const participantIds = row.participant_ids ? row.participant_ids.split(',').map(id => id.trim()) : [];

      let members: ConversationMember[] = [];
      try {
        if (row.members_json) {
          const membersData = typeof row.members_json === 'string'
            ? JSON.parse(row.members_json)
            : row.members_json;
          members = Array.isArray(membersData) ? membersData : [];
        }
      } catch (error) {
        console.error('Failed to parse members JSON:', error);
      }

      let lastMessage: MessageDTO | undefined;
      if (row.last_message_id) {
        lastMessage = await this.getLastMessage(row.last_message_id);
      }

      return {
        id: row.id,
        type: row.type,
        participantIds,
        members,
        lastMessage,
        unreadCount: row.unread_count || 0,
        pinned: row.pinned || false,
        muted: row.muted || false,
        updatedAt: row.updated_at.toISOString(),
        chatName: row.name || ''
      };
    } catch (error) {
      console.error(`[PostgresRepo] getConversationListItem error for ${conversationId}:`, error);
      throw error;
    }
  }

  async pinConversation(conversationId: string, userId: string): Promise<void> {
    await pgPool.query(
      `
        UPDATE conversation_members
        SET pinned = true
        WHERE conversation_id = $1 AND user_id = $2
      `,
      [conversationId, userId],
    );
  }

  async unpinConversation(conversationId: string, userId: string): Promise<void> {
    await pgPool.query(
      `
        UPDATE conversation_members
        SET pinned = false
        WHERE conversation_id = $1 AND user_id = $2
      `,
      [conversationId, userId],
    );
  }

  async muteConversation(conversationId: string, userId: string): Promise<void> {
    await pgPool.query(
      `
        UPDATE conversation_members
        SET muted = true
        WHERE conversation_id = $1 AND user_id = $2
      `,
      [conversationId, userId],
    );
  }

  async unmuteConversation(conversationId: string, userId: string): Promise<void> {
    await pgPool.query(
      `
        UPDATE conversation_members
        SET muted = false
        WHERE conversation_id = $1 AND user_id = $2
      `,
      [conversationId, userId],
    );
  }

  async addMembers(conversationId: string, userIds: string[], role: string = 'member'): Promise<void> {
    if (userIds.length === 0) return;
    const client = await pgPool.connect();
    try {
        await client.query("BEGIN");
        const values = userIds.map((_, i) => `($1, $${i + 2}, $${userIds.length + 2})`).join(", ");
        const params = [conversationId, ...userIds, role];
        await client.query(`
          INSERT INTO conversation_members (conversation_id, user_id, role)
          VALUES ${values}
          ON CONFLICT (conversation_id, user_id) DO NOTHING
        `, params);
        await this.updateConversationTimestamp(conversationId);
        await client.query("COMMIT");
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }
  }

  async removeMember(conversationId: string, userId: string): Promise<void> {
    await pgPool.query(`
      DELETE FROM conversation_members
      WHERE conversation_id = $1 AND user_id = $2
    `, [conversationId, userId]);
    await this.updateConversationTimestamp(conversationId);
  }
}

