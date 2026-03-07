import type { FastifyPluginAsync } from "fastify";
import { googleAuthController } from "../modules/auth/google-auth.controller";

const routes: FastifyPluginAsync = async (fastify) => {
    // 1. User clicks "Login with Google"
    // Backend redirects user to Google OAuth consent screen
    fastify.get(
        '/auth/google',
        {
            schema: {
                summary: 'Redirect to Google OAuth2 consent screen',
                tags: ['auth'],
            },
        },
        (request, reply) => googleAuthController.login(request, reply),
    );

    // 2. Google redirects back to backend with authorization code
    // Backend exchanges code for access_token, profil, and tokens
    fastify.get<{ Querystring: { code: string } }>(
        '/auth/google/callback',
        {
            schema: {
                summary: 'Handle Google OAuth2 callback',
                tags: ['auth'],
                querystring: {
                    type: 'object',
                    required: ['code'],
                    properties: {
                        code: { type: 'string' },
                        state: { type: 'string' },
                        scope: { type: 'string' },
                        authuser: { type: 'string' },
                        prompt: { type: 'string' },
                    },
                },
            },
        },
        (request, reply) => googleAuthController.callback(request, reply),
    );
};

export default routes;
