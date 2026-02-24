export interface CreateMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: Date;
}
