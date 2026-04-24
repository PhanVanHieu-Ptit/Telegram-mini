
import type {
  ConversationDTO,
  ConversationListItemDTO,
  MessageDTO,
  MessageEntity,
} from "./message.types";

export interface IMessageRepository {
  create(
    data: Pick<MessageEntity, "conversationId" | "senderId" | "content"> & Partial<Pick<MessageEntity, "type" | "seenBy" | "attachments" | "metadata" | "reactions" | "mentions" | "hiddenBy" | "isPinned">>,
  ): Promise<MessageDTO>;

  findById(id: string): Promise<MessageDTO | null>;

  findByConversationId(conversationId: string): Promise<MessageDTO[]>;

  deleteById(id: string): Promise<void>;

  markMessagesSeen(conversationId: string, userId: string): Promise<void>;

  addReaction(messageId: string, emoji: string, userId: string): Promise<void>;

  deleteByConversationId(conversationId: string): Promise<void>;

  searchMessages(query: any): Promise<MessageDTO[]>;

  hideMessage(messageId: string, userId: string): Promise<void>;

  unhideMessage(messageId: string, userId: string): Promise<void>;

  pinMessage(messageId: string): Promise<void>;

  unpinMessage(messageId: string): Promise<void>;

  update(messageId: string, data: Partial<MessageEntity>): Promise<MessageDTO | null>;

  deleteForEveryone(messageId: string, userId: string): Promise<MessageDTO | null>;
}

export interface IConversationRepository {
  isMember(conversationId: string, userId: string): Promise<boolean>;

  updateUpdatedAt(conversationId: string): Promise<void>;

  updateLastMessage(conversationId: string, messageId: string): Promise<void>;

  updateLastReadMessage(
    conversationId: string,
    userId: string,
    messageId: string,
  ): Promise<void>;

  resetUnread(conversationId: string, userId: string): Promise<void>;

  createConversation(data: {
    userIds: string[];
    type?: "private" | "group";
    name?: string;
    avatar?: string;
    createdBy?: string;
  }): Promise<ConversationDTO>;

  getUserConversations(userId: string): Promise<ConversationListItemDTO[]>;

  joinConversation(
    conversationId: string,
    userId: string,
  ): Promise<void>;

  getMemberIds(conversationId: string): Promise<string[]>;

  deleteConversation(conversationId: string): Promise<void>;

  getMemberRole(conversationId: string, userId: string): Promise<string | null>;
}

