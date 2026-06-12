import type {
  IConversationRepository,
  IMessageRepository,
} from "./message.repositories";
import type { SendMessageInput, MessageDTO, CreateConversationInput } from "./message.types";
import type { MqttService } from "../mqtt/mqtt.service";
import { ValidationError, UnauthorizedError } from "../../core/errors/AppError";
import { MqttTopics } from "../mqtt/mqtt.topics";
import type { NotificationService } from "../notifications/notification.service";
import type { UserService } from "../user/user.service";
import { presenceService } from "../mqtt/presence.service";

export class MessageService {
  constructor(
    private readonly messageRepository: IMessageRepository,
    private readonly conversationRepository: IConversationRepository,
    private readonly mqttService: MqttService,
    private readonly notificationService: NotificationService,
    private readonly userService: UserService,
  ) { }

  async sendMessage(input: SendMessageInput): Promise<MessageDTO> {
    this.validateInput(input);

    // 1. Kiểm tra quyền (Cần thiết - Bắt buộc await)
    const isMember = await this.conversationRepository.isMember(
      input.conversationId,
      input.senderId,
    );
    if (!isMember) throw new UnauthorizedError("User is not a member...");

    // 2. Lưu DB (Cần thiết để trả về - Bắt buộc await)
    const message = await this.messageRepository.create({
      conversationId: input.conversationId,
      senderId: input.senderId,
      content: input.content,
      type: input.type,
      attachments: input.attachments,
      metadata: input.metadata,
      mentions: input.mentions,
      replyTo: input.replyTo,
      forwardedFrom: input.forwardedFrom,
    });

    // Cập nhật last_message_id và updated_at cho conversation
    await this.conversationRepository.updateLastMessage(input.conversationId, message.id);

    // 3. CÁC TÁC VỤ CHẠY NGẦM (KHÔNG DÙNG AWAIT)
    // Chúng ta bỏ 'await' để hàm trả về message ngay lập tức cho User

    // Xử lý MQTT ngầm
    this.publishMqtt(input.conversationId, message).catch(console.error);

    // Xử lý Push Notification ngầm
    this.sendPushNotifications(input, message).catch(console.error);

    // 4. Trả về ngay lập tức
    return message;
  }

  async editMessage(conversationId: string, messageId: string, userId: string, content: string): Promise<MessageDTO> {
    const message = await this.messageRepository.findById(messageId);
    if (!message) throw new ValidationError("Message not found");
    if (message.senderId !== userId) throw new UnauthorizedError("You can only edit your own messages");
    if (message.isDeleted) throw new ValidationError("Cannot edit a deleted message");

    // Optional time limit for editing (e.g., 15 minutes)
    const createdAt = new Date(message.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins > 1440) { // 24 hours
      throw new ValidationError("Editing time limit (24 hours) exceeded");
    }

    const editHistory = message.editHistory || [];
    editHistory.push({
      content: message.content,
      editedAt: new Date(message.editedAt ?? message.createdAt).toISOString(),
    });

    const updatedMessage = await this.messageRepository.update(messageId, {
      content,
      editedAt: new Date(),
      editHistory: editHistory as any,
    });

    if (!updatedMessage) throw new ValidationError("Failed to update message");

    // Notify via MQTT
    this.publishMqtt(conversationId, { ...updatedMessage, eventType: 'MESSAGE_EDITED' }).catch(console.error);

    return updatedMessage;
  }

  async deleteMessage(conversationId: string, messageId: string, userId: string, mode: 'self' | 'everyone'): Promise<void> {
    const message = await this.messageRepository.findById(messageId);
    if (!message) throw new ValidationError("Message not found");

    if (mode === 'everyone') {
      if (message.senderId !== userId) throw new UnauthorizedError("You can only delete your own messages for everyone");

      // Optional time limit for "delete for everyone" (e.g., 2 hours or same as edit)
      const createdAt = new Date(message.createdAt);
      const now = new Date();
      const diffMs = now.getTime() - createdAt.getTime();
      const diffHours = Math.floor(diffMs / 3600000);
      if (diffHours > 24) { // Let's say 24 hours for deletion
        throw new ValidationError("Deletion time limit (24 hours) exceeded");
      }

      const deletedMessage = await this.messageRepository.deleteForEveryone(messageId, userId);
      if (deletedMessage) {
        this.publishMqtt(conversationId, { ...deletedMessage, eventType: 'MESSAGE_DELETED' }).catch(console.error);
      }
    } else {
      // Delete for self
      await this.messageRepository.deleteForMe(messageId, userId);
    }
  }

  // Tách ra các hàm private để code sạch hơn
  private async publishMqtt(conversationId: string, message: any) {
    if (this.mqttService) {
      console.log(`[MessageService] Publishing MQTT to ${conversationId}: hasAttachments=${!!message.attachments?.length}`);
      await this.mqttService.publish(MqttTopics.chat.message(conversationId), {
        ...message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async sendPushNotifications(input: SendMessageInput, message: any) {
    const [sender, memberIds] = await Promise.all([
      this.userService.getUserById(input.senderId),
      this.conversationRepository.getMemberIds(input.conversationId),
    ]);

    if (!Array.isArray(memberIds)) return;

    const recipientIds = memberIds.filter((id) => {
      const senderIdStr = String(input.senderId).trim().toLowerCase();
      const currentIdStr = String(id).trim().toLowerCase();

      if (currentIdStr === senderIdStr) return false;

      // Don't send push notification if user is currently viewing this conversation
      const activeConvId = presenceService.getActiveConversation(id);
      if (activeConvId && String(activeConvId).toLowerCase() === String(input.conversationId).toLowerCase()) {
        return false;
      }

      return true;
    });

    if (recipientIds.length > 0) {
      await this.notificationService.sendToMultipleUsers({
        userIds: recipientIds,
        excludeUserId: input.senderId, // Absolute fail-safe: never notify the sender
        title: sender?.displayName || "New Message",
        body: input.content,
        data: {
          conversationId: input.conversationId,
          senderId: input.senderId,
          type: message.type,
        },
      });
    }
  }

  private validateInput(input: SendMessageInput): void {
    const trimmed = input.content?.trim();
    const hasAttachments = Array.isArray(input.attachments) && input.attachments.length > 0;

    if (!input.conversationId?.trim()) {
      throw new ValidationError("conversationId is required");
    }

    if (!input.senderId?.trim()) {
      throw new ValidationError("senderId is required");
    }

    // Allow empty content when files are attached
    if (!hasAttachments && (trimmed === undefined || trimmed === "")) {
      throw new ValidationError("content is required");
    }
  }

  async createConversation(data: CreateConversationInput) {
    if (!data.userIds || data.userIds.length === 0) {
      throw new ValidationError("At least one user ID is required");
    }
    return this.conversationRepository.createConversation(data);
  }

  async getUserConversations(userId: string) {
    if (!userId?.trim()) {
      throw new ValidationError("userId is required");
    }
    return this.conversationRepository.getUserConversations(userId);
  }

  async joinConversation(conversationId: string, userId: string) {
    if (!conversationId?.trim()) {
      throw new ValidationError("conversationId is required");
    }
    if (!userId?.trim()) {
      throw new ValidationError("userId is required");
    }
    return this.conversationRepository.joinConversation(conversationId, userId);
  }

  async listMessages(conversationId: string, userId: string): Promise<MessageDTO[]> {
    if (!conversationId?.trim()) {
      throw new ValidationError("conversationId is required");
    }

    const isMember = await this.conversationRepository.isMember(conversationId, userId);
    if (!isMember) {
      throw new UnauthorizedError("User is not a member of this conversation");
    }

    return this.messageRepository.findByConversationId(conversationId, userId);
  }

  async typing(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
    if (!conversationId?.trim()) {
      throw new ValidationError("conversationId is required");
    }

    if (!userId?.trim()) {
      throw new ValidationError("userId is required");
    }

    // Validate member
    const isMember = await this.conversationRepository.isMember(conversationId, userId);
    if (!isMember) {
      throw new UnauthorizedError("User is not a member of this conversation");
    }

    // Publish typing event
    await this.mqttService.publish(
      MqttTopics.chat.typing(conversationId),
      {
        userId,
        conversationId,
        isTyping,
        timestamp: new Date().toISOString(),
      },
    );
  }

  async markAsSeen(conversationId: string, userId: string): Promise<void> {
    if (!conversationId?.trim()) {
      throw new ValidationError("conversationId is required");
    }

    if (!userId?.trim()) {
      throw new ValidationError("userId is required");
    }

    // Validate member
    const isMember = await this.conversationRepository.isMember(conversationId, userId);
    if (!isMember) {
      throw new UnauthorizedError("User is not a member of this conversation");
    }

    // Mark messages seen (Mongo)
    await this.messageRepository.markMessagesSeen(conversationId, userId);

    // Reset unread (SQL)
    await this.conversationRepository.resetUnread(conversationId, userId);

    // Get last message id without fetching all messages
    const lastMessageId = await this.messageRepository.getLastMessageId(conversationId);

    // Publish seen event
    if (lastMessageId) {
      await this.mqttService.publish(
        MqttTopics.chat.seen(conversationId),
        {
          userId,
          conversationId,
          messageId: lastMessageId,
          timestamp: new Date().toISOString(),
        },
      );
    }
  }

  async reactMessage(conversationId: string, userId: string, messageId: string, emoji: string): Promise<void> {
    if (!conversationId || !userId || !messageId || !emoji) throw new ValidationError("Missing params");
    const isMember = await this.conversationRepository.isMember(conversationId, userId);
    if (!isMember) throw new UnauthorizedError("User is not a member of this conversation");

    await this.messageRepository.addReaction(messageId, emoji, userId);

    // Publish reaction event
    const message = await this.messageRepository.findById(messageId);
    if (message && this.mqttService) {
      await this.mqttService.publish(
        MqttTopics.chat.message(conversationId),
        { ...message, eventType: 'REACTION_UPDATE' },
      ).catch(console.error);
    }
  }

  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    if (!conversationId?.trim()) {
      throw new ValidationError("conversationId is required");
    }

    if (!userId?.trim()) {
      throw new ValidationError("userId is required");
    }

    // 1. Check if member and has permission
    const role = await this.conversationRepository.getMemberRole(conversationId, userId);
    if (!role) {
      throw new UnauthorizedError("User is not a member of this conversation");
    }

    // For group chats, only owner or admin can delete. For private, either can.
    // Actually, usually in private chat "delete" means "clear for me" or "delete for both".
    // Let's assume delete for both if they have permission.
    const memberIds = await this.conversationRepository.getMemberIds(conversationId);

    // 2. Delete from Mongo (messages) first — if this fails, Postgres is still intact and operation is retryable
    await this.messageRepository.deleteByConversationId(conversationId);

    // 3. Delete from Postgres (cascades to members)
    await this.conversationRepository.deleteConversation(conversationId);

    // 4. Notify members in parallel
    if (this.mqttService) {
      await Promise.allSettled(
        memberIds.map((memberId) =>
          this.mqttService.publish(`user/${memberId}/events`, {
            type: 'CONVERSATION_DELETED',
            conversationId,
          }).catch((err: unknown) => console.error("Failed to publish mqtt event", err))
        )
      );
    }
  }

  async searchMessages(query: any): Promise<MessageDTO[]> {
    return this.messageRepository.searchMessages(query);
  }

  async hideMessage(conversationId: string, messageId: string, userId: string): Promise<void> {
    const isMember = await this.conversationRepository.isMember(conversationId, userId);
    if (!isMember) throw new UnauthorizedError("User is not a member of this conversation");

    const message = await this.messageRepository.findById(messageId);
    if (!message) throw new UnauthorizedError("Message not found");

    if (message.senderId === userId) {
      // Own message: Hide for everyone
      const memberIds = await this.conversationRepository.getMemberIds(conversationId);
      if (memberIds.length > 0) {
        await this.messageRepository.hideMessage(messageId, memberIds);
      }
    } else {
      // Others' message: Hide for self only
      await this.messageRepository.hideMessage(messageId, userId);
    }
  }

  async unhideMessage(conversationId: string, messageId: string, userId: string): Promise<void> {
    const isMember = await this.conversationRepository.isMember(conversationId, userId);
    if (!isMember) throw new UnauthorizedError("User is not a member of this conversation");
    await this.messageRepository.unhideMessage(messageId, userId);
  }

  async pinMessage(conversationId: string, messageId: string, userId: string): Promise<void> {
    const isMember = await this.conversationRepository.isMember(conversationId, userId);
    if (!isMember) throw new UnauthorizedError("User is not a member of this conversation");
    await this.messageRepository.pinMessage(messageId);

    // Notify via MQTT
    const message = await this.messageRepository.findById(messageId);
    if (message && this.mqttService) {
      await this.mqttService.publish(
        MqttTopics.chat.message(conversationId),
        { ...message, eventType: 'MESSAGE_PINNED' },
      ).catch(console.error);
    }
  }

  async unpinMessage(conversationId: string, messageId: string, userId: string): Promise<void> {
    const isMember = await this.conversationRepository.isMember(conversationId, userId);
    if (!isMember) throw new UnauthorizedError("User is not a member of this conversation");
    await this.messageRepository.unpinMessage(messageId);

    // Notify via MQTT
    const message = await this.messageRepository.findById(messageId);
    if (message && this.mqttService) {
      await this.mqttService.publish(
        MqttTopics.chat.message(conversationId),
        { ...message, eventType: 'MESSAGE_UNPINNED' },
      ).catch(console.error);
    }
  }

  async getOrCreateSavedMessages(userId: string) {
    try {
      if (!userId?.trim()) {
        throw new ValidationError("userId is required");
      }

      let conversation = await this.conversationRepository.findPrivateConversation([userId]);
      
      if (!conversation) {
        conversation = await this.conversationRepository.createConversation({
          userIds: [userId],
          type: "private",
          name: "Saved Messages",
          createdBy: userId,
        });
      }

      const fullDetails = await this.conversationRepository.getConversationListItem(conversation.id, userId);
      if (!fullDetails) {
        throw new Error(`Failed to fetch conversation details for id ${conversation.id} and user ${userId}`);
      }
      
      return fullDetails;
    } catch (error) {
      console.error("[MessageService] getOrCreateSavedMessages error:", error);
      throw error;
    }
  }

  async pinConversation(conversationId: string, userId: string): Promise<void> {
    if (!conversationId?.trim()) {
      throw new ValidationError("conversationId is required");
    }
    if (!userId?.trim()) {
      throw new ValidationError("userId is required");
    }
    const isMember = await this.conversationRepository.isMember(conversationId, userId);
    if (!isMember) {
      throw new UnauthorizedError("User is not a member of this conversation");
    }
    await this.conversationRepository.pinConversation(conversationId, userId);
  }

  async unpinConversation(conversationId: string, userId: string): Promise<void> {
    if (!conversationId?.trim()) {
      throw new ValidationError("conversationId is required");
    }
    if (!userId?.trim()) {
      throw new ValidationError("userId is required");
    }
    const isMember = await this.conversationRepository.isMember(conversationId, userId);
    if (!isMember) {
      throw new UnauthorizedError("User is not a member of this conversation");
    }
    await this.conversationRepository.unpinConversation(conversationId, userId);
  }

  async muteConversation(conversationId: string, userId: string): Promise<void> {
    if (!conversationId?.trim()) {
      throw new ValidationError("conversationId is required");
    }
    if (!userId?.trim()) {
      throw new ValidationError("userId is required");
    }
    const isMember = await this.conversationRepository.isMember(conversationId, userId);
    if (!isMember) {
      throw new UnauthorizedError("User is not a member of this conversation");
    }
    await this.conversationRepository.muteConversation(conversationId, userId);
  }

  async unmuteConversation(conversationId: string, userId: string): Promise<void> {
    if (!conversationId?.trim()) {
      throw new ValidationError("conversationId is required");
    }
    if (!userId?.trim()) {
      throw new ValidationError("userId is required");
    }
    const isMember = await this.conversationRepository.isMember(conversationId, userId);
    if (!isMember) {
      throw new UnauthorizedError("User is not a member of this conversation");
    }
    await this.conversationRepository.unmuteConversation(conversationId, userId);
  }

  async addMembers(conversationId: string, requesterId: string, userIds: string[]): Promise<void> {
    if (!conversationId?.trim() || !requesterId?.trim() || !userIds || userIds.length === 0) {
      throw new ValidationError("conversationId, requesterId, and userIds are required");
    }
    
    // Validate requester has permission
    const role = await this.conversationRepository.getMemberRole(conversationId, requesterId);
    if (!role) {
      throw new UnauthorizedError("User is not a member of this conversation");
    }
    
    // If it's a group chat, we might want to restrict to owner/admin, but currently we just allow any member to add?
    // Let's restrict to owner or admin.
    // However, if the role isn't 'owner' or 'admin', maybe we shouldn't allow it. Let's allow everyone to add for now if not explicitly set, or check type.
    // For now we will allow members to add or we restrict to owner/admin. Let's assume anyone can add or just owner/admin.
    // The prompt says "(đối với trưởng nhóm)" which means "for the group owner".
    if (role !== 'owner' && role !== 'admin') {
      throw new UnauthorizedError("Only owner or admins can add members");
    }

    await this.conversationRepository.addMembers(conversationId, userIds);

    // Notify via MQTT in parallel
    const allMembers = await this.conversationRepository.getMemberIds(conversationId);
    if (this.mqttService && Array.isArray(allMembers)) {
      await Promise.allSettled(
        allMembers.map((memberId) =>
          this.mqttService.publish(`user/${memberId}/events`, {
            type: 'CONVERSATION_UPDATED',
            conversationId,
            timestamp: new Date().toISOString(),
          }).catch((err: unknown) => console.error(err))
        )
      );
    }
  }

  async removeMember(conversationId: string, requesterId: string, targetUserId: string): Promise<void> {
    if (!conversationId?.trim() || !requesterId?.trim() || !targetUserId?.trim()) {
      throw new ValidationError("conversationId, requesterId, and targetUserId are required");
    }

    const requesterRole = await this.conversationRepository.getMemberRole(conversationId, requesterId);
    if (!requesterRole) {
      throw new UnauthorizedError("User is not a member of this conversation");
    }

    // A user can remove themselves (leave) OR an owner/admin can remove someone
    if (requesterId !== targetUserId) {
      if (requesterRole !== 'owner' && requesterRole !== 'admin') {
        throw new UnauthorizedError("Only owner or admins can remove other members");
      }

      // Check target's role — admin cannot remove another admin or owner; only owner can
      const targetRole = await this.conversationRepository.getMemberRole(conversationId, targetUserId);
      if (targetRole === 'owner') {
        throw new UnauthorizedError("Cannot remove the owner of the conversation");
      }
      if (targetRole === 'admin' && requesterRole !== 'owner') {
        throw new UnauthorizedError("Only the owner can remove an admin");
      }
    }

    await this.conversationRepository.removeMember(conversationId, targetUserId);

    // Notify via MQTT in parallel
    if (this.mqttService) {
      const remainingMembers = await this.conversationRepository.getMemberIds(conversationId);
      await Promise.allSettled([
        this.mqttService.publish(`user/${targetUserId}/events`, {
          type: 'CONVERSATION_DELETED',
          conversationId,
          timestamp: new Date().toISOString(),
        }).catch((err: unknown) => console.error(err)),
        ...(Array.isArray(remainingMembers)
          ? remainingMembers.map((memberId) =>
              this.mqttService.publish(`user/${memberId}/events`, {
                type: 'CONVERSATION_UPDATED',
                conversationId,
                timestamp: new Date().toISOString(),
              }).catch((err: unknown) => console.error(err))
            )
          : []),
      ]);
    }
  }
}
