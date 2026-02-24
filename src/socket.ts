import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { FastifyInstance } from "fastify";

import { MessageService } from "./modules/message/message.service";
import type { SendMessageInput, MessageDTO } from "./modules/message/message.types";

export type FastifyInstanceWithIO = FastifyInstance & {
  io?: SocketIOServer;
};

export function setupSocketIOServer(
  httpServer: HttpServer,
  fastifyInstance: FastifyInstanceWithIO,
): SocketIOServer {
  // TODO: inject real implementations of these repositories
  const messageRepository = {} as unknown as import("./modules/message/message.repositories").IMessageRepository;
  const conversationRepository = {} as unknown as import("./modules/message/message.repositories").IConversationRepository;
  const messageService = new MessageService(messageRepository, conversationRepository);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    const auth = socket.handshake.auth as { userId?: string } | undefined;
    const queryUserId = socket.handshake.query
      ?.userId as string | string[] | undefined;

    const userId =
      auth?.userId ??
      (Array.isArray(queryUserId) ? queryUserId[0] : queryUserId);

    if (!userId || !userId.trim()) {
      return next(new Error("Unauthorized"));
    }

    socket.data.userId = userId;
    return next();
  });

  fastifyInstance.decorate("io", io);

  io.on("connection", (socket) => {
    fastifyInstance.log.info({ socketId: socket.id }, "Socket connected");

    socket.on(
      "message:send",
      async (payload: Pick<SendMessageInput, "conversationId" | "content">) => {
        const userId = socket.data?.userId as string | undefined;
        const { conversationId, content } = payload ?? {};

        if (!userId || !conversationId || !content) {
          socket.emit("message:error", {
            message: "userId, conversationId and content are required",
          });
          return;
        }

        try {
          const message: MessageDTO = await messageService.sendMessage({
            conversationId,
            senderId: userId,
            content,
          });

          const room = `conversation:${conversationId}`;
          io.to(room).emit("message:new", message);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Failed to send message";
          socket.emit("message:error", { message });
        }
      },
    );

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

