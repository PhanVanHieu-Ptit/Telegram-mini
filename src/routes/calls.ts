import type { FastifyPluginAsync } from "fastify";
import { callController } from "../modules/call/call.controller";

const StartCallBody = {
  type: 'object',
  required: ['receiverId', 'callType'],
  properties: {
    receiverId: { type: 'string' },
    callType: { type: 'string', enum: ['audio', 'video'] },
  },
};

const EndCallBody = {
  type: 'object',
  required: ['callId'],
  properties: {
    callId: { type: 'string' },
    reason: { type: 'string', nullable: true },
  },
};

const CallResponse = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    callerId: { type: 'string' },
    receiverId: { type: 'string' },
    status: { type: 'string' },
    callType: { type: 'string' },
    startTime: { type: 'string', format: 'date-time', nullable: true },
    endTime: { type: 'string', format: 'date-time', nullable: true },
    duration: { type: 'number' },
    roomName: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const ErrorResponse = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
};

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/calls/start',
    {
      schema: {
        summary: 'Start a call',
        tags: ['calls'],
        security: [{ bearerAuth: [] }],
        body: StartCallBody,
        response: {
          201: CallResponse,
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: (fastify as any).authenticate,
    },
    async (request, reply) => {
      await callController.startCall(request as any, reply);
    }
  );

  fastify.post(
    '/calls/end',
    {
      schema: {
        summary: 'End a call',
        tags: ['calls'],
        security: [{ bearerAuth: [] }],
        body: EndCallBody,
        response: {
          200: CallResponse,
          404: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: (fastify as any).authenticate,
    },
    async (request, reply) => {
      await callController.endCall(request as any, reply);
    }
  );

  fastify.get(
    '/calls/:id',
    {
      schema: {
        summary: 'Get call details by ID',
        tags: ['calls'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: CallResponse,
          404: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: (fastify as any).authenticate,
    },
    async (request, reply) => {
      await callController.getCall(request as any, reply);
    }
  );

  fastify.get(
    '/calls/history',
    {
      schema: {
        summary: 'Get call history for current user',
        tags: ['calls'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'array',
            items: CallResponse,
          },
          401: ErrorResponse,
          500: ErrorResponse,
        },
      },
      preHandler: (fastify as any).authenticate,
    },
    async (request, reply) => {
      await callController.getHistory(request as any, reply);
    }
  );
};

export default routes;
