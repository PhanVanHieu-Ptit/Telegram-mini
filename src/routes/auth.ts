import type { FastifyPluginAsync } from "fastify";

import { authController, LoginBody, RegisterBody } from "../modules/auth/auth.controller";

const routes: FastifyPluginAsync = async (fastify) => {
    fastify.post<{ Body: RegisterBody }>("/register", (request, reply) =>
        authController.register(request, reply),
    );

    fastify.post<{ Body: LoginBody }>("/login", (request, reply) =>
        authController.login(request, reply),
    );
};

export default routes;