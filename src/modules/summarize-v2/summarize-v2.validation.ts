
import { z } from 'zod';

export const summarizeRequestSchema = z.object({
  messages: z.string().min(1, "messages field is required"),
  senderFilter: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export type SummarizeRequestDto = z.infer<typeof summarizeRequestSchema>;
