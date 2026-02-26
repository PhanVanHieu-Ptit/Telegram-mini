import { MqttService } from "./mqtt.service";
import { MqttTopics, type OnlineStatusPayload } from "./mqtt.topics";

interface UserPresence {
    userId: string;
    connectedAt: string;
    lastSeen?: string;
}

export class PresenceService {
    private readonly connectedUsers = new Map<string, UserPresence>();

    constructor(private readonly mqttService: MqttService) { }

    /**
     * Track user as online when they connect
     */
    async trackUserOnline(userId: string): Promise<void> {
        const now = new Date().toISOString();

        this.connectedUsers.set(userId, {
            userId,
            connectedAt: now,
        });

        await this.publishOnlineStatus(userId, true, undefined, now);
    }

    /**
     * Track user as offline when they disconnect
     */
    async trackUserOffline(userId: string): Promise<void> {
        const now = new Date().toISOString();
        const userPresence = this.connectedUsers.get(userId);

        if (userPresence) {
            this.connectedUsers.delete(userId);
        }

        await this.publishOnlineStatus(userId, false, now, now);
    }

    /**
     * Check if a user is currently online
     */
    isUserOnline(userId: string): boolean {
        return this.connectedUsers.has(userId);
    }

    /**
     * Get all currently online users
     */
    getOnlineUsers(): string[] {
        return Array.from(this.connectedUsers.keys());
    }

    /**
     * Get user presence info if online
     */
    getUserPresence(userId: string): UserPresence | undefined {
        return this.connectedUsers.get(userId);
    }

    /**
     * Publish online/offline status via MQTT
     */
    private async publishOnlineStatus(
        userId: string,
        isOnline: boolean,
        lastSeen: string | undefined,
        timestamp: string,
    ): Promise<void> {
        const topic = MqttTopics.user.online(userId);
        const payload: OnlineStatusPayload = {
            userId,
            isOnline,
            lastSeen,
            timestamp,
        };

        try {
            await this.mqttService.publish(topic, payload);
        } catch (error) {
            console.error(`Failed to publish online status for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Clear all presence data (useful for cleanup)
     */
    clearAllPresence(): void {
        this.connectedUsers.clear();
    }
}