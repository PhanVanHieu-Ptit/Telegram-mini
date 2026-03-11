export interface UserResponse {
  id: string;
  displayName: string;
  avatarUrl?: string;
  online: boolean;
  lastSeenAt?: string; // ISODateString
}

export interface UserDB {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  online: boolean;
  last_seen_at?: Date;
}
