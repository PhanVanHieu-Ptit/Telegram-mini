const fastifyPlugin = require("fastify-plugin");
const cors = require("@fastify/cors");

async function corePlugin(fastify, opts) {
  await fastify.register(cors, {
    origin: "*",
  });

  fastify.get("/health", async () => {
    return { status: "ok" };
  });
}

module.exports = fastifyPlugin(corePlugin, {
  fastify: "5.x",
  name: "core-plugin",
});

