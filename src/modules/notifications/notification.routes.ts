import { FastifyInstance } from "fastify";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { TokenService } from "./token.service";

export default async function notificationRoutes(fastify: FastifyInstance) {
  const tokenService = new TokenService();
  const notificationService = new NotificationService(tokenService);
  const controller = new NotificationController(notificationService, tokenService);

  // FCM Token management
  fastify.post("/notifications/token", {
    preHandler: [fastify.authenticate],
    handler: controller.registerToken.bind(controller)
  });

  fastify.delete("/notifications/token", {
    preHandler: [fastify.authenticate],
    handler: controller.removeToken.bind(controller)
  });

  fastify.get("/notifications/token/:userId", {
    preHandler: [fastify.authenticate],
    handler: controller.getUserTokens.bind(controller)
  });

  // Sending notifications
  fastify.post("/notifications/send", {
    preHandler: [fastify.authenticate],
    handler: controller.sendNotification.bind(controller)
  });
}
