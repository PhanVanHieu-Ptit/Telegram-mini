import { FastifyRequest, FastifyReply } from 'fastify';
import { CallService } from './call.service';
import { MongoCallRepository } from './mongo-call.repository';
import { StartCallInput, EndCallInput } from './call.types';

const callRepository = new MongoCallRepository();
const callService = new CallService(callRepository);

export const callController = {
  async startCall(request: FastifyRequest<{ Body: Omit<StartCallInput, 'callerId'> }>, reply: FastifyReply) {
    const user = (request as any).user as { id: string, sub: string, userId: string } | undefined;
    const userId = user?.id || user?.sub || user?.userId;

    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized: Missing user ID' });
    }

    try {
      const callDto = await callService.startCall({
        callerId: userId,
        receiverId: request.body.receiverId,
        callType: request.body.callType,
      });
      
      const io = (request.server as any).io;
      if (io) {
         io.to(`user:${request.body.receiverId}`).emit('call:incoming', callDto);
      }

      return reply.status(201).send(callDto);
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to start call');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async endCall(request: FastifyRequest<{ Body: EndCallInput }>, reply: FastifyReply) {
    try {
      const callDto = await callService.endCall({
        callId: request.body.callId,
        reason: request.body.reason,
      });

      const io = (request.server as any).io;
      if (io) {
        io.to(callDto.roomName).emit('call:ended', { reason: request.body.reason });
        io.in(callDto.roomName).socketsLeave(callDto.roomName);
      }

      return reply.send(callDto);
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to end call');
      if (error.message.includes('not found')) {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async getCall(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const call = await callService.getCallById(request.params.id);
      if (!call) {
        return reply.status(404).send({ error: 'Call not found' });
      }
      return reply.send(call);
    } catch (error: any) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async getHistory(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user as { id: string, sub: string, userId: string } | undefined;
    const userId = user?.id || user?.sub || user?.userId;

    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized: Missing user ID' });
    }

    try {
      const history = await callService.getCallHistory(userId);
      return reply.send(history);
    } catch (error: any) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }
};
