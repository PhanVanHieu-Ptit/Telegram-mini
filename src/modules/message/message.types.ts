export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
}

export type CreateMessageInput = SendMessageInput;

export interface MessageEntity {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ConversationDTO {
  id: string;
  type: 'private' | 'group';
  name?: string | null;
  avatar?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateConversationInput {
  userIds: string[];
  type?: "private" | "group";
  name?: string;
  avatar?: string;
  createdBy?: string;
}

