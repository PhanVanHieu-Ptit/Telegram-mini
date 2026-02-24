import type { FastifyReply, FastifyRequest } from "fastify";
import type { Server as SocketIOServer } from "socket.io";

import { MessageService } from "./message.service";
import type { SendMessageInput, MessageDTO } from "./message.types";


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
    } catch (err) {
      void reply.code(500).send({ error: (err as Error).message });
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
    } catch (err) {
      void reply.code(500).send({ error: (err as Error).message });
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

