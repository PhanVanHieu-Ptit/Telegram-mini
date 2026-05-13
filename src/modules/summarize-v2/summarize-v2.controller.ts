
import type { FastifyReply, FastifyRequest } from 'fastify';
import { summarizeV2Service } from './summarize-v2.service';
import { summarizeRequestSchema } from './summarize-v2.validation';
import { MongoMessageRepository, MessageModel } from '../message/mongo-message.repository';
import { userService } from '../user/user.service';
import type { MessageDTO } from '../message/message.types';

const messageRepository = new MongoMessageRepository(MessageModel);

export class SummarizeV2Controller {
  /**
   * POST /api/v2/summarize
   */
  async handleSummarize(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    console.log('DEBUG: SummarizeV2Controller.handleSummarize called - VERSION 4');
    console.log('DEBUG: request.body:', JSON.stringify(request.body, null, 2));
    try {
      // 1. Validate Input
      const validationResult = summarizeRequestSchema.safeParse(request.body);
      
      if (!validationResult.success) {
        console.error('DEBUG: Validation failed:', JSON.stringify(validationResult.error.format(), null, 2));
        const errorMessages = validationResult.error.issues.map(err => err.message).join(', ');
        void reply.status(400).send({
          success: false,
          summary: '',
          resolved: [],
          pending: [],
          language: 'vi',
          message: `Validation failed: ${errorMessages}`
        });
        return;
      }

      const { conversationId, messages, senderFilter, startTime, endTime } = validationResult.data;
      const authenticatedUser = (request as any).user;
      const userId: string | undefined = authenticatedUser?.userId;

      // 2. Resolve messages string — from DB or raw input
      let resolvedMessages: string;

      if (conversationId) {
        // Fetch all messages from DB
        const dbMessages: MessageDTO[] = await messageRepository.findByConversationId(conversationId, userId);

        if (dbMessages.length === 0) {
          void reply.status(200).send({ success: true, summary: '', resolved: [], pending: [], language: 'vi', message: 'Không có tin nhắn nào trong cuộc trò chuyện.' });
          return;
        }

        // Apply filters server-side using MessageDTO fields directly
        const startDate = startTime ? new Date(startTime) : null;
        const endDate = endTime ? new Date(endTime) : null;

        const filtered = dbMessages.filter((msg) => {
          if (msg.isDeleted) return false;

          // 1. Only allow 'text' type messages (case-insensitive: 'text' or 'TEXT')
          if (msg.type?.toLowerCase() !== 'text') return false;

          // 2. Validate content (must not be empty, whitespace-only, or just emojis/stickers)
          // Note: emoji-only messages often have type='text' but we want to ignore them if possible
          // or at least filter out whitespace.
          const trimmedContent = msg.content?.trim() || '';
          if (trimmedContent.length === 0) return false;

          // Filter by senderId
          if (senderFilter && msg.senderId !== senderFilter) return false;

          // Filter by time range
          if (startDate || endDate) {
            const msgDate = new Date(msg.createdAt);
            if (startDate && msgDate < startDate) return false;
            if (endDate && msgDate > endDate) return false;
          }

          return true;
        });

        if (filtered.length === 0) {
          void reply.status(200).send({
            success: true,
            summary: "Không có nội dung văn bản phù hợp để tóm tắt",
            resolved: [],
            pending: [],
            language: "vi"
          });
          return;
        }

        // Resolve senderId → displayName for human-readable prompt
        const senderIds = [...new Set(filtered.map((msg) => msg.senderId))];
        const senderNameMap: Record<string, string> = {};
        await Promise.all(
          senderIds.map(async (id) => {
            const user = await userService.getUserById(id);
            senderNameMap[id] = user?.displayName || id;
          })
        );

        // Format: "[ISO timestamp] DisplayName: content"
        resolvedMessages = filtered
          .map((msg) => `[${msg.createdAt}] ${senderNameMap[msg.senderId] ?? msg.senderId}: ${msg.content}`)
          .join('\n');

        // Filters already applied above — pass raw text directly
        const result = await summarizeV2Service.summarize({
          messages: resolvedMessages,
        });

        if (!result.success) {
          void reply.status(500).send(result);
          return;
        }
        void reply.status(200).send(result);
        return;
      }

      // 3. Raw messages string path (from useSummary / messageSummaryService)
      resolvedMessages = messages!;

      const result = await summarizeV2Service.summarize({
        messages: resolvedMessages,
        senderFilter,
        startTime,
        endTime,
      });

      if (!result.success) {
        void reply.status(500).send(result);
        return;
      }

      void reply.status(200).send(result);
    } catch (error: unknown) {
      request.log.error(error, 'SummarizeV2Controller Error');
      void reply.status(500).send({
        success: false,
        summary: '',
        resolved: [],
        pending: [],
        language: 'vi',
        message: 'An unexpected error occurred during summarization'
      });
    }
  }
}

export const summarizeV2Controller = new SummarizeV2Controller();
