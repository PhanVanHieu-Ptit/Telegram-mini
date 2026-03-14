export interface FCMToken {
  id: string;
  userId: string;
  token: string;
  deviceType?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SendNotificationPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface RegisterTokenPayload {
  token: string;
  deviceType?: string;
  platform?: string;
}
export interface SendNotificationToMultipleUsersPayload {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}
