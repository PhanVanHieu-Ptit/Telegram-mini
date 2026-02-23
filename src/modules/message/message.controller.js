const { messageService } = require("./message.service");

class MessageController {
  constructor(service) {
    this.service = service;
  }

  async createMessage(request, reply) {
    const { from, to, text } = request.body || {};

    if (!from || !to || !text) {
      return reply.code(400).send({
        error: "from, to and text are required",
      });
    }

    const message = this.service.createMessage({ from, to, text });

    if (request.server.io) {
      request.server.io.emit("message:new", message);
    }

    return reply.code(201).send(message);
  }

  async listMessages(request, reply) {
    const { from, to } = request.query || {};
    const messages = this.service.listMessages({ from, to });
    return reply.send(messages);
  }
}

const messageController = new MessageController(messageService);

module.exports = {
  MessageController,
  messageController,
};

