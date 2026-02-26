import type {
  IConversationRepository,
  IMessageRepository,
} from "./message.repositories";
import type { SendMessageInput, MessageDTO, CreateConversationInput } from "./message.types";
import type { MqttService } from "../mqtt/mqtt.service";
import { ValidationError, UnauthorizedError } from "../../core/errors/AppError";
import { MqttTopics } from "../mqtt/mqtt.topics";

export class MessageService {
  constructor(
    private readonly messageRepository: IMessageRepository,
    private readonly conversationRepository: IConversationRepository,
    private readonly mqttService: MqttService,
  ) { }

  async sendMessage(input: SendMessageInput): Promise<MessageDTO> {
    this.validateInput(input);

    const isMember = await this.conversationRepository.isMember(
      input.conversationId,
      input.senderId,
    );

    if (!isMember) {
      throw new UnauthorizedError("User is not a member of this conversation");
    }

    const message = await this.messageRepository.create({
      conversationId: input.conversationId,
      senderId: input.senderId,
      content: input.content,
    });

    await this.conversationRepository.updateUpdatedAt(input.conversationId);

    // Publish MQTT event
    await this.mqttService.publish(
      MqttTopics.chat.message(input.conversationId),
      {
        ...message,
        timestamp: new Date().toISOString(),
      },
    );

    return message;
  }

  private validateInput(input: SendMessageInput): void {
    const trimmed = input.content?.trim();

    if (!input.conversationId?.trim()) {
      throw new ValidationError("conversationId is required");
    }

    if (!input.senderId?.trim()) {
      throw new ValidationError("senderId is required");
    }

    if (trimmed === undefined || trimmed === "") {
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

    return this.messageRepository.findByConversationId(conversationId);
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

    // Get the last message to include messageId in seen event
    const messages = await this.messageRepository.findByConversationId(conversationId);
    const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : null;

    // Publish seen event
    if (lastMessage && lastMessage.id) {
      await this.mqttService.publish(
        MqttTopics.chat.seen(conversationId),
        {
          userId,
          conversationId,
          messageId: lastMessage.id,
          timestamp: new Date().toISOString(),
        },
      );
    }
  }
}
