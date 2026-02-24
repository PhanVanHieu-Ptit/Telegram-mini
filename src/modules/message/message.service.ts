import type {
  IConversationRepository,
  IMessageRepository,
} from "./message.repositories";
import type { CreateMessageInput, MessageDTO } from "./message.types";
import { ValidationError, UnauthorizedError } from "../../core/errors/AppError";

export class MessageService {
  constructor(
    private readonly conversationRepository: IConversationRepository,
    private readonly messageRepository: IMessageRepository
  ) {}

  async createMessage(input: CreateMessageInput): Promise<MessageDTO> {
    this.validateInput(input);

    const isMember = await this.conversationRepository.isMember(
      input.conversationId,
      input.senderId
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

  private validateInput(input: CreateMessageInput): void {
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
}
