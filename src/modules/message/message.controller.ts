import type { FastifyReply, FastifyRequest } from "fastify";
import type { Server as SocketIOServer } from "socket.io";

import { MessageService } from "./message.service";
import type { IConversationRepository } from "./message.repositories";
import type { SendMessageInput, MessageDTO, CreateConversationInput } from "./message.types";
import { MqttService } from "../mqtt/mqtt.service";
import { uploadToCloudinary } from "../cloudinary/cloudinary.service";


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
  private readonly conversationRepository: IConversationRepository;

  constructor(service: MessageService, conversationRepository: IConversationRepository) {
    this.service = service;
    this.conversationRepository = conversationRepository;
  }

  async createMessage(
    request: FastifyRequestWithIO<CreateMessageBody>,
    reply: FastifyReply,
  ): Promise<void> {
    const { conversationId, content, type, attachments, metadata, replyTo, forwardedFrom } = request.body ?? {};
    const authenticatedUser = (request as any).user;
    const currentUserId = authenticatedUser?.userId;

    if (!currentUserId) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    if (!conversationId || (!content && (!attachments || attachments.length === 0))) {
      void reply.code(400).send({
        error: "conversationId is required, and either content or attachments must be provided",
      });
      return;
    }

    try {
      const message: MessageDTO = await this.service.sendMessage({ 
        conversationId, 
        senderId: currentUserId, 
        content,
        type,
        attachments,
        metadata,
        replyTo,
        forwardedFrom,
      });

      await reply.code(200).send(message);

      if (request.server.io) {
        const io = request.server.io;
        setImmediate(() => {
          io.to(`conversation:${message.conversationId}`).emit("message:new", message);
        });
        this.emitConversationUpdated(io, message).catch(console.error);
      }

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
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      const messages = await this.service.listMessages(conversationId, userId);
      void reply.send(messages);
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
      void reply.code(200).send(conversation);
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

  async typing(
    request: FastifyRequestWithIO<{ conversationId: string; userId: string; isTyping: boolean }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { conversationId, userId, isTyping } = request.body ?? {};

    if (!conversationId || !userId || typeof isTyping !== 'boolean') {
      void reply.code(400).send({ error: "conversationId, userId, and isTyping are required" });
      return;
    }

    try {
      await this.service.typing(conversationId, userId, isTyping);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async markAsSeen(
    request: FastifyRequestWithIO<{ conversationId: string; userId: string }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { conversationId, userId } = request.body ?? {};

    if (!conversationId || !userId) {
      void reply.code(400).send({ error: "conversationId and userId are required" });
      return;
    }

    try {
      await this.service.markAsSeen(conversationId, userId);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async deleteConversation(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id: conversationId } = request.params;
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      await this.service.deleteConversation(conversationId, userId);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async reactMessage(
    request: FastifyRequest<{ Params: { messageId: string }; Body: { emoji: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { messageId } = request.params;
    const { emoji } = request.body ?? {};
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) return void reply.code(401).send({ error: "Unauthorized" });
    if (!emoji || !messageId) return void reply.code(400).send({ error: "missing params" });

    try {
      // Find conversationId from messageId
      const msg = await this.service['messageRepository'].findById(messageId);
      if (!msg) return void reply.code(404).send({ error: "message not found" });

      await this.service.reactMessage(msg.conversationId, userId, messageId, emoji);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  private async emitConversationUpdated(io: SocketIOServer, message: MessageDTO): Promise<void> {
    const memberIds = await this.conversationRepository.getMemberIds(message.conversationId);
    for (const memberId of memberIds) {
      // Emit via socket for connected clients
      io.to(`user:${memberId}`).emit("conversation:updated", {
        conversationId: message.conversationId,
        lastMessage: message,
      });
      // Also emit via MQTT so clients only subscribed to MQTT get the creation events
      if (this.service['mqttService']) {
        const mqttService = this.service['mqttService'] as MqttService;
        await mqttService.publish(`user/${memberId}/events`, {
           type: 'CONVERSATION_UPDATED',
           conversationId: message.conversationId,
           lastMessage: message,
        }).catch(err => console.error("Failed to publish mqtt event", err));
      }
    }
  }

  async searchMessages(
    request: FastifyRequest<{ Querystring: any }>,
    reply: FastifyReply,
  ): Promise<void> {
    const authenticatedUser = (request as any).user;
    if (!authenticatedUser?.userId) return void reply.code(401).send({ error: "Unauthorized" });

    try {
      // Need to parse types and senderIds from query
      const { keyword, type, senderId, fromDate, toDate, cursor } = request.query as any;
      const types = type ? (Array.isArray(type) ? type : [type]) : [];
      const senderIds = senderId ? (Array.isArray(senderId) ? senderId : [senderId]) : [];

      const messages = await this.service.searchMessages({
        keyword,
        types,
        senderIds,
        fromDate,
        toDate,
        cursor,
      });
      void reply.code(200).send(messages);
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async hideMessage(
    request: FastifyRequest<{ Params: { messageId: string }; Body: { conversationId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { messageId } = request.params;
    const { conversationId } = request.body ?? {};
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) return void reply.code(401).send({ error: "Unauthorized" });
    if (!conversationId) return void reply.code(400).send({ error: "conversationId required" });

    try {
      await this.service.hideMessage(conversationId, messageId, userId);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async unhideMessage(
    request: FastifyRequest<{ Params: { messageId: string }; Body: { conversationId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { messageId } = request.params;
    const { conversationId } = request.body ?? {};
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) return void reply.code(401).send({ error: "Unauthorized" });
    if (!conversationId) return void reply.code(400).send({ error: "conversationId required" });

    try {
      await this.service.unhideMessage(conversationId, messageId, userId);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async pinMessage(
    request: FastifyRequest<{ Params: { messageId: string }; Body: { conversationId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { messageId } = request.params;
    const { conversationId } = request.body ?? {};
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) return void reply.code(401).send({ error: "Unauthorized" });
    if (!conversationId) return void reply.code(400).send({ error: "conversationId required" });

    try {
      await this.service.pinMessage(conversationId, messageId, userId);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async unpinMessage(
    request: FastifyRequest<{ Params: { messageId: string }; Body: { conversationId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { messageId } = request.params;
    const { conversationId } = request.body ?? {};
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) return void reply.code(401).send({ error: "Unauthorized" });
    if (!conversationId) return void reply.code(400).send({ error: "conversationId required" });

    try {
      await this.service.unpinMessage(conversationId, messageId, userId);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async editMessage(
    request: FastifyRequest<{ Params: { messageId: string }; Body: { content: string; conversationId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { messageId } = request.params;
    const { content, conversationId } = request.body ?? {};
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) return void reply.code(401).send({ error: "Unauthorized" });
    if (content === undefined || conversationId === undefined) return void reply.code(400).send({ error: "content and conversationId are required" });

    try {
      const message = await this.service.editMessage(conversationId, messageId, userId, content);
      void reply.code(200).send(message);

      if (request.server.io) {
        request.server.io.to(`conversation:${message.conversationId}`).emit("message:updated", message);
      }
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async deleteMessage(
    request: FastifyRequest<{ Params: { messageId: string }; Querystring: { conversationId: string, mode?: 'self' | 'everyone' } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { messageId } = request.params;
    const { conversationId, mode = 'self' } = request.query ?? {};
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) return void reply.code(401).send({ error: "Unauthorized" });
    if (!conversationId) return void reply.code(400).send({ error: "conversationId is required" });

    try {
      await this.service.deleteMessage(conversationId, messageId, userId, mode);
      void reply.code(200).send({ success: true });

      if (mode === 'everyone' && request.server.io) {
        request.server.io.to(`conversation:${conversationId}`).emit("message:deleted", { messageId, conversationId });
      }
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async getSavedMessages(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      const conversation = await this.service.getOrCreateSavedMessages(userId);
      void reply.code(200).send(conversation);
    } catch (err: any) {
      console.error("[MessageController] getSavedMessages error:", err);
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async pinConversation(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id: conversationId } = request.params;
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      await this.service.pinConversation(conversationId, userId);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async unpinConversation(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id: conversationId } = request.params;
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      await this.service.unpinConversation(conversationId, userId);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async muteConversation(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id: conversationId } = request.params;
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      await this.service.muteConversation(conversationId, userId);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async unmuteConversation(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id: conversationId } = request.params;
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      await this.service.unmuteConversation(conversationId, userId);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async addMembers(
    request: FastifyRequest<{ Params: { id: string }; Body: { userIds: string[] } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id: conversationId } = request.params;
    const { userIds } = request.body ?? {};
    const authenticatedUser = (request as any).user;
    const userId = authenticatedUser?.userId;

    if (!userId) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      await this.service.addMembers(conversationId, userId, userIds);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  async removeMember(
    request: FastifyRequest<{ Params: { id: string, userId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id: conversationId, userId: targetUserId } = request.params;
    const authenticatedUser = (request as any).user;
    const requesterId = authenticatedUser?.userId;

    if (!requesterId) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    try {
      await this.service.removeMember(conversationId, requesterId, targetUserId);
      void reply.code(200).send({ success: true });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }

  /**
   * POST /messages/send-with-media
   * Accepts multipart/form-data with files + JSON fields.
   * Uploads each file to Cloudinary, then saves the message.
   */
  async sendMessageWithMedia(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authenticatedUser = (request as any).user;
    const currentUserId = authenticatedUser?.userId;

    if (!currentUserId) {
      void reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    try {
      const parts = (request as any).parts();

      let conversationId = '';
      let content = '';
      let type = 'TEXT';
      let replyTo: string | undefined;
      let forwardedFrom: string | undefined;
      let mentions: string[] = [];
      const uploadedAttachments: any[] = [];

      for await (const part of parts) {
        if (part.type === 'file') {
          // Collect file buffer
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk as Buffer);
          }
          const buffer = Buffer.concat(chunks);
          const mimeType: string = part.mimetype || 'application/octet-stream';
          const originalName: string = part.filename || 'upload';
          const fileSize = buffer.length;

          const result = await uploadToCloudinary(
            buffer,
            mimeType,
            originalName,
            fileSize,
            `chat-media/${conversationId || 'general'}`,
          );
          uploadedAttachments.push(result);
        } else {
          // Form field
          const value = (part as any).value as string;
          switch (part.fieldname) {
            case 'conversationId': conversationId = value; break;
            case 'content': content = value; break;
            case 'type': type = value; break;
            case 'replyTo': replyTo = value || undefined; break;
            case 'forwardedFrom': forwardedFrom = value || undefined; break;
            case 'mentions':
              try { mentions = JSON.parse(value); } catch { /* ignore */ }
              break;
          }
        }
      }

      if (!conversationId) {
        void reply.code(400).send({ error: 'conversationId is required' });
        return;
      }

      if (!content && uploadedAttachments.length === 0) {
        void reply.code(400).send({ error: 'Either content or files are required' });
        return;
      }

      // Determine message type from first attachment if not explicitly set
      if (uploadedAttachments.length > 0 && type === 'TEXT') {
        const firstType = uploadedAttachments[0].type;
        if (firstType === 'image') type = 'IMAGE';
        else if (firstType === 'video') type = 'VIDEO';
        else if (firstType === 'audio') type = 'VOICE';
        else type = 'FILE';
      }

      console.log(`[MessageController] Saving message with ${uploadedAttachments.length} attachments`);
      const message: MessageDTO = await this.service.sendMessage({
        conversationId,
        senderId: currentUserId,
        content: content || uploadedAttachments.map(a => a.name).join(', '),
        type,
        attachments: uploadedAttachments,
        replyTo,
        forwardedFrom,
        mentions,
      });
      console.log(`[MessageController] Saved message ID: ${message.id}, attachments in DO: ${JSON.stringify(message.attachments)}`);

      await reply.code(200).send(message);

      if ((request as any).server?.io) {
        const io = (request as any).server.io as SocketIOServer;
        setImmediate(() => { io.to(`conversation:${message.conversationId}`).emit('message:new', message); });
        this.emitConversationUpdated(io, message).catch(console.error);
      }
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      void reply.code(statusCode).send({ error: (err as Error).message });
    }
  }
}
import { PostgresConversationRepository } from "./postgres-conversation.repository";
import { MongoMessageRepository, MessageModel } from "./mongo-message.repository";
import { TokenService } from "../notifications/token.service";
import { NotificationService } from "../notifications/notification.service";
import { userService } from "../user/user.service";

const messageRepository = new MongoMessageRepository(MessageModel);
const conversationRepository = new PostgresConversationRepository();
const mqttService = new MqttService();
const tokenService = new TokenService();
const notificationService = new NotificationService(tokenService);

export const messageController = new MessageController(
  new MessageService(
    messageRepository,
    conversationRepository,
    mqttService,
    notificationService,
    userService
  ),
  conversationRepository,
);

