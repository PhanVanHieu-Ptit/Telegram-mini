import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  sendMessageSchema,
  createConversationSchema,
} from './validators';
import { summarizeRequestSchema } from '../modules/summarize-v2/summarize-v2.validation';

const uuid = '123e4567-e89b-12d3-a456-426614174000';

describe('loginSchema', () => {
  it('accepts valid email + password', () => {
    expect(() => loginSchema.parse({ email: 'a@b.com', password: 'secret' })).not.toThrow();
  });

  it('rejects invalid email', () => {
    expect(() => loginSchema.parse({ email: 'not-an-email', password: 'x' })).toThrow();
  });

  it('rejects missing password', () => {
    expect(() => loginSchema.parse({ email: 'a@b.com' })).toThrow();
  });

  it('rejects empty password', () => {
    expect(() => loginSchema.parse({ email: 'a@b.com', password: '' })).toThrow();
  });
});

describe('sendMessageSchema', () => {
  it('accepts valid UUIDs and content', () => {
    expect(() =>
      sendMessageSchema.parse({ conversationId: uuid, senderId: uuid, content: 'hi' })
    ).not.toThrow();
  });

  it('rejects non-UUID conversationId', () => {
    expect(() =>
      sendMessageSchema.parse({ conversationId: 'not-uuid', senderId: uuid, content: 'hi' })
    ).toThrow();
  });

  it('rejects non-UUID senderId', () => {
    expect(() =>
      sendMessageSchema.parse({ conversationId: uuid, senderId: 'bad', content: 'hi' })
    ).toThrow();
  });

  it('rejects empty content', () => {
    expect(() =>
      sendMessageSchema.parse({ conversationId: uuid, senderId: uuid, content: '' })
    ).toThrow();
  });
});

describe('createConversationSchema', () => {
  it('accepts minimal valid input', () => {
    expect(() =>
      createConversationSchema.parse({ userIds: [uuid] })
    ).not.toThrow();
  });

  it('accepts group with name and avatar', () => {
    expect(() =>
      createConversationSchema.parse({ userIds: [uuid], type: 'group', name: 'Team', avatar: null, createdBy: uuid })
    ).not.toThrow();
  });

  it('rejects empty userIds array', () => {
    expect(() => createConversationSchema.parse({ userIds: [] })).toThrow();
  });

  it('rejects non-UUID in userIds', () => {
    expect(() => createConversationSchema.parse({ userIds: ['not-uuid'] })).toThrow();
  });

  it('rejects invalid type value', () => {
    expect(() =>
      createConversationSchema.parse({ userIds: [uuid], type: 'broadcast' })
    ).toThrow();
  });
});

describe('summarizeRequestSchema', () => {
  it('accepts conversationId alone', () => {
    expect(() => summarizeRequestSchema.parse({ conversationId: 'abc123' })).not.toThrow();
  });

  it('accepts non-empty messages alone', () => {
    expect(() => summarizeRequestSchema.parse({ messages: 'hello world' })).not.toThrow();
  });

  it('rejects when both conversationId and messages are absent', () => {
    expect(() => summarizeRequestSchema.parse({})).toThrow();
  });

  it('rejects when messages is empty string', () => {
    expect(() => summarizeRequestSchema.parse({ messages: '   ' })).toThrow();
  });

  it('accepts both conversationId and messages together', () => {
    expect(() =>
      summarizeRequestSchema.parse({ conversationId: 'id', messages: 'content' })
    ).not.toThrow();
  });
});
