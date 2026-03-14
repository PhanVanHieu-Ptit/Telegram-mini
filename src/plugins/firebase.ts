import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { firebaseAdmin } from "../core/firebase";

const firebasePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("firebase", firebaseAdmin);
};

export default fp(firebasePlugin, {
  name: "firebase",
});

declare module "fastify" {
  interface FastifyInstance {
    firebase: typeof firebaseAdmin;
  }
}
