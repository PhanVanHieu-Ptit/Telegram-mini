import type { FastifyReply, FastifyRequest } from "fastify";
import type { Server as SocketIOServer } from "socket.io";

import {
  MessageService,
  messageService,
  type CreateMessageParams,
  type ListMessagesFilter,
  type Message,
} from "./message.service";

export interface CreateMessageBody extends CreateMessageParams {}

export interface ListMessagesQuery extends ListMessagesFilter {}

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
    const { from, to, text } = request.body ?? {};

    if (!from || !to || !text) {
      void reply.code(400).send({
        error: "from, to and text are required",
      });
      return;
    }

    const message: Message = this.service.createMessage({ from, to, text });

    if (request.server.io) {
      request.server.io.emit("message:new", message);
    }

    void reply.code(201).send(message);
  }

  async listMessages(
    request: FastifyRequestWithIO<unknown, ListMessagesQuery>,
    reply: FastifyReply,
  ): Promise<void> {
    const { from, to } = request.query ?? {};
    const messages = this.service.listMessages({ from, to });
    void reply.send(messages);
  }
}

export const messageController = new MessageController(messageService);

