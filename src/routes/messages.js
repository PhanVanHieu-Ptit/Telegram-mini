const { messageController } = require("../modules/message/message.controller");

async function routes(fastify, opts) {
  fastify.post("/messages", (request, reply) =>
    messageController.createMessage(request, reply),
  );

  fastify.get("/messages", (request, reply) =>
    messageController.listMessages(request, reply),
  );
}

module.exports = routes;

