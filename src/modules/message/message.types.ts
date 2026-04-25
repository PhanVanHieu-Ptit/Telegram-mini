export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
  type?: string;
  attachments?: any[];
  metadata?: any;
  mentions?: string[];
  replyTo?: string;
  forwardedFrom?: string;
}

export type CreateMessageInput = SendMessageInput;

export interface MessageEntity {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  attachments?: any[];
  metadata?: any;
  mentions?: string[];
  hiddenBy?: string[];
  isPinned?: boolean;
  reactions?: Record<string, string[]>;
  seenBy: string[];
  createdAt: Date;
  updatedAt?: Date;

  // New fields
  replyTo?: string; // messageId
  forwardedFrom?: string; // original messageId or senderId? Let's use original messageId for now
  isDeleted?: boolean;
  deletedBy?: string;
  deletedAt?: Date;
  deletedForUsers?: string[];
  editedAt?: Date;
  editHistory?: { content: string; editedAt: Date }[];
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  attachments?: any[];
  metadata?: any;
  mentions?: string[];
  hiddenBy?: string[];
  isPinned?: boolean;
  reactions?: Record<string, string[]>;
  seenBy: string[];
  createdAt: string;
  updatedAt?: string;

  // New fields
  replyTo?: string;
  forwardedFrom?: string;
  isDeleted?: boolean;
  deletedBy?: string;
  deletedAt?: string;
  deletedForUsers?: string[];
  editedAt?: string;
  editHistory?: { content: string; editedAt: string }[];
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
  chatName: string;
  updatedAt: string;
}

export interface CreateConversationInput {
  userIds: string[];
  type?: "private" | "group";
  name?: string;
  avatar?: string;
  createdBy?: string;
}

