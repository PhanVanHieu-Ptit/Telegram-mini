import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageService } from './message.service';
import { ValidationError, UnauthorizedError } from '../../core/errors/AppError';
import type { IMessageRepository, IConversationRepository } from './message.repositories';
import type { MessageDTO } from './message.types';

function makeMessage(overrides: Partial<MessageDTO> = {}): MessageDTO {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'user-1',
    content: 'hello',
    type: 'text',
    isDeleted: false,
    createdAt: new Date('2024-01-01T10:00:00Z').toISOString(),
    editHistory: [],
    ...overrides,
  } as any;
}

function makeMessageRepo(overrides: Partial<IMessageRepository> = {}): IMessageRepository {
  return {
    create: vi.fn().mockResolvedValue(makeMessage()),
    findById: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    deleteForEveryone: vi.fn(),
    deleteForMe: vi.fn(),
    findByConversationId: vi.fn().mockResolvedValue([]),
    markMessagesSeen: vi.fn().mockResolvedValue(undefined),
    getLastMessageId: vi.fn().mockResolvedValue(null),
    addReaction: vi.fn().mockResolvedValue(undefined),
    deleteByConversationId: vi.fn().mockResolvedValue(undefined),
    searchMessages: vi.fn().mockResolvedValue([]),
    hideMessage: vi.fn().mockResolvedValue(undefined),
    unhideMessage: vi.fn().mockResolvedValue(undefined),
    pinMessage: vi.fn().mockResolvedValue(undefined),
    unpinMessage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IMessageRepository;
}

function makeConvRepo(overrides: Partial<IConversationRepository> = {}): IConversationRepository {
  return {
    isMember: vi.fn().mockResolvedValue(true),
    updateLastMessage: vi.fn().mockResolvedValue(undefined),
    getMemberIds: vi.fn().mockResolvedValue([]),
    getMemberRole: vi.fn().mockResolvedValue('member'),
    getUserConversations: vi.fn().mockResolvedValue([]),
    createConversation: vi.fn(),
    joinConversation: vi.fn(),
    resetUnread: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    findPrivateConversation: vi.fn().mockResolvedValue(null),
    getConversationListItem: vi.fn(),
    pinConversation: vi.fn().mockResolvedValue(undefined),
    unpinConversation: vi.fn().mockResolvedValue(undefined),
    muteConversation: vi.fn().mockResolvedValue(undefined),
    unmuteConversation: vi.fn().mockResolvedValue(undefined),
    addMembers: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IConversationRepository;
}

function makeMqtt() {
  return { publish: vi.fn().mockResolvedValue(undefined) } as any;
}

function makeNotification() {
  return { sendToMultipleUsers: vi.fn().mockResolvedValue(undefined) } as any;
}

function makeUserService() {
  return { getUserById: vi.fn().mockResolvedValue({ displayName: 'Alice' }) } as any;
}

function makeService(
  msgRepo?: Partial<IMessageRepository>,
  convRepo?: Partial<IConversationRepository>
) {
  return new MessageService(
    makeMessageRepo(msgRepo),
    makeConvRepo(convRepo),
    makeMqtt(),
    makeNotification(),
    makeUserService(),
  );
}

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe('MessageService.sendMessage — input validation', () => {
  it('throws ValidationError for empty conversationId', async () => {
    const svc = makeService();
    await expect(
      svc.sendMessage({ conversationId: '', senderId: 'u1', content: 'hi', type: 'text' } as any)
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for empty senderId', async () => {
    const svc = makeService();
    await expect(
      svc.sendMessage({ conversationId: 'c1', senderId: '  ', content: 'hi', type: 'text' } as any)
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when content is empty and no attachments', async () => {
    const svc = makeService();
    await expect(
      svc.sendMessage({ conversationId: 'c1', senderId: 'u1', content: '', type: 'text' } as any)
    ).rejects.toThrow(ValidationError);
  });

  it('allows empty content when attachments are present', async () => {
    const svc = makeService();
    await expect(
      svc.sendMessage({
        conversationId: 'c1',
        senderId: 'u1',
        content: '',
        type: 'file',
        attachments: [{ url: 'http://cdn/file.pdf' }],
      } as any)
    ).resolves.toBeDefined();
  });
});

describe('MessageService.sendMessage — authorization', () => {
  it('throws UnauthorizedError when sender is not a member', async () => {
    const svc = makeService(
      {},
      { isMember: vi.fn().mockResolvedValue(false) }
    );
    await expect(
      svc.sendMessage({ conversationId: 'c1', senderId: 'u1', content: 'hi', type: 'text' } as any)
    ).rejects.toThrow(UnauthorizedError);
  });

  it('saves message and updates lastMessage for a valid member', async () => {
    const msgRepo = makeMessageRepo({
      create: vi.fn().mockResolvedValue(makeMessage()),
    });
    const convRepo = makeConvRepo({
      isMember: vi.fn().mockResolvedValue(true),
      updateLastMessage: vi.fn().mockResolvedValue(undefined),
    });
    const svc = new MessageService(msgRepo, convRepo, makeMqtt(), makeNotification(), makeUserService());

    const result = await svc.sendMessage({ conversationId: 'c1', senderId: 'u1', content: 'hi', type: 'text' } as any);

    expect(msgRepo.create).toHaveBeenCalled();
    expect(convRepo.updateLastMessage).toHaveBeenCalledWith('c1', 'msg-1');
    expect(result.id).toBe('msg-1');
  });
});

// ─── editMessage ──────────────────────────────────────────────────────────────

describe('MessageService.editMessage', () => {
  it('throws ValidationError when message not found', async () => {
    const svc = makeService({ findById: vi.fn().mockResolvedValue(null) });
    await expect(svc.editMessage('c1', 'msg-1', 'u1', 'new')).rejects.toThrow(ValidationError);
  });

  it('throws UnauthorizedError when editor is not the sender', async () => {
    const msg = makeMessage({ senderId: 'user-1' });
    const svc = makeService({ findById: vi.fn().mockResolvedValue(msg) });
    await expect(svc.editMessage('c1', 'msg-1', 'other-user', 'new')).rejects.toThrow(UnauthorizedError);
  });

  it('throws ValidationError when message is already deleted', async () => {
    const msg = makeMessage({ senderId: 'u1', isDeleted: true });
    const svc = makeService({ findById: vi.fn().mockResolvedValue(msg) });
    await expect(svc.editMessage('c1', 'msg-1', 'u1', 'new')).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when message is older than 24 hours', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
    const msg = makeMessage({ senderId: 'u1', createdAt: oldDate });
    const svc = makeService({ findById: vi.fn().mockResolvedValue(msg) });
    await expect(svc.editMessage('c1', 'msg-1', 'u1', 'new')).rejects.toThrow('Editing time limit');
  });

  it('appends old content to editHistory on successful edit', async () => {
    const recentDate = new Date().toISOString(); // fresh timestamp — within 24h edit window
    const msg = makeMessage({ senderId: 'u1', content: 'old content', editHistory: [], createdAt: recentDate });
    const updated = makeMessage({ content: 'new content', editHistory: [{ content: 'old content', editedAt: expect.any(String) }] });
    const msgRepo = makeMessageRepo({
      findById: vi.fn().mockResolvedValue(msg),
      update: vi.fn().mockResolvedValue(updated),
    });
    const svc = new MessageService(msgRepo, makeConvRepo(), makeMqtt(), makeNotification(), makeUserService());

    await svc.editMessage('c1', 'msg-1', 'u1', 'new content');

    const updateCall = (msgRepo.update as any).mock.calls[0][1];
    expect(updateCall.editHistory).toHaveLength(1);
    expect(updateCall.editHistory[0].content).toBe('old content');
    expect(updateCall.content).toBe('new content');
  });
});

// ─── deleteMessage ────────────────────────────────────────────────────────────

describe('MessageService.deleteMessage', () => {
  it('throws ValidationError when message not found', async () => {
    const svc = makeService({ findById: vi.fn().mockResolvedValue(null) });
    await expect(svc.deleteMessage('c1', 'msg-1', 'u1', 'everyone')).rejects.toThrow(ValidationError);
  });

  it('"everyone" mode: throws UnauthorizedError when deleter is not the sender', async () => {
    const msg = makeMessage({ senderId: 'user-1' });
    const svc = makeService({ findById: vi.fn().mockResolvedValue(msg) });
    await expect(svc.deleteMessage('c1', 'msg-1', 'other', 'everyone')).rejects.toThrow(UnauthorizedError);
  });

  it('"everyone" mode: throws when message is older than 24 hours', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const msg = makeMessage({ senderId: 'u1', createdAt: oldDate });
    const svc = makeService({ findById: vi.fn().mockResolvedValue(msg) });
    await expect(svc.deleteMessage('c1', 'msg-1', 'u1', 'everyone')).rejects.toThrow('Deletion time limit');
  });

  it('"self" mode: succeeds regardless of who the sender is', async () => {
    const msg = makeMessage({ senderId: 'another-user' });
    const msgRepo = makeMessageRepo({
      findById: vi.fn().mockResolvedValue(msg),
      deleteForMe: vi.fn().mockResolvedValue(undefined),
    });
    const svc = new MessageService(msgRepo, makeConvRepo(), makeMqtt(), makeNotification(), makeUserService());

    await expect(svc.deleteMessage('c1', 'msg-1', 'u1', 'self')).resolves.toBeUndefined();
    expect(msgRepo.deleteForMe).toHaveBeenCalledWith('msg-1', 'u1');
  });
});

// ─── addMembers ───────────────────────────────────────────────────────────────

describe('MessageService.addMembers', () => {
  it('throws ValidationError for empty params', async () => {
    const svc = makeService();
    await expect(svc.addMembers('', 'req', ['u1'])).rejects.toThrow(ValidationError);
    await expect(svc.addMembers('c1', '', ['u1'])).rejects.toThrow(ValidationError);
    await expect(svc.addMembers('c1', 'req', [])).rejects.toThrow(ValidationError);
  });

  it('throws UnauthorizedError when requester is not a member', async () => {
    const svc = makeService({}, { getMemberRole: vi.fn().mockResolvedValue(null) });
    await expect(svc.addMembers('c1', 'req', ['u1'])).rejects.toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when requester is a plain member (not owner/admin)', async () => {
    const svc = makeService({}, { getMemberRole: vi.fn().mockResolvedValue('member') });
    await expect(svc.addMembers('c1', 'req', ['u1'])).rejects.toThrow(UnauthorizedError);
  });

  it('allows owner to add members', async () => {
    const convRepo = makeConvRepo({
      getMemberRole: vi.fn().mockResolvedValue('owner'),
      addMembers: vi.fn().mockResolvedValue(undefined),
      getMemberIds: vi.fn().mockResolvedValue([]),
    });
    const svc = new MessageService(makeMessageRepo(), convRepo, makeMqtt(), makeNotification(), makeUserService());
    await expect(svc.addMembers('c1', 'owner-1', ['u1'])).resolves.toBeUndefined();
    expect(convRepo.addMembers).toHaveBeenCalledWith('c1', ['u1']);
  });

  it('allows admin to add members', async () => {
    const convRepo = makeConvRepo({
      getMemberRole: vi.fn().mockResolvedValue('admin'),
      addMembers: vi.fn().mockResolvedValue(undefined),
      getMemberIds: vi.fn().mockResolvedValue([]),
    });
    const svc = new MessageService(makeMessageRepo(), convRepo, makeMqtt(), makeNotification(), makeUserService());
    await expect(svc.addMembers('c1', 'admin-1', ['u1'])).resolves.toBeUndefined();
  });
});

// ─── removeMember ────────────────────────────────────────────────────────────

describe('MessageService.removeMember', () => {
  it('throws ValidationError for empty params', async () => {
    const svc = makeService();
    await expect(svc.removeMember('', 'req', 'target')).rejects.toThrow(ValidationError);
    await expect(svc.removeMember('c1', '', 'target')).rejects.toThrow(ValidationError);
    await expect(svc.removeMember('c1', 'req', '')).rejects.toThrow(ValidationError);
  });

  it('throws UnauthorizedError when requester is not a member', async () => {
    const svc = makeService({}, { getMemberRole: vi.fn().mockResolvedValue(null) });
    await expect(svc.removeMember('c1', 'req', 'target')).rejects.toThrow(UnauthorizedError);
  });

  it('allows a user to remove themselves (leave)', async () => {
    const convRepo = makeConvRepo({
      getMemberRole: vi.fn().mockResolvedValue('member'),
      removeMember: vi.fn().mockResolvedValue(undefined),
      getMemberIds: vi.fn().mockResolvedValue([]),
    });
    const svc = new MessageService(makeMessageRepo(), convRepo, makeMqtt(), makeNotification(), makeUserService());
    await expect(svc.removeMember('c1', 'u1', 'u1')).resolves.toBeUndefined();
    expect(convRepo.removeMember).toHaveBeenCalledWith('c1', 'u1');
  });

  it('plain member cannot remove another user', async () => {
    const svc = makeService({}, { getMemberRole: vi.fn().mockResolvedValue('member') });
    await expect(svc.removeMember('c1', 'member-1', 'other-user')).rejects.toThrow(UnauthorizedError);
  });

  it('admin cannot remove the owner', async () => {
    const convRepo = makeConvRepo({
      getMemberRole: vi.fn()
        .mockResolvedValueOnce('admin')   // requester role
        .mockResolvedValueOnce('owner'),  // target role
    });
    const svc = new MessageService(makeMessageRepo(), convRepo, makeMqtt(), makeNotification(), makeUserService());
    await expect(svc.removeMember('c1', 'admin-1', 'owner-1')).rejects.toThrow('Cannot remove the owner');
  });

  it('admin cannot remove another admin', async () => {
    const convRepo = makeConvRepo({
      getMemberRole: vi.fn()
        .mockResolvedValueOnce('admin')   // requester role
        .mockResolvedValueOnce('admin'),  // target role
    });
    const svc = new MessageService(makeMessageRepo(), convRepo, makeMqtt(), makeNotification(), makeUserService());
    await expect(svc.removeMember('c1', 'admin-1', 'admin-2')).rejects.toThrow('Only the owner can remove an admin');
  });

  it('owner can remove an admin', async () => {
    const convRepo = makeConvRepo({
      getMemberRole: vi.fn()
        .mockResolvedValueOnce('owner')   // requester role
        .mockResolvedValueOnce('admin'),  // target role
      removeMember: vi.fn().mockResolvedValue(undefined),
      getMemberIds: vi.fn().mockResolvedValue([]),
    });
    const svc = new MessageService(makeMessageRepo(), convRepo, makeMqtt(), makeNotification(), makeUserService());
    await expect(svc.removeMember('c1', 'owner-1', 'admin-2')).resolves.toBeUndefined();
  });
});

// ─── createConversation ───────────────────────────────────────────────────────

describe('MessageService.createConversation', () => {
  it('throws ValidationError when userIds is empty', async () => {
    const svc = makeService();
    await expect(svc.createConversation({ userIds: [], type: 'private' } as any)).rejects.toThrow(ValidationError);
  });

  it('creates conversation when userIds are provided', async () => {
    const conv = { id: 'conv-1' };
    const convRepo = makeConvRepo({ createConversation: vi.fn().mockResolvedValue(conv) });
    const svc = new MessageService(makeMessageRepo(), convRepo, makeMqtt(), makeNotification(), makeUserService());

    const result = await svc.createConversation({ userIds: ['u1', 'u2'], type: 'private' } as any);
    expect(result.id).toBe('conv-1');
  });
});

// ─── listMessages ─────────────────────────────────────────────────────────────

describe('MessageService.listMessages', () => {
  it('throws ValidationError for empty conversationId', async () => {
    const svc = makeService();
    await expect(svc.listMessages('', 'u1')).rejects.toThrow(ValidationError);
  });

  it('throws UnauthorizedError when user is not a member', async () => {
    const svc = makeService({}, { isMember: vi.fn().mockResolvedValue(false) });
    await expect(svc.listMessages('c1', 'u1')).rejects.toThrow(UnauthorizedError);
  });
});

// ─── typing ───────────────────────────────────────────────────────────────────

describe('MessageService.typing', () => {
  it('throws ValidationError for blank conversationId', async () => {
    const svc = makeService();
    await expect(svc.typing('', 'u1', true)).rejects.toThrow(ValidationError);
  });

  it('throws UnauthorizedError when not a member', async () => {
    const svc = makeService({}, { isMember: vi.fn().mockResolvedValue(false) });
    await expect(svc.typing('c1', 'u1', true)).rejects.toThrow(UnauthorizedError);
  });
});

// ─── markAsSeen ───────────────────────────────────────────────────────────────

describe('MessageService.markAsSeen', () => {
  it('throws UnauthorizedError when not a member', async () => {
    const svc = makeService({}, { isMember: vi.fn().mockResolvedValue(false) });
    await expect(svc.markAsSeen('c1', 'u1')).rejects.toThrow(UnauthorizedError);
  });

  it('does not publish MQTT when no lastMessageId', async () => {
    const mqtt = makeMqtt();
    const msgRepo = makeMessageRepo({ getLastMessageId: vi.fn().mockResolvedValue(null) });
    const svc = new MessageService(msgRepo, makeConvRepo(), mqtt, makeNotification(), makeUserService());
    await svc.markAsSeen('c1', 'u1');
    expect(mqtt.publish).not.toHaveBeenCalled();
  });
});
