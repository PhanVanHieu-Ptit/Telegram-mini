import { FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { CallService } from './call.service';
import { MongoCallRepository } from './mongo-call.repository';
import { StartCallInput, EndCallInput } from './call.types';
import { notifyUser } from './rtcNotifier';

const callRepository = new MongoCallRepository();
const callService = new CallService(callRepository);

// ---------------------------------------------------------------------------
// Helper: extract caller userId from the Fastify request
// ---------------------------------------------------------------------------
function extractUserId(request: FastifyRequest): string | undefined {
  const user = (request as any).user as { id?: string; sub?: string; userId?: string } | undefined;
  return user?.id ?? user?.sub ?? user?.userId;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const callController = {
  /**
   * POST /calls/start
   * Caller initiates a call → persists record, notifies callee via rtc-service.
   */
  async startCall(request: FastifyRequest<{ Body: Omit<StartCallInput, 'callerId'> }>, reply: FastifyReply) {
    const userId = extractUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized: Missing user ID' });

    try {
      const callDto = await callService.startCall({
        callerId: userId,
        receiverId: request.body.receiverId,
        callType: request.body.callType,
      });

      // Notify callee through rtc-service (non-blocking)
      void notifyUser('incoming-call', request.body.receiverId, {
        callId: callDto.id,
        callerId: userId,
        callerName: (request as any).user?.username ?? userId,
        roomId: callDto.roomName,
        callType: callDto.callType,
      });

      return reply.status(201).send(callDto);
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to start call');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  /**
   * POST /calls/accept
   * Callee accepts the call → updates status, notifies caller via rtc-service.
   */
  async acceptCall(request: FastifyRequest<{ Body: { callId: string } }>, reply: FastifyReply) {
    const userId = extractUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized: Missing user ID' });

    try {
      const callDto = await callService.acceptCall(request.body.callId, userId);

      // Notify caller that callee accepted (rtc-service handles the SDP exchange)
      void notifyUser('call-status-update', callDto.callerId, {
        callId: callDto.id,
        status: 'accepted',
        roomId: callDto.roomName,
      });

      return reply.status(200).send(callDto);
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to accept call');
      if (error.message?.includes('not found')) return reply.status(404).send({ error: error.message });
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  /**
   * POST /calls/reject
   * Callee rejects the call → updates status, notifies caller.
   */
  async rejectCall(
    request: FastifyRequest<{ Body: { callId: string; reason?: string } }>,
    reply: FastifyReply
  ) {
    const userId = extractUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized: Missing user ID' });

    try {
      const callDto = await callService.rejectCall(request.body.callId, userId, request.body.reason);

      void notifyUser('call-rejected', callDto.callerId, {
        callId: callDto.id,
        reason: request.body.reason ?? 'declined',
      });

      return reply.status(200).send(callDto);
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to reject call');
      if (error.message?.includes('not found')) return reply.status(404).send({ error: error.message });
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  /**
   * POST /calls/end
   * Either party ends the call → updates duration, notifies remote peer.
   */
  async endCall(request: FastifyRequest<{ Body: EndCallInput }>, reply: FastifyReply) {
    const userId = extractUserId(request);

    try {
      const callDto = await callService.endCall({
        callId: request.body.callId,
        reason: request.body.reason,
      });

      // Notify the OTHER party (whoever is not ending the call)
      const remoteUserId = callDto.callerId === userId ? callDto.receiverId : callDto.callerId;
      void notifyUser('call-ended', remoteUserId, {
        callId: callDto.id,
        endedBy: userId,
        duration: callDto.duration,
      });

      return reply.send(callDto);
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to end call');
      if (error.message?.includes('not found')) return reply.status(404).send({ error: error.message });
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async getCall(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const call = await callService.getCallById(request.params.id);
      if (!call) return reply.status(404).send({ error: 'Call not found' });
      return reply.send(call);
    } catch {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async getHistory(request: FastifyRequest, reply: FastifyReply) {
    const userId = extractUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Unauthorized: Missing user ID' });

    try {
      const history = await callService.getCallHistory(userId);
      return reply.send(history);
    } catch {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async getIceServers(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const host = process.env.METERED_APP_HOST;
      const apiKey = process.env.METERED_API_KEY;
      const response = await axios.get(
        `https://${host}/api/v1/turn/credentials`,
        { params: { apiKey } }
      );
      return reply.send(response.data);
    } catch (error: any) {
      _request.log.error({ err: error }, 'Failed to fetch ICE servers');
      return reply.send([{ urls: 'stun:stun.l.google.com:19302' }]);
    }
  },
};
