import type { FastifyReply, FastifyRequest } from "fastify";
import type { Server as SocketIOServer } from "socket.io";

import { MessageService } from "./message.service";
import type { SendMessageInput, MessageDTO, CreateConversationInput } from "./message.types";


export interface CreateMessageBody extends SendMessageInput { }

export interface ListMessagesQuery {
  conversationId?: string;
}

export type FastifyRequestWithIO<
  TBody = unknown,
  TQuery = unknown,
> = FastifyRequest<{
  Body: TBody;
  Querystring: TQuery;
}> & {
  server: {
    io?: SocketIOServer;
  };
};

export class MessageController {
  private readonly service: MessageService;

  constructor(service: MessageService) {
    this.service = service;
  }

  async createMessage(
    request: FastifyRequestWithIO<CreateMessageBody>,
    reply: FastifyReply,
  ): Promise<void> {
    const { conversationId, senderId, content } = request.body ?? {};

    if (!conversationId || !senderId || !content) {
      void reply.code(400).send({
        error: "conversationId, senderId and content are required",
      });
      return;
    }

    try {
      const message: MessageDTO = await this.service.sendMessage({ conversationId, senderId, content });
      if (request.server.io) {
        request.server.io.emit("message:new", message);
      }
      void reply.code(201).send(message);
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async listMessages(
    request: FastifyRequestWithIO<unknown, ListMessagesQuery>,
    reply: FastifyReply,
  ): Promise<void> {
    const { conversationId } = request.query ?? {};
    if (!conversationId) {
      void reply.code(400).send({ error: "conversationId is required" });
      return;
    }
    try {
      // You need to implement listMessages in MessageService to actually fetch messages
      // const messages = await this.service.listMessages(conversationId);
      // void reply.send(messages);
      void reply.send([]); // Placeholder
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async createConversation(
    request: FastifyRequestWithIO<CreateConversationInput>,
    reply: FastifyReply,
  ): Promise<void> {
    const { userIds, createdBy } = request.body ?? {};
    const authenticatedUser = (request as any).user;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      void reply.code(400).send({ error: "userIds array is required and must contain at least one user" });
      return;
    }

    try {
      // Use authenticated user ID as creator if not provided
      const finalCreatedBy = createdBy || authenticatedUser?.userId;

      // Ensure creator is in userIds
      const finalUserIds = [...new Set([...userIds, finalCreatedBy])].filter(Boolean) as string[];

      const conversation = await this.service.createConversation({
        ...request.body,
        userIds: finalUserIds,
        createdBy: finalCreatedBy,
      });
      void reply.code(201).send(conversation);
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async listConversations(
    request: FastifyRequestWithIO<unknown, { userId: string }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { userId } = request.query ?? {};

    if (!userId) {
      void reply.code(400).send({ error: "userId query parameter is required" });
      return;
    }

    try {
      const conversations = await this.service.getUserConversations(userId);
      void reply.send(conversations);
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async joinConversation(
    request: FastifyRequestWithIO<{ conversationId: string; userId: string }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { conversationId, userId } = request.body ?? {};

    if (!conversationId || !userId) {
      void reply.code(400).send({ error: "conversationId and userId are required" });
      return;
    }

    try {
      await this.service.joinConversation(conversationId, userId);
      void reply.code(200).send();
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }
}


import { PostgresConversationRepository } from "./postgres-conversation.repository";
import { MongoMessageRepository, MessageModel } from "./mongo-message.repository";
// You need to provide a valid Mongoose model for MongoMessageRepository
import mongoose from "mongoose";
import type { MessageDocument } from "./mongo-message.repository";

// Example: Replace 'YourMongooseModel' with your actual model
const messageRepository = new MongoMessageRepository(MessageModel);
const conversationRepository = new PostgresConversationRepository();
export const messageController = new MessageController(new MessageService(messageRepository, conversationRepository));

