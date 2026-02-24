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

