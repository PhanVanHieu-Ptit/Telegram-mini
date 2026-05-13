
import { z } from 'zod';

export const summarizeRequestSchema = z.object({
  conversationId: z.string().optional(),
  messages: z.string().optional(),
  senderFilter: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
}).refine(
  (data) => data.conversationId || (data.messages && data.messages.trim().length > 0),
  { message: 'Either conversationId or a non-empty messages string is required' }
);

export type SummarizeRequestDto = z.infer<typeof summarizeRequestSchema>;
