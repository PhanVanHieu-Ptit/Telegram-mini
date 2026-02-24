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

const ConversationResponse = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const CreateConversationBody = {
  type: 'object',
  required: ['userIds'],
  properties: {
    userIds: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
  },
};

const routes: FastifyPluginAsync = async (fastify) => {
  // Create conversation endpoint
  fastify.post(
    '/conversations',
    {
      schema: {
        summary: 'Create a new conversation',
        tags: ['conversations'],
        security: [{ bearerAuth: [] }],
        body: CreateConversationBody,
        response: {
          201: ConversationResponse,
          400: ErrorResponse,
          500: ErrorResponse,
        },
      },
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
            type: 'array',
            items: ConversationResponse,
          },
          400: ErrorResponse,
          500: ErrorResponse,
        },
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
          204: { description: 'Successfully joined conversation' },
          400: ErrorResponse,
          500: ErrorResponse,
        },
      },
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
          201: MessageResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
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
          properties: {
            conversationId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: MessageResponse,
          },
          400: ErrorResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      await messageController.listMessages(request as any, reply);
    },
  );
};

export default routes;

