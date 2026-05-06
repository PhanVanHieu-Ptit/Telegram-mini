import type { FastifyPluginAsync } from "fastify";
import multipart from "@fastify/multipart";
import { messageController } from "../modules/message/message.controller";
import { messageSummarizeController } from "../modules/message/message-summarize.controller";

const MessageRequestBody = {
  type: 'object',
  required: ['conversationId', 'senderId', 'content'],
  properties: {
    conversationId: { type: 'string' },
    senderId: { type: 'string' },
    content: { type: 'string' },
    type: { type: 'string', nullable: true },
    attachments: { 
      type: 'array', 
      items: { type: 'object', additionalProperties: true }, 
      nullable: true 
    },
    metadata: { type: 'object', additionalProperties: true, nullable: true },
    mentions: { type: 'array', items: { type: 'string' }, nullable: true },
    replyTo: { type: 'string', nullable: true },
    forwardedFrom: { type: 'string', nullable: true },
  },
};

const MessageResponse = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    conversationId: { type: 'string' },
    senderId: { type: 'string' },
    type: { type: 'string', nullable: true },
    content: { type: 'string' },
    attachments: { type: 'array', items: { type: 'object', additionalProperties: true }, nullable: true },
    metadata: { type: 'object', additionalProperties: true, nullable: true },
    reactions: { type: 'object', additionalProperties: true, nullable: true },
    seenBy: { type: 'array', items: { type: 'string' }, nullable: true },
    mentions: { type: 'array', items: { type: 'string' }, nullable: true },
    hiddenBy: { type: 'array', items: { type: 'string' }, nullable: true },
    isPinned: { type: 'boolean', nullable: true },
    replyTo: { type: 'string', nullable: true },
    forwardedFrom: { type: 'string', nullable: true },
    isDeleted: { type: 'boolean', nullable: true },
    deletedBy: { type: 'string', nullable: true },
    deletedAt: { type: 'string', format: 'date-time', nullable: true },
    editedAt: { type: 'string', format: 'date-time', nullable: true },
    editHistory: { 
      type: 'array', 
      items: { 
        type: 'object', 
        properties: { 
          content: { type: 'string' }, 
          editedAt: { type: 'string', format: 'date-time' } 
        } 
      }, 
      nullable: true 
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const ErrorResponse = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
};

const ConversationMemberSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    fullName: { type: "string" },
    avatarUrl: { type: "string", nullable: true },
    email: { type: "string" },
    role: { type: "string" },
    isOnline: { type: "boolean", nullable: true },
  },
  required: ["id", "fullName", "email", "role"],
};

const ConversationResponse = {
  type: "object",
  properties: {
    id: { type: "string" },
    participantIds: {
      type: "array",
      items: { type: "string" }
    },
    members: {
      type: "array",
      items: ConversationMemberSchema,
    },
    lastMessage: {
      type: "object",
      nullable: true,
      properties: {
        id: { type: "string" },
        conversationId: { type: "string" },
        senderId: { type: "string" },
        content: { type: "string" },
        type: { type: "string", nullable: true },
        attachments: { type: 'array', items: { type: 'object', additionalProperties: true }, nullable: true },
        metadata: { type: 'object', additionalProperties: true, nullable: true },
        reactions: { type: 'object', additionalProperties: true, nullable: true },
        seenBy: { type: "array", items: { type: "string" }, nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time", nullable: true },
      },
    },
    unreadCount: { type: "number" },
    pinned: { type: "boolean" },
    muted: { type: "boolean" },
    chatName: { type: "string" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const CreateConversationBody = {
  type: "object",
  required: ["userIds"],
  properties: {
    userIds: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
    },
    type: { type: "string", enum: ["private", "group"], nullable: true },
    name: { type: "string", nullable: true },
    avatar: { type: "string", nullable: true },
    createdBy: { type: "string", nullable: true },
  },
};

const routes: FastifyPluginAsync = async (fastify) => {
  // Register multipart plugin for file upload routes
  await fastify.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100 MB max per file
      files: 10,                    // Max 10 files per request
    },
  });

  // Create conversation endpoint
  fastify.post(
    '/conversations',
    {
      schema: {
        summary: "Create a new conversation",
        tags: ["conversations"],
        security: [{ bearerAuth: [] }],
        body: CreateConversationBody,
        response: {
          200: ConversationResponse,
          400: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.createConversation(request as any, reply);
    },
  );

  // List user conversations endpoint
  fastify.get(
    '/conversations',
    {
      schema: {
        summary: 'List user conversations',
        tags: ['conversations'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: "array",
            items: ConversationResponse,
          },
          400: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: async (request, reply) => {
        await (fastify as any).authenticate(request, reply);
      },
    },
    async (request, reply) => {
      await messageController.listConversations(request as any, reply);
    },
  );

  // Join conversation endpoint
  fastify.post(
    '/conversations/join',
    {
      schema: {
        summary: 'Join an existing conversation',
        tags: ['conversations'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['conversationId', 'userId'],
          properties: {
            conversationId: { type: 'string' },
            userId: { type: 'string' },
          },
        },
        response: {
          200: { description: "Successfully joined conversation" },
          400: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.joinConversation(request as any, reply);
    },
  );

  // Get or create saved messages conversation
  fastify.get(
    '/conversations/saved',
    {
      schema: {
        summary: 'Get or create Saved Messages conversation',
        tags: ['conversations'],
        security: [{ bearerAuth: [] }],
        response: {
          200: ConversationResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.getSavedMessages(request as any, reply);
    },
  );
 
  // Delete conversation endpoint
  fastify.delete(
    '/conversations/:id',
    {
      schema: {
        summary: 'Delete a conversation',
        tags: ['conversations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.deleteConversation(request as any, reply);
    },
  );

  // Pin conversation endpoint
  fastify.post(
    '/conversations/:id/pin',
    {
      schema: {
        summary: 'Pin a conversation',
        tags: ['conversations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.pinConversation(request as any, reply);
    },
  );

  // Unpin conversation endpoint
  fastify.post(
    '/conversations/:id/unpin',
    {
      schema: {
        summary: 'Unpin a conversation',
        tags: ['conversations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.unpinConversation(request as any, reply);
    },
  );

  // Add members endpoint
  fastify.post(
    '/conversations/:id/members',
    {
      schema: {
        summary: 'Add members to a conversation',
        tags: ['conversations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['userIds'],
          properties: {
            userIds: { type: 'array', items: { type: 'string' } },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.addMembers(request as any, reply);
    },
  );

  // Remove member endpoint
  fastify.delete(
    '/conversations/:id/members/:userId',
    {
      schema: {
        summary: 'Remove a member from a conversation',
        tags: ['conversations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.removeMember(request as any, reply);
    },
  );

  fastify.post(
    '/messages',
    {
      schema: {
        summary: 'Send a message',
        tags: ['messages'],
        security: [{ bearerAuth: [] }],
        body: MessageRequestBody,
        response: {
          200: MessageResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.createMessage(request as any, reply);
    },
  );

  fastify.post(
    '/messages/:messageId/react',
    {
      schema: {
        summary: 'React to a message',
        tags: ['messages'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['messageId'],
          properties: { messageId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['emoji'],
          properties: { emoji: { type: 'string' } },
        },
        response: {
          200: { type: 'object', properties: { success: { type: 'boolean' } } },
          400: ErrorResponse,
          401: ErrorResponse,
          404: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.reactMessage(request as any, reply);
    },
  );

  fastify.get(
    '/messages',
    {
      schema: {
        summary: 'List messages',
        tags: ['messages'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: "array",
            items: MessageResponse,
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.listMessages(request as any, reply);
    },
  );

  // Typing indicator endpoint
  fastify.post(
    '/typing',
    {
      schema: {
        summary: 'Send typing indicator',
        tags: ['messages'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['conversationId', 'userId', 'isTyping'],
          properties: {
            conversationId: { type: 'string' },
            userId: { type: 'string' },
            isTyping: { type: 'boolean' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.typing(request as any, reply);
    },
  );

  // Mark messages as seen endpoint
  fastify.post(
    '/seen',
    {
      schema: {
        summary: 'Mark messages as seen',
        tags: ['messages'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['conversationId', 'userId'],
          properties: {
            conversationId: { type: 'string' },
            userId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.markAsSeen(request as any, reply);
    },
  );

  // Summarize messages using local LLM
  fastify.post(
    '/messages/summarize',
    {
      schema: {
        summary: 'Summarize chat messages using local LLM',
        tags: ['messages'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['messages'],
          properties: {
            messages: { type: 'string' },
            senderFilter: { type: 'string', nullable: true },
            startTime: { type: 'string', nullable: true },
            endTime: { type: 'string', nullable: true },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              summary: { type: 'array', items: { type: 'string' } },
            },
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageSummarizeController.summarize(request as any, reply);
    },
  );

  fastify.post(
    '/messages/summarize/v2',
    {
      schema: {
        summary: 'Summarize chat messages using Hugging Face AI',
        tags: ['messages'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['messages'],
          properties: {
            messages: { type: 'string' },
            senderFilter: { type: 'string', nullable: true },
            startTime: { type: 'string', nullable: true },
            endTime: { type: 'string', nullable: true },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              summary: { type: 'array', items: { type: 'string' } },
            },
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageSummarizeController.summarizeV2(request as any, reply);
    },
  );
  fastify.get(
    '/messages/search',
    {
      schema: {
        summary: 'Search messages',
        tags: ['messages'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            keyword: { type: 'string' },
            type: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
            senderId: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
            fromDate: { type: 'string' },
            toDate: { type: 'string' },
            cursor: { type: 'string' },
          },
        },
        response: {
          200: {
            type: "array",
            items: MessageResponse,
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.searchMessages(request as any, reply);
    },
  );

  const messageActionSchema = {
    schema: {
      tags: ['messages'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['messageId'],
        properties: { messageId: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['conversationId'],
        properties: { conversationId: { type: 'string' } },
      },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
        400: ErrorResponse,
        401: ErrorResponse,
        500: ErrorResponse,
      },
    },
    preHandler: fastify.authenticate,
  };

  fastify.post('/messages/:messageId/hide', messageActionSchema, async (request, reply) => {
    await messageController.hideMessage(request as any, reply);
  });

  fastify.post('/messages/:messageId/unhide', messageActionSchema, async (request, reply) => {
    await messageController.unhideMessage(request as any, reply);
  });

  fastify.post('/messages/:messageId/pin', messageActionSchema, async (request, reply) => {
    await messageController.pinMessage(request as any, reply);
  });

  fastify.post('/messages/:messageId/unpin', messageActionSchema, async (request, reply) => {
    await messageController.unpinMessage(request as any, reply);
  });

  fastify.patch(
    '/messages/:messageId',
    {
      schema: {
        summary: 'Edit a message',
        tags: ['messages'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['messageId'],
          properties: { messageId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['content', 'conversationId'],
          properties: {
            content: { type: 'string' },
            conversationId: { type: 'string' },
          },
        },
        response: {
          200: MessageResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.editMessage(request as any, reply);
    },
  );

  fastify.delete(
    '/messages/:messageId',
    {
      schema: {
        summary: 'Delete a message',
        tags: ['messages'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['messageId'],
          properties: { messageId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string' },
            mode: { type: 'string', enum: ['self', 'everyone'], default: 'self' },
          },
        },
        response: {
          200: { type: 'object', properties: { success: { type: 'boolean' } } },
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.deleteMessage(request as any, reply);
    },
  );

  /**
   * POST /messages/send-with-media
   * Multipart form-data endpoint. Backend uploads files to Cloudinary,
   * then saves the message with Cloudinary CDN URLs.
   *
   * Form fields:
   *   - conversationId (required)
   *   - content (optional text)
   *   - type (optional, auto-detected)
   *   - replyTo (optional messageId)
   *   - forwardedFrom (optional)
   *   - mentions (optional, JSON array string)
   *   - files[] (file parts, up to 10)
   */
  fastify.post(
    '/messages/send-with-media',
    {
      schema: {
        summary: 'Send a message with media attachments (Cloudinary)',
        tags: ['messages'],
        security: [{ bearerAuth: [] }],
        // No body schema — validated manually due to multipart
        response: {
          200: MessageResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await messageController.sendMessageWithMedia(request as any, reply);
    },
  );

  /**
   * POST /messages/upload-attachments
   * Upload-only endpoint: receives files via multipart/form-data,
   * uploads each to Cloudinary, and returns the attachment metadata array.
   * Frontend then includes these in the regular POST /messages payload.
   */
  fastify.post(
    '/messages/upload-attachments',
    {
      schema: {
        summary: 'Upload attachments to Cloudinary and get back CDN URLs',
        tags: ['messages'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                public_id: { type: 'string' },
                type: { type: 'string' },
                format: { type: 'string' },
                size: { type: 'number' },
                name: { type: 'string' },
              },
            },
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const authenticatedUser = (request as any).user;
      if (!authenticatedUser?.userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        const { uploadToCloudinary } = await import('../modules/cloudinary/cloudinary.service');
        const parts = (request as any).parts();
        const results: any[] = [];
        let conversationId = 'general';

        for await (const part of parts) {
          if (part.type === 'file') {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk as Buffer);
            }
            const buffer = Buffer.concat(chunks);
            const result = await uploadToCloudinary(
              buffer,
              part.mimetype || 'application/octet-stream',
              part.filename || 'upload',
              buffer.length,
              `chat-media/${conversationId}`,
            );
            results.push(result);
          } else if (part.fieldname === 'conversationId') {
            conversationId = (part as any).value || 'general';
          }
        }

        return reply.code(200).send(results);
      } catch (err: any) {
        const statusCode = err.statusCode || 500;
        return reply.code(statusCode).send({ error: (err as Error).message });
      }
    },
  );
};

export default routes;

