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
  type: string;
  seenBy: string[];
  createdAt: Date;
  updatedAt?: Date;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  seenBy: string[];
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

export interface ConversationMember {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  email: string;
  role: string;
  isOnline?: boolean;
}

export interface ConversationListItemDTO {
  id: string;
  participantIds: string[];
  members: ConversationMember[];
  lastMessage?: MessageDTO;
  unreadCount: number;
  pinned: boolean;
  muted: boolean;
  updatedAt: string;
}

export interface CreateConversationInput {
  userIds: string[];
  type?: "private" | "group";
  name?: string;
  avatar?: string;
  createdBy?: string;
}

