import dotenv from "dotenv";
dotenv.config();
import path from "node:path";
import http from "node:http";

import fastify, { FastifyInstance, FastifyServerOptions } from "fastify";
import autoLoad from "@fastify/autoload";

import { setupSocketIOServer } from "./socket";
import { connectMongo, pgPool } from "./core/db";
import { swaggerPlugin } from "./plugins/swagger";

export async function buildServer(
  options: FastifyServerOptions = {}
): Promise<FastifyInstance> {
  const app = fastify({
    logger: true,
    ...options,
  });

  // Register Swagger plugin before routes
  await app.register(swaggerPlugin);

  // Register plugins
  app.register(autoLoad, {
    dir: path.join(__dirname, "plugins"),
    dirNameRoutePrefix: false,
    options: { prefix: "/api" },
    ignorePattern: /swagger\.(js|ts)$/,
  });

  // Register routes
  app.register(autoLoad, {
    dir: path.join(__dirname, "routes"),
    dirNameRoutePrefix: false,
  });

  // DB connections
  app.decorate("mongo", null as any);
  app.decorate("pgPool", pgPool);
  app.addHook("onReady", async function () {
    try {
      const mongo = await connectMongo();
      (this as any).mongo = mongo;
    } catch (err) {
      this.log.error({ err }, "MongoDB connection failed");
      throw err;
    }
  });

  // Socket integration
  app.addHook("onListen", async function () {
    const server = this.server;
    setupSocketIOServer(server, this);
  });

  return app;
}

async function start(): Promise<void> {
  const app = await buildServer();

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
  app.log.info(`Server listening on http://${host}:${port}`);
}

if (require.main === module) {
  // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

