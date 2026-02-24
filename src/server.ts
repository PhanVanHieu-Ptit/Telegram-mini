import path from "node:path";
import http from "node:http";

import fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import autoLoad from "fastify-autoload";

import setupSocketIOServer from "./socket";

export async function buildServer(
  options: FastifyServerOptions = {},
): Promise<FastifyInstance> {
  const app = fastify({
    logger: true,
    ...options,
  });

  app.register(autoLoad, {
    dir: path.join(__dirname, "plugins"),
    dirNameRoutePrefix: false,
    options: { prefix: "/api" },
  });

  app.register(autoLoad, {
    dir: path.join(__dirname, "routes"),
    dirNameRoutePrefix: false,
  });

  return app;
}

async function start(): Promise<void> {
  const app = await buildServer();

  const server = http.createServer(app);

  setupSocketIOServer(server, app);

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST ?? "0.0.0.0";

  server.listen(port, host, () => {
    app.log.info(`Server listening on http://${host}:${port}`);
  });
}

if (require.main === module) {
  // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

