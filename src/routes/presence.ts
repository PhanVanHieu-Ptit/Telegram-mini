import type { FastifyPluginAsync } from "fastify";
import { presenceController } from "../modules/mqtt/presence.controller";
import type { PresenceParams } from "../modules/mqtt/presence.types";

const PresenceResponse = {
    type: 'object',
    properties: {
        userId: { type: 'string' },
        online: { type: 'boolean' },
        lastSeen: {
            anyOf: [
                { type: 'string', format: 'date-time' },
                { type: 'null' }
            ]
        },
    },
};

const ErrorResponse = {
    type: 'object',
    properties: {
        error: { type: 'string' },
    },
};

const routes: FastifyPluginAsync = async (fastify) => {
    fastify.get<{ Params: PresenceParams }>(
        '/presence/:userId',
        {
            schema: {
                description: 'Get user presence status',
                tags: ['presence'],
                params: {
                    type: 'object',
                    required: ['userId'],
                    properties: {
                        userId: { type: 'string' },
                    },
                },
                response: {
                    200: PresenceResponse,
                    404: ErrorResponse,
                    500: ErrorResponse,
                },
            },
        },
        async (request, reply) => {
            await presenceController.getPresence(request, reply);
        }
    );
};

export default routes;
