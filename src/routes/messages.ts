import type { FastifyPluginAsync } from "fastify";

import { messageController } from "../modules/message/message.controller";

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/messages", (request, reply) =>
    messageController.createMessage(request, reply),
  );

  fastify.get("/messages", (request, reply) =>
    messageController.listMessages(request, reply),
  );
};

export default routes;

