
import type { FastifyPluginAsync } from 'fastify';
import { summarizeV2Controller } from '../../../modules/summarize-v2/summarize-v2.controller';

const summarizeV2Routes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/api/v2/summarize',
    {
      schema: {
        summary: 'Summarize chat messages using Hugging Face AI (v2)',
        tags: ['summarize'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['messages'],
          properties: {
            messages: { type: 'string' },
            senderFilter: { type: 'string', nullable: true },
            startTime: { type: 'string', nullable: true },
            endTime: { type: 'string', nullable: true },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              summary: { type: 'array', items: { type: 'string' } },
              message: { type: 'string', nullable: true },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              summary: { type: 'array', items: { type: 'string' } },
              message: { type: 'string' },
            },
          },
          500: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              summary: { type: 'array', items: { type: 'string' } },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      await summarizeV2Controller.handleSummarize(request, reply);
    }
  );
};

export default summarizeV2Routes;
