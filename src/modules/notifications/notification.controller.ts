import { FastifyReply, FastifyRequest } from "fastify";
import { NotificationService } from "./notification.service";
import { TokenService } from "./token.service";
import { RegisterTokenPayload, SendNotificationPayload } from "./notification.types";

export class NotificationController {
  constructor(
    private notificationService: NotificationService,
    private tokenService: TokenService
  ) { }

  async registerToken(
    request: FastifyRequest<{ Body: RegisterTokenPayload }>,
    reply: FastifyReply
  ) {
    const { token, deviceType, platform } = request.body;
    const userId = (request as any).user?.userId || (request as any).user?.id;

    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    await this.tokenService.registerToken(userId, token, deviceType || platform);
    return reply.status(200).send({ message: "Token registered successfully" });
  }

  async removeToken(
    request: FastifyRequest<{ Body: { token: string } }>,
    reply: FastifyReply
  ) {
    const { token } = request.body;
    const userId = (request as any).user?.userId || (request as any).user?.id;

    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    await this.tokenService.removeToken(userId, token);
    return reply.status(200).send({ message: "Token removed successfully" });
  }

  async getUserTokens(
    request: FastifyRequest<{ Params: { userId: string } }>,
    reply: FastifyReply
  ) {
    const { userId } = request.params;
    const tokens = await this.tokenService.getTokensByUserId(userId);
    return reply.status(200).send({ tokens });
  }

  async sendNotification(
    request: FastifyRequest<{ Body: SendNotificationPayload }>,
    reply: FastifyReply
  ) {
    const result = await this.notificationService.sendToUser(request.body);
    return reply.status(200).send(result);
  }
}
