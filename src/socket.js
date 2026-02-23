const { Server } = require("socket.io");
const { messageService } = require("./modules/message/message.service");

function setupSocketIOServer(httpServer, fastifyInstance) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  fastifyInstance.decorate("io", io);

  io.on("connection", (socket) => {
    fastifyInstance.log.info(`Socket connected: ${socket.id}`);

    socket.on("message:send", (payload) => {
      const { from, to, text } = payload || {};
      if (!from || !to || !text) {
        return;
      }

      const message = messageService.createMessage({ from, to, text });
      fastifyInstance.log.debug({ message }, "Message created via socket");
      io.emit("message:new", message);
    });

    socket.on("disconnect", (reason) => {
      fastifyInstance.log.info(
        { socketId: socket.id, reason },
        "Socket disconnected",
      );
    });
  });

  return io;
}

module.exports = setupSocketIOServer;

