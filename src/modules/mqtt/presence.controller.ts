import type { FastifyReply, FastifyRequest } from 'fastify';
import { PresenceService, presenceService } from './presence.service';
import type { PresenceParams, PresenceResponse } from './presence.types';

export class PresenceController {
    private readonly presenceService: PresenceService;

    constructor(presenceService: PresenceService) {
        this.presenceService = presenceService;
    }

    async getPresence(
        request: FastifyRequest<{ Params: PresenceParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const { userId } = request.params;

            const presence = this.presenceService.getPresence(userId);

            if (!presence) {
                void reply.code(404).send({
                    error: 'User not found',
                });
                return;
            }

            const response: PresenceResponse = {
                userId: presence.userId,
                online: presence.online,
                lastSeen: presence.lastSeen,
            };

            void reply.code(200).send(response);
        } catch (error) {
            void reply.code(500).send({ error: 'Internal server error' });
        }
    }
}

export const presenceController = new PresenceController(presenceService);
