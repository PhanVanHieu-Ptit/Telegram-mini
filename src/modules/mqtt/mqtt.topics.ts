import { Message, TypingEvent, SeenEvent } from '../../types/chat.types';

// Topic structure:
// - chat/{conversationId}/message
// - chat/{conversationId}/typing
// - chat/{conversationId}/seen
// - user/{userId}/online

// ============================================================================
// Payload Types
// ============================================================================

export interface MessagePayload extends Message { }

export interface TypingPayload extends TypingEvent { }

export interface SeenPayload extends SeenEvent { }

export interface OnlineStatusPayload {
    userId: string;
    isOnline: boolean;
    lastSeen?: string; // ISO date string
    timestamp: string; // ISO date string
}

// ============================================================================
// Topic Builders
// ============================================================================

export const MqttTopics = {
    // Chat topics
    chat: {
        message: (conversationId: string) => `chat/${conversationId}/message`,
        typing: (conversationId: string) => `chat/${conversationId}/typing`,
        seen: (conversationId: string) => `chat/${conversationId}/seen`,
    },

    // User topics
    user: {
        online: (userId: string) => `user/${userId}/online`,
    },
} as const;

// ============================================================================
// Topic Patterns (for subscription wildcards)
// ============================================================================

export const MqttTopicPatterns = {
    // Subscribe to all events in a conversation
    allChatEvents: (conversationId: string) => `chat/${conversationId}/#`,

    // Subscribe to all messages in all conversations
    allMessages: () => `chat/+/message`,

    // Subscribe to all typing events
    allTyping: () => `chat/+/typing`,

    // Subscribe to all seen events
    allSeen: () => `chat/+/seen`,

    // Subscribe to all user online status
    allOnlineStatus: () => `user/+/online`,

    // Subscribe to specific user online status
    userOnline: (userId: string) => `user/${userId}/online`,
} as const;

// ============================================================================
// Topic Parser Utilities
// ============================================================================

export interface ParsedChatTopic {
    type: 'message' | 'typing' | 'seen';
    conversationId: string;
}

export interface ParsedUserTopic {
    type: 'online';
    userId: string;
}

export type ParsedTopic = ParsedChatTopic | ParsedUserTopic | null;

/**
 * Parse an MQTT topic string to extract structured information
 */
export function parseTopic(topic: string): ParsedTopic {
    const parts = topic.split('/');

    if (parts.length === 3 && parts[0] === 'chat') {
        const conversationId = parts[1];
        const eventType = parts[2];

        if (eventType === 'message' || eventType === 'typing' || eventType === 'seen') {
            return {
                type: eventType,
                conversationId,
            };
        }
    }

    if (parts.length === 3 && parts[0] === 'user' && parts[2] === 'online') {
        return {
            type: 'online',
            userId: parts[1],
        };
    }

    return null;
}

/**
 * Type guard to check if a payload is a MessagePayload
 */
export function isMessagePayload(payload: unknown): payload is MessagePayload {
    return (
        typeof payload === 'object' &&
        payload !== null &&
        'id' in payload &&
        'conversationId' in payload &&
        'senderId' in payload &&
        'content' in payload
    );
}

/**
 * Type guard to check if a payload is a TypingPayload
 */
export function isTypingPayload(payload: unknown): payload is TypingPayload {
    return (
        typeof payload === 'object' &&
        payload !== null &&
        'userId' in payload &&
        'conversationId' in payload &&
        'isTyping' in payload
    );
}

/**
 * Type guard to check if a payload is a SeenPayload
 */
export function isSeenPayload(payload: unknown): payload is SeenPayload {
    return (
        typeof payload === 'object' &&
        payload !== null &&
        'userId' in payload &&
        'conversationId' in payload &&
        'messageId' in payload
    );
}

/**
 * Type guard to check if a payload is an OnlineStatusPayload
 */
export function isOnlineStatusPayload(payload: unknown): payload is OnlineStatusPayload {
    return (
        typeof payload === 'object' &&
        payload !== null &&
        'userId' in payload &&
        'isOnline' in payload &&
        'timestamp' in payload
    );
}