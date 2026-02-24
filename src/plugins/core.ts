import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import cors from "@fastify/cors";

const corePlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(cors, {
    origin: "*",
  });

  fastify.get("/health", async () => {
    return { status: "ok" as const };
  });
};

export default fp(corePlugin, {
  fastify: "5.x",
  name: "core-plugin",
});

