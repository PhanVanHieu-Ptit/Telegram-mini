/**
 * Represents the presence state of a user
 */
export interface PresenceState {
    userId: string;
    online: boolean;
    lastSeen: Date;
}

/**
 * Service for managing user presence state in-memory
 */
export class PresenceService {
    private static instance: PresenceService;
    private readonly presenceMap = new Map<string, PresenceState>();
    private heartbeatCheckerInterval: NodeJS.Timeout | null = null;
    private mqttService: any = null;

    /**
     * Private constructor to prevent direct instantiation
     */
    private constructor() { }

    /**
     * Get or create singleton instance
     */
    static getInstance(): PresenceService {
        if (!PresenceService.instance) {
            PresenceService.instance = new PresenceService();
        }
        return PresenceService.instance;
    }

    /**
     * Mark a user as online
     */
    markOnline(userId: string): void {
        this.presenceMap.set(userId, {
            userId,
            online: true,
            lastSeen: new Date(),
        });
    }

    /**
     * Mark a user as offline and update lastSeen timestamp
     */
    markOffline(userId: string): void {
        const existing = this.presenceMap.get(userId);
        this.presenceMap.set(userId, {
            userId,
            online: false,
            lastSeen: new Date(),
        });
    }

    /**
     * Check if a user is currently online
     */
    isOnline(userId: string): boolean {
        const presence = this.presenceMap.get(userId);
        return presence?.online ?? false;
    }

    /**
     * Get presence state for a user
     */
    getPresence(userId: string): PresenceState | undefined {
        return this.presenceMap.get(userId);
    }

    /**
     * Get all users with presence data
     */
    getAllPresence(): PresenceState[] {
        return Array.from(this.presenceMap.values());
    }

    /**
     * Get all currently online users
     */
    getOnlineUsers(): string[] {
        return Array.from(this.presenceMap.values())
            .filter(presence => presence.online)
            .map(presence => presence.userId);
    }

    /**
     * Clear all presence data
     */
    clearAll(): void {
        this.presenceMap.clear();
    }

    /**
     * Remove presence data for a specific user
     */
    removeUser(userId: string): void {
        this.presenceMap.delete(userId);
    }

    /**
     * Initialize heartbeat system
     * - Subscribes to presence/+/heartbeat topic
     * - Starts interval checker to mark users offline if heartbeat not received
     */
    async initializeHeartbeat(mqttService: any): Promise<void> {
        this.mqttService = mqttService;

        // Subscribe to heartbeat topic (presence/+/heartbeat)
        await this.mqttService.subscribe("presence/+/heartbeat");

        // Set up message listener for heartbeats
        this.mqttService.client.on("message", (topic: string, message: Buffer) => {
            this.handleHeartbeat(topic, message);
        });

        // Start interval checker every 30 seconds
        // If user's lastSeen > 30 seconds ago, mark them offline
        this.heartbeatCheckerInterval = setInterval(() => {
            this.checkInactiveUsers();
        }, 30_000); // 30 seconds
    }

    /**
     * Handle incoming heartbeat message
     * Extracts userId from topic presence/{userId}/heartbeat
     */
    private handleHeartbeat(topic: string, message: Buffer): void {
        try {
            // Parse topic: presence/{userId}/heartbeat
            const matches = topic.match(/^presence\/(.+)\/heartbeat$/);
            if (!matches || !matches[1]) {
                return;
            }

            const userId = matches[1];

            // Mark user as online and update lastSeen
            this.markOnline(userId);
        } catch (error) {
            console.error("Error handling heartbeat:", error);
        }
    }

    /**
     * Check for inactive users and mark them offline
     * Users with lastSeen > 30 seconds ago are marked offline
     */
    private checkInactiveUsers(): void {
        const now = new Date();
        const inactivityThreshold = 30_000; // 30 seconds in milliseconds

        this.presenceMap.forEach((presence, userId) => {
            const timeSinceLastSeen = now.getTime() - presence.lastSeen.getTime();

            if (timeSinceLastSeen > inactivityThreshold && presence.online) {
                this.markOffline(userId);
            }
        });
    }

    /**
     * Shutdown heartbeat system
     * Clears the interval checker
     */
    shutdown(): void {
        if (this.heartbeatCheckerInterval) {
            clearInterval(this.heartbeatCheckerInterval);
            this.heartbeatCheckerInterval = null;
        }
        this.mqttService = null;
    }
}

/**
 * Singleton instance of PresenceService
 */
export const presenceService = PresenceService.getInstance();