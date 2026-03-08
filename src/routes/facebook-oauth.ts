import type { FastifyPluginAsync } from "fastify";
import { facebookAuthController } from "../modules/auth/facebook-auth.controller";

const routes: FastifyPluginAsync = async (fastify) => {
    // 1. User clicks "Login with Facebook"
    // Backend redirects user to Facebook OAuth authorization URL
    fastify.get(
        '/auth/facebook',
        {
            schema: {
                summary: 'Redirect to Facebook OAuth2 dialog',
                tags: ['auth'],
            },
        },
        (request, reply) => facebookAuthController.login(request, reply),
    );

    // 2. Facebook redirects back to backend with authorization code
    // Backend exchanges code for access_token, profile, and sets JWT in HttpOnly cookie
    fastify.get<{ Querystring: { code: string } }>(
        '/auth/facebook/callback',
        {
            schema: {
                summary: 'Handle Facebook OAuth2 callback',
                tags: ['auth'],
                querystring: {
                    type: 'object',
                    required: ['code'],
                    properties: {
                        code: { type: 'string' },
                        state: { type: 'string' },
                    },
                },
            },
        },
        (request, reply) => facebookAuthController.callback(request, reply),
    );

    // 3. User requests to delete their data via Facebook
    // Facebook calls this endpoint with a signed_request
    fastify.post<{ Body: { signed_request: string } }>(
        '/auth/facebook/data-deletion',
        {
            schema: {
                summary: 'Handle Facebook data deletion request',
                tags: ['auth'],
                body: {
                    type: 'object',
                    required: ['signed_request'],
                    properties: {
                        signed_request: { type: 'string' },
                    },
                },
            },
        },
        (request, reply) => facebookAuthController.dataDeletion(request, reply),
    );
};

export default routes;
