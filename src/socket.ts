import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { FastifyInstance } from "fastify";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { MessageService } from "./modules/message/message.service";
import type {
  SendMessageInput,
  MessageDTO,
} from "./modules/message/message.types";

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
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return next(new Error("JWT secret not configured"));
    }

    const auth = socket.handshake.auth as { token?: string } | undefined;
    const queryToken = socket.handshake.query
      ?.token as string | string[] | undefined;
    const headerAuth =
      socket.handshake.headers.authorization ||
      socket.handshake.headers.Authorization;

    let token =
      auth?.token ??
      (Array.isArray(queryToken) ? queryToken[0] : queryToken) ??
      (typeof headerAuth === "string" && headerAuth.startsWith("Bearer ")
        ? headerAuth.slice("Bearer ".length)
        : undefined);

    if (!token || !token.trim()) {
      return next(new Error("Unauthorized"));
    }

    try {
      const decoded = jwt.verify(token, secret) as JwtPayload | string;
      const rawUserId =
        typeof decoded === "string"
          ? decoded
          : (decoded.sub as string | undefined) ??
            (decoded.userId as string | undefined);

      const userId = rawUserId?.toString().trim();

      if (!userId) {
        return next(new Error("Unauthorized"));
      }

      socket.data.userId = userId;
      socket.join(`user:${userId}`);

      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  fastifyInstance.decorate("io", io);

  io.on("connection", (socket) => {
    fastifyInstance.log.info({ socketId: socket.id }, "Socket connected");

    socket.on("conversation:join", (conversationId: string) => {
      const userId = socket.data?.userId as string | undefined;

      if (!userId || !conversationId) {
        socket.emit("error", {
          message: "userId and conversationId are required",
        });
        return;
      }

      socket.join(`conversation:${conversationId}`);
      socket.emit("conversation:joined", { conversationId });
    });

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

    socket.on("typing:start", (conversationId: string) => {
      const userId = socket.data?.userId as string | undefined;

      if (!userId || !conversationId) {
        return;
      }

      const room = `conversation:${conversationId}`;
      socket.to(room).emit("typing:start", { userId, conversationId });
    });

    socket.on("typing:stop", (conversationId: string) => {
      const userId = socket.data?.userId as string | undefined;

      if (!userId || !conversationId) {
        return;
      }

      const room = `conversation:${conversationId}`;
      socket.to(room).emit("typing:stop", { userId, conversationId });
    });

    socket.on("message:seen", async (payload: { conversationId: string; messageId: string }) => {
      const userId = socket.data?.userId as string | undefined;
      const { conversationId, messageId } = payload ?? {};

      if (!userId || !conversationId || !messageId) {
        socket.emit("message:error", {
          message: "userId, conversationId and messageId are required",
        });
        return;
      }

      try {
        await conversationRepository.updateLastReadMessage(conversationId, userId, messageId);

        const room = `conversation:${conversationId}`;
        io.to(room).emit("message:seen_update", { userId, conversationId, messageId });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to update read status";
        socket.emit("message:error", { message });
      }
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

