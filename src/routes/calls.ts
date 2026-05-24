import type { FastifyPluginAsync } from "fastify";
import { callController } from "../modules/call/call.controller";

// ── JSON Schema helpers ──────────────────────────────────────────────────────

const StartCallBody = {
  type: 'object',
  required: ['receiverId', 'callType'],
  properties: {
    receiverId: { type: 'string' },
    callType: { type: 'string', enum: ['audio', 'video'] },
  },
};

const AcceptCallBody = {
  type: 'object',
  required: ['callId'],
  properties: {
    callId: { type: 'string' },
  },
};

const RejectCallBody = {
  type: 'object',
  required: ['callId'],
  properties: {
    callId: { type: 'string' },
    reason: { type: 'string', nullable: true },
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
    id:         { type: 'string' },
    callerId:   { type: 'string' },
    receiverId: { type: 'string' },
    status:     { type: 'string' },
    callType:   { type: 'string' },
    startTime:  { type: 'string', format: 'date-time', nullable: true },
    endTime:    { type: 'string', format: 'date-time', nullable: true },
    duration:   { type: 'number' },
    roomName:   { type: 'string' },
    createdAt:  { type: 'string', format: 'date-time' },
    updatedAt:  { type: 'string', format: 'date-time', nullable: true },
  },
};

const ErrorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
};

// ── Routes ───────────────────────────────────────────────────────────────────

const routes: FastifyPluginAsync = async (fastify) => {
  // POST /calls/start ─── Initiate a call
  fastify.post('/calls/start', {
    schema: {
      summary: 'Start a call',
      tags: ['calls'],
      security: [{ bearerAuth: [] }],
      body: StartCallBody,
      response: { 201: CallResponse, 401: ErrorResponse, 500: ErrorResponse },
    },
    preHandler: (fastify as any).authenticate,
  }, async (request, reply) => callController.startCall(request as any, reply));

  // POST /calls/accept ─── Callee accepts the call
  fastify.post('/calls/accept', {
    schema: {
      summary: 'Accept an incoming call',
      tags: ['calls'],
      security: [{ bearerAuth: [] }],
      body: AcceptCallBody,
      response: { 200: CallResponse, 401: ErrorResponse, 404: ErrorResponse, 500: ErrorResponse },
    },
    preHandler: (fastify as any).authenticate,
  }, async (request, reply) => callController.acceptCall(request as any, reply));

  // POST /calls/reject ─── Callee rejects the call
  fastify.post('/calls/reject', {
    schema: {
      summary: 'Reject an incoming call',
      tags: ['calls'],
      security: [{ bearerAuth: [] }],
      body: RejectCallBody,
      response: { 200: CallResponse, 401: ErrorResponse, 404: ErrorResponse, 500: ErrorResponse },
    },
    preHandler: (fastify as any).authenticate,
  }, async (request, reply) => callController.rejectCall(request as any, reply));

  // POST /calls/end ─── End an active call
  fastify.post('/calls/end', {
    schema: {
      summary: 'End a call',
      tags: ['calls'],
      security: [{ bearerAuth: [] }],
      body: EndCallBody,
      response: { 200: CallResponse, 404: ErrorResponse, 500: ErrorResponse },
    },
    preHandler: (fastify as any).authenticate,
  }, async (request, reply) => callController.endCall(request as any, reply));

  // GET /calls/:id ─── Fetch a single call record
  fastify.get('/calls/:id', {
    schema: {
      summary: 'Get call details by ID',
      tags: ['calls'],
      security: [{ bearerAuth: [] }],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: CallResponse, 404: ErrorResponse, 500: ErrorResponse },
    },
    preHandler: (fastify as any).authenticate,
  }, async (request, reply) => callController.getCall(request as any, reply));

  // GET /calls/history ─── Call history for the authenticated user
  fastify.get('/calls/history', {
    schema: {
      summary: 'Get call history for current user',
      tags: ['calls'],
      security: [{ bearerAuth: [] }],
      response: { 200: { type: 'array', items: CallResponse }, 401: ErrorResponse, 500: ErrorResponse },
    },
    preHandler: (fastify as any).authenticate,
  }, async (request, reply) => callController.getHistory(request as any, reply));

  // GET /calls/get-ice-servers ─── Fetch TURN/STUN credentials from Metered
  fastify.get('/calls/get-ice-servers', {
    preHandler: (fastify as any).authenticate,
    schema: {
      summary: 'Get ICE server credentials (TURN/STUN)',
      tags: ['calls'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              urls: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
              username: { type: 'string', nullable: true },
              credential: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  }, async (request, reply) => callController.getIceServers(request as any, reply));
};

export default routes;
