import { FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { CallService } from './call.service';
import { MongoCallRepository } from './mongo-call.repository';
import { StartCallInput, EndCallInput } from './call.types';
import { notifyUser } from './rtcNotifier';
import { NotificationService } from '../notifications/notification.service';
import { TokenService } from '../notifications/token.service';
import { authService } from '../auth/auth.service';

const callRepository = new MongoCallRepository();
const callService = new CallService(callRepository);
const notificationService = new NotificationService(new TokenService());

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

    request.log.info(
      { callerId: userId, receiverId: request.body.receiverId, tokenFields: Object.keys((request as any).user ?? {}) },
      'startCall invoked'
    );

    try {
      const callDto = await callService.startCall({
        callerId: userId,
        receiverId: request.body.receiverId,
        callType: request.body.callType,
      });

      // Look up caller info — isolated so a DB error cannot suppress notifications
      let callerName: string = (request as any).user?.email ?? userId;
      let callerAvatar: string | null = null;
      try {
        const callerUser = await authService.findUserById(userId);
        callerName = callerUser?.username ?? (request as any).user?.email ?? userId;
        callerAvatar = callerUser?.avatar ?? null;
      } catch (lookupErr: unknown) {
        request.log.warn({ err: lookupErr, userId }, 'Could not look up caller info for call notification');
      }

      const callPayload = {
        callId: callDto.id,
        callerId: userId,
        callerName,
        callerAvatar,
        roomId: callDto.roomName,
        callType: callDto.callType,
      };

      // 1. Notify via backend socket.io (users connected for messaging are already here)
      const io = (request.server as any).io;
      if (io) {
        io.to(`user:${request.body.receiverId}`).emit('incoming-call', callPayload);
        request.log.info({ receiverId: request.body.receiverId }, 'Backend socket incoming-call emitted');
      } else {
        request.log.warn('Backend socket.io not available');
      }

      // 2. Notify via RTC service (for receivers connected to RTC service)
      void notifyUser('incoming-call', request.body.receiverId, callPayload).then(() => {
        request.log.info({ receiverId: request.body.receiverId }, 'RTC incoming-call notified');
      });

      // FCM push notification for when callee is offline/background (non-blocking)
      notificationService.getTokenCount(request.body.receiverId).then((count) => {
        if (count === 0) {
          request.log.warn({ receiverId: request.body.receiverId }, 'No FCM tokens found for receiver — push notification will not be delivered');
        }
      }).catch(() => undefined);

      void notificationService.sendToUser({
        userId: request.body.receiverId,
        title: `Incoming ${callDto.callType} call`,
        body: `${callerName} is calling you`,
        data: {
          type: 'CALL_INCOMING',
          callId: callDto.id,
          callerId: userId,
          roomId: callDto.roomName,
          callType: callDto.callType,
        },
      }).then((result) => {
        request.log.info({ receiverId: request.body.receiverId, ...result }, 'FCM call notification result');
      }).catch((err: unknown) => {
        request.log.warn({ err }, 'Failed to send FCM call notification');
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

      const acceptPayload = { callId: callDto.id, status: 'accepted', roomId: callDto.roomName };

      // Notify caller via backend socket
      const io = (request.server as any).io;
      if (io) {
        io.to(`user:${callDto.callerId}`).emit('call-status-update', acceptPayload);
      }

      // Notify caller via RTC service
      void notifyUser('call-status-update', callDto.callerId, acceptPayload);

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

      const rejectPayload = { callId: callDto.id, reason: request.body.reason ?? 'declined' };

      // Notify caller via backend socket
      const io = (request.server as any).io;
      if (io) {
        io.to(`user:${callDto.callerId}`).emit('call-rejected', rejectPayload);
      }

      // Notify caller via RTC service
      void notifyUser('call-rejected', callDto.callerId, rejectPayload);

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
      const endPayload = { callId: callDto.id, endedBy: userId, duration: callDto.duration };

      // Notify via backend socket
      const io = (request.server as any).io;
      if (io) {
        io.to(`user:${remoteUserId}`).emit('call-ended', endPayload);
      }

      // Notify via RTC service
      void notifyUser('call-ended', remoteUserId, endPayload);

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
        `${host}/api/v1/turn/credentials`,
        { params: { apiKey } }
      );
      console.log('response: ', response)
      return reply.send(response.data);
    } catch (error: any) {
      _request.log.error({ err: error }, 'Failed to fetch ICE servers');
      return reply.send([{ urls: 'stun:stun.l.google.com:19302' }]);
    }
  },
};
