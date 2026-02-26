export interface PresenceParams {
    userId: string;
}

export interface PresenceResponse {
    userId: string;
    online: boolean;
    lastSeen: Date | null;
}
