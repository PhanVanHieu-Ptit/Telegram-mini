const path = require("node:path");
const http = require("node:http");

const fastify = require("fastify");
const autoLoad = require("fastify-autoload");

async function buildServer(options = {}) {
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

async function start() {
  const app = await buildServer();

  const server = http.createServer(app);

  require("./socket")(server, app);

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || "0.0.0.0";

  server.listen(port, host, () => {
    app.log.info(`Server listening on http://${host}:${port}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

module.exports = { buildServer };
