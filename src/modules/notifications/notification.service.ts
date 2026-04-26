import { messaging } from "../../core/firebase";
import { TokenService } from "./token.service";
import { SendNotificationPayload, SendNotificationToMultipleUsersPayload } from "./notification.types";

export class NotificationService {
  constructor(private tokenService: TokenService) { }

  async getTokenCount(userId: string): Promise<number> {
    const tokens = await this.tokenService.getTokensByUserId(userId);
    return tokens.length;
  }

  async sendToUser(payload: SendNotificationPayload): Promise<{ success: number; failure: number }> {
    const { userId, title, body, data } = payload;
    const tokens = await this.tokenService.getTokensByUserId(userId);

    if (tokens.length === 0) {
      console.warn(`[NotificationService] sendToUser: no FCM tokens registered for userId=${userId}`);
      return { success: 0, failure: 0 };
    }

    if (!messaging) {
      console.warn(`[NotificationService] sendToUser: Firebase messaging is null — FCM not configured. userId=${userId}`);
      return { success: 0, failure: 0 };
    }

    return this.sendToTokens(tokens, title, body, data);
  }

  async sendToMultipleUsers(payload: SendNotificationToMultipleUsersPayload & { excludeUserId?: string }): Promise<{ success: number; failure: number }> {
    const { userIds, title, body, data, excludeUserId } = payload;

    if (userIds.length === 0 || !messaging) {
      return { success: 0, failure: 0 };
    }

    // 1. Get tokens to exclude (the sender's tokens)
    const excludedTokens = new Set<string>();
    if (excludeUserId) {
      try {
        const senderTokens = await this.tokenService.getTokensByUserId(excludeUserId);
        senderTokens.forEach(t => excludedTokens.add(t));
      } catch (err) {
        console.error("[NotificationService] Error fetching excluded tokens:", err);
      }
    }

    // 2. Get all tokens for all target users
    const allTokensPromises = userIds.map(userId => this.tokenService.getTokensByUserId(userId));
    const tokenArrays = await Promise.all(allTokensPromises);
    
    // 3. Flatten and filter out any excluded tokens
    const tokens = tokenArrays.flat().filter(t => !excludedTokens.has(t));

    if (tokens.length === 0) {
      return { success: 0, failure: 0 };
    }

    return this.sendToTokens(tokens, title, body, data);
  }

  private async sendToTokens(tokens: string[], title: string, body: string, data?: Record<string, string>): Promise<{ success: number; failure: number }> {
    if (!messaging) return { success: 0, failure: 0 };

    const message: any = {
      tokens,
      notification: {
        title,
        body,
      },
      data: data || {},
    };

    try {
      const response = await messaging.sendEachForMulticast(message);

      const invalidTokens: string[] = [];
      response.responses.forEach((res, index) => {
        if (!res.success) {
          const error = res.error;
          if (error?.code === 'messaging/invalid-registration-token' ||
            error?.code === 'messaging/registration-token-not-registered') {
            invalidTokens.push(tokens[index]);
          }
        }
      });

      // Cleanup invalid tokens
      if (invalidTokens.length > 0) {
        await Promise.all(invalidTokens.map(token => this.tokenService.removeInvalidToken(token)));
      }

      return {
        success: response.successCount,
        failure: response.failureCount,
      };
    } catch (error) {
      console.error("Error sending FCM notification:", error);
      throw error;
    }
  }
}