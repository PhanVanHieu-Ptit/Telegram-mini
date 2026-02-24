import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { FastifyInstance } from "fastify";

import {
  messageService,
  type CreateMessageParams,
  type Message,
} from "./modules/message/message.service";

export interface SocketMessagePayload extends CreateMessageParams {}

export type FastifyInstanceWithIO = FastifyInstance & {
  io?: SocketIOServer;
};

export function setupSocketIOServer(
  httpServer: HttpServer,
  fastifyInstance: FastifyInstanceWithIO,
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  fastifyInstance.decorate("io", io);

  io.on("connection", (socket) => {
    fastifyInstance.log.info({ socketId: socket.id }, "Socket connected");

    socket.on("message:send", (payload: SocketMessagePayload) => {
      const { from, to, text } = payload ?? {};
      if (!from || !to || !text) {
        return;
      }

      const message: Message = messageService.createMessage({ from, to, text });
      fastifyInstance.log.debug({ message }, "Message created via socket");
      io.emit("message:new", message);
    });

    socket.on("disconnect", (reason: string) => {
      fastifyInstance.log.info(
        { socketId: socket.id, reason },
        "Socket disconnected",
      );
    });
  });

  return io;
}

export default setupSocketIOServer;

