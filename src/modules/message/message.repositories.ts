import type { MessageDTO } from "./message.types";

export interface IConversationRepository {
  isMember(conversationId: string, userId: string): Promise<boolean>;
  updateUpdatedAt(conversationId: string): Promise<void>;
}

export interface IMessageRepository {
  create(params: {
    conversationId: string;
    senderId: string;
    content: string;
  }): Promise<MessageDTO>;
}
