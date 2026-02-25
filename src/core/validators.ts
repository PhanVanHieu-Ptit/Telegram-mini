import { z } from 'zod';

// Login validator
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Send message validator
export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  content: z.string().min(1),
});

// Create conversation validator
export const createConversationSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
  type: z.enum(['private', 'group']).optional().nullable(),
  name: z.string().optional().nullable(),
  avatar: z.string().optional().nullable(),
  createdBy: z.string().uuid().optional().nullable(),
});

// Type exports for TypeScript
export type LoginInput = z.infer<typeof loginSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;