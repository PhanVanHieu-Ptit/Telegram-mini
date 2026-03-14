import { FastifyInstance } from "fastify";
import notificationRoutes from "../modules/notifications/notification.routes";

export default async function (fastify: FastifyInstance) {
  await fastify.register(notificationRoutes);
}
