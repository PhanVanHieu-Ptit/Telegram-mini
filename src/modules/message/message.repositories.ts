import type {
  ConversationDTO,
  MessageDTO,
  MessageEntity,
} from "./message.types";

export interface IMessageRepository {
  create(
    data: Pick<MessageEntity, "conversationId" | "senderId" | "content">,
  ): Promise<MessageDTO>;

  findById(id: string): Promise<MessageDTO | null>;

  findByConversationId(conversationId: string): Promise<MessageDTO[]>;

  deleteById(id: string): Promise<void>;
}

export interface IConversationRepository {
  isMember(conversationId: string, userId: string): Promise<boolean>;

  updateUpdatedAt(conversationId: string): Promise<void>;

  createConversation(userIds: string[]): Promise<ConversationDTO>;

  getUserConversations(userId: string): Promise<ConversationDTO[]>;

  joinConversation(
    conversationId: string,
    userId: string,
  ): Promise<void>;
}

