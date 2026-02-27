import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import jwt from "jsonwebtoken";

declare module "fastify" {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
    fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
        const secret = process.env.JWT_SECRET || "your-secret-key";
        const authHeader = request.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            void reply.code(401).send({ error: "Unauthorized" });
            return;
        }

        const token = authHeader.substring(7);

        try {
            const decoded = jwt.verify(token, secret) as any;
            (request as any).user = decoded;
        } catch (err) {
            void reply.code(401).send({ error: "Unauthorized" });
            return;
        }
    });
};

export default fp(authPlugin, {
    name: "auth-plugin",
});
