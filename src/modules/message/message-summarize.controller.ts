import type { FastifyReply, FastifyRequest } from 'fastify';
import { messageSummarizeService } from './message-summarize.service';

export interface SummarizeBody {
  messages: string;
  senderFilter?: string;
  startTime?: string;
  endTime?: string;
}

export class MessageSummarizeController {
  async summarize(
    request: FastifyRequest<{ Body: SummarizeBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { messages, senderFilter, startTime, endTime } = request.body ?? {};

    if (!messages || typeof messages !== 'string' || !messages.trim()) {
      void reply.code(400).send({ error: 'messages field is required and must be a non-empty string' });
      return;
    }

    const result = await messageSummarizeService.summarize({
      messages,
      senderFilter,
      startTime,
      endTime,
    });

    if (!result.success) {
      void reply.code(500).send(result);
      return;
    }
 
    void reply.code(200).send(result);
  }

}

export const messageSummarizeController = new MessageSummarizeController();
