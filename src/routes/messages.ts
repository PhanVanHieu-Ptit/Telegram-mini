import type { FastifyPluginAsync } from "fastify";

import { messageController } from "../modules/message/message.controller";

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/messages", async (request, reply) => {
    // Cast request to expected type
    await messageController.createMessage(request as any, reply);
  });

  fastify.get("/messages", async (request, reply) => {
    await messageController.listMessages(request as any, reply);
  });
};

export default routes;

