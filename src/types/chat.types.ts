export type ISODateString = string;

export type MessageStatus = "sent" | "delivered" | "seen";

export interface User {
    id: string;
    username: string;
    avatar?: string | null;
    createdAt: ISODateString;
    updatedAt?: ISODateString;
}

export interface Conversation {
    id: string;
    type: "private" | "group";
    name?: string | null;
    avatar?: string | null;
    memberIds: string[];
    createdBy?: string | null;
    createdAt: ISODateString;
    updatedAt?: ISODateString;
}

export interface Message {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    status: MessageStatus;
    seenBy: string[];
    createdAt: ISODateString;
    updatedAt?: ISODateString;
}

export interface TypingEvent {
    userId: string;
    conversationId: string;
    isTyping: boolean;
    timestamp: ISODateString;
}

export interface SeenEvent {
    userId: string;
    conversationId: string;
    messageId: string;
    timestamp: ISODateString;
}

/**
 * Event payload contracts for MQTT chat events
 */

/**
 * Event emitted when a new message is created
 */
export interface MessageCreatedEvent {
    message: Message;
    conversationId: string;
    senderId: string;
    timestamp: ISODateString;
}

/**
 * Event emitted when a user is typing in a conversation
 */
export interface TypingEvent {
    userId: string;
    conversationId: string;
    isTyping: boolean;
    timestamp: ISODateString;
}

/**
 * Event emitted when a user has seen a message
 */
export interface SeenEvent {
    userId: string;
    conversationId: string;
    messageId: string;
    timestamp: ISODateString;
}

/**
 * Event emitted when a user's online status changes
 */
export interface UserOnlineEvent {
    userId: string;
    isOnline: boolean;
    lastSeen?: ISODateString;
    timestamp: ISODateString;
}