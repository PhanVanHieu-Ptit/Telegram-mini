/**
 * Internal routes — called by trusted services (e.g. rtc-service / CallWebRTC)
 * using a shared API key. These endpoints must NEVER be exposed to the internet.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { CallService } from '../modules/call/call.service';
import { MongoCallRepository } from '../modules/call/mongo-call.repository';

const callRepository = new MongoCallRepository();
const callService = new CallService(callRepository);

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? 'internal-secret';

// ── Body schemas ─────────────────────────────────────────────────────────────

const CallEventBody = {
  type: 'object',
  required: ['event'],
  properties: {
    event:      { type: 'string', enum: ['start', 'accept', 'reject', 'end', 'miss'] },
    callId:     { type: 'string', nullable: true },
    userId:     { type: 'string', nullable: true },
    callerId:   { type: 'string', nullable: true },
    receiverId: { type: 'string', nullable: true },
    callType:   { type: 'string', enum: ['audio', 'video'], nullable: true },
    roomId:     { type: 'string', nullable: true },
    endedBy:    { type: 'string', nullable: true },
    duration:   { type: 'number', nullable: true },
  },
};

// ── Plugin ────────────────────────────────────────────────────────────────────

const routes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /internal/call-event
   *
   * Persists a call lifecycle event triggered from rtc-service socket handlers.
   *
   * event = 'start'  → create call record (only when no callId exists yet)
   * event = 'accept' → mark call as 'ongoing', record startTime
   * event = 'reject' → mark call as 'rejected'
   * event = 'end'    → mark call as 'ended', persist duration
   * event = 'miss'   → mark call as 'missed' (timeout, no answer)
   */
  fastify.post(
    '/internal/call-event',
    { schema: { body: CallEventBody } },
    async (
      request: FastifyRequest<{
        Body: {
          event: string;
          callId?: string;
          userId?: string;
          callerId?: string;
          receiverId?: string;
          callType?: 'audio' | 'video';
          roomId?: string;
          endedBy?: string;
          duration?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      // Auth check
      const key = request.headers['x-internal-api-key'];
      if (!key || key !== INTERNAL_API_KEY) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const { event, callId, userId, callerId, receiverId, callType, roomId } = request.body;

      try {
        switch (event) {
          case 'start': {
            // No-op if a callId already exists (REST flow already created the record)
            if (callId) {
              return reply.status(200).send({ skipped: true, reason: 'callId already exists' });
            }
            if (!callerId || !receiverId || !callType) {
              return reply.status(400).send({ error: 'callerId, receiverId and callType are required for start event' });
            }
            const created = await callService.startCall({ callerId, receiverId, callType });
            return reply.status(201).send(created);
          }

          case 'accept': {
            if (!callId || !userId) {
              return reply.status(400).send({ error: 'callId and userId are required for accept event' });
            }
            const accepted = await callService.acceptCall(callId, userId);
            return reply.status(200).send(accepted);
          }

          case 'reject': {
            if (!callId || !userId) {
              return reply.status(400).send({ error: 'callId and userId are required for reject event' });
            }
            const rejected = await callService.rejectCall(callId, userId);
            return reply.status(200).send(rejected);
          }

          case 'end': {
            if (!callId) {
              return reply.status(400).send({ error: 'callId is required for end event' });
            }
            const ended = await callService.endCall({ callId });
            return reply.status(200).send(ended);
          }

          case 'miss': {
            if (!callId) {
              return reply.status(400).send({ error: 'callId is required for miss event' });
            }
            const missed = await callService.missCall(callId);
            return reply.status(200).send(missed);
          }

          default:
            return reply.status(400).send({ error: `Unknown event: ${event}` });
        }
      } catch (err: any) {
        request.log.error({ err, event, callId }, 'internal/call-event failed');
        if (err.message?.includes('not found')) {
          return reply.status(404).send({ error: err.message });
        }
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    }
  );
};

export default routes;
