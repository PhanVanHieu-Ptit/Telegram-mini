
import type { FastifyReply, FastifyRequest } from 'fastify';
import { summarizeV2Service } from './summarize-v2.service';
import { summarizeRequestSchema } from './summarize-v2.validation';

export class SummarizeV2Controller {
  /**
   * POST /api/v2/summarize
   */
  async handleSummarize(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    console.log('DEBUG: SummarizeV2Controller.handleSummarize called - VERSION 3');
    try {
      // 1. Validate Input
      const validationResult = summarizeRequestSchema.safeParse(request.body);
      
      if (!validationResult.success) {
        const errorMessages = validationResult.error.issues.map(err => err.message).join(', ');
        void reply.status(400).send({
          success: false,
          summary: [],
          message: `Validation failed: ${errorMessages}`
        });
        return;
      }

      const { messages, senderFilter, startTime, endTime } = validationResult.data;

      // 2. Call Service
      const result = await summarizeV2Service.summarize({
        messages,
        senderFilter,
        startTime,
        endTime
      });

      // 3. Return Response
      if (!result.success) {
        void reply.status(500).send(result);
        return;
      }

      void reply.status(200).send(result);
    } catch (error: unknown) {
      request.log.error(error, 'SummarizeV2Controller Error');
      void reply.status(500).send({
        success: false,
        summary: [],
        message: 'An unexpected error occurred during summarization'
      });
    }
  }
}

export const summarizeV2Controller = new SummarizeV2Controller();
