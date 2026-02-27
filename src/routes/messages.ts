import type { FastifyPluginAsync } from "fastify";
import { messageController } from "../modules/message/message.controller";

const MessageRequestBody = {
  type: 'object',
  required: ['conversationId', 'senderId', 'content'],
  properties: {
    conversationId: { type: 'string' },
    senderId: { type: 'string' },
    content: { type: 'string' },
  },
};

const MessageResponse = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    conversationId: { type: 'string' },
    senderId: { type: 'string' },
    content: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
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
        type: { type: "string" },
        seenBy: { type: "array", items: { type: "string" } },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time", nullable: true },
      },
    },
    unreadCount: { type: "number" },
    pinned: { type: "boolean" },
    muted: { type: "boolean" },
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
};

export default routes;

