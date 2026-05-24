import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import "@fastify/cookie";

declare module "fastify" {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET environment variable is required');

    fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
        let token: string | undefined;

        // 1. Try to get token from Authorization header
        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        }

        // 2. If no header, try to get from cookie
        if (!token && request.cookies) {
            token = request.cookies.accessToken;
        }

        if (!token) {
            return reply.code(401).send({ error: "Unauthorized: No token provided" });
        }

        try {
            const decoded = jwt.verify(token, secret) as any;
            (request as any).user = decoded;
        } catch (err) {
            return reply.code(401).send({ error: "Unauthorized: Invalid token" });
        }
    });
};

export default fp(authPlugin, {
    name: "auth-plugin",
});
