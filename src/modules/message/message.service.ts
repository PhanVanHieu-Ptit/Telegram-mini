import type {
  IConversationRepository,
  IMessageRepository,
} from "./message.repositories";
import type { SendMessageInput, MessageDTO, CreateConversationInput } from "./message.types";
import { ValidationError, UnauthorizedError } from "../../core/errors/AppError";

export class MessageService {
  constructor(
    private readonly messageRepository: IMessageRepository,
    private readonly conversationRepository: IConversationRepository,
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
}
