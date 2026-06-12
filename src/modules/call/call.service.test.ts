import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallService } from './call.service';
import type { CallEntity } from './call.types';

function makeCallEntity(overrides: Partial<CallEntity> = {}): CallEntity {
  return {
    id: 'call-1',
    callerId: 'caller-1',
    receiverId: 'receiver-1',
    status: 'ringing',
    callType: 'video',
    roomName: 'room_test',
    duration: 0,
    createdAt: new Date('2024-01-01T10:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    createCall: vi.fn(),
    getCallById: vi.fn(),
    updateCallStatusAndDuration: vi.fn(),
    updateCallStatusToRejected: vi.fn(),
    updateCallStatus: vi.fn(),
    getCallHistory: vi.fn(),
    ...overrides,
  } as any;
}

describe('CallService.startCall', () => {
  it('creates a call with ringing status and a room_ prefixed name', async () => {
    const entity = makeCallEntity();
    const repo = makeRepo({ createCall: vi.fn().mockResolvedValue(entity) });
    const service = new CallService(repo);

    const result = await service.startCall({ callerId: 'caller-1', receiverId: 'receiver-1', callType: 'video' });

    expect(repo.createCall).toHaveBeenCalledWith(
      expect.objectContaining({
        callerId: 'caller-1',
        receiverId: 'receiver-1',
        callType: 'video',
        status: 'ringing',
        duration: 0,
      })
    );
    const passedRoomName: string = repo.createCall.mock.calls[0][0].roomName;
    expect(passedRoomName).toMatch(/^room_/);
    expect(result.id).toBe('call-1');
  });
});

describe('CallService.acceptCall', () => {
  it('throws when call not found', async () => {
    const repo = makeRepo({ getCallById: vi.fn().mockResolvedValue(null) });
    const service = new CallService(repo);

    await expect(service.acceptCall('missing', 'receiver-1')).rejects.toThrow('not found');
  });

  it('throws Forbidden when callee does not match receiverId', async () => {
    const repo = makeRepo({
      getCallById: vi.fn().mockResolvedValue(makeCallEntity({ receiverId: 'receiver-1' })),
    });
    const service = new CallService(repo);

    await expect(service.acceptCall('call-1', 'other-user')).rejects.toThrow('Forbidden');
  });

  it('updates status to ongoing when callee is correct', async () => {
    const ongoing = makeCallEntity({ status: 'ongoing', startTime: new Date() });
    const repo = makeRepo({
      getCallById: vi.fn().mockResolvedValue(makeCallEntity()),
      updateCallStatusAndDuration: vi.fn().mockResolvedValue(ongoing),
    });
    const service = new CallService(repo);

    const result = await service.acceptCall('call-1', 'receiver-1');
    expect(repo.updateCallStatusAndDuration).toHaveBeenCalledWith('call-1', 'ongoing', expect.any(Date), 0);
    expect(result.status).toBe('ongoing');
  });
});

describe('CallService.rejectCall', () => {
  it('throws when call not found', async () => {
    const repo = makeRepo({ getCallById: vi.fn().mockResolvedValue(null) });
    const service = new CallService(repo);

    await expect(service.rejectCall('missing', 'receiver-1')).rejects.toThrow('not found');
  });

  it('throws Forbidden when callee does not match', async () => {
    const repo = makeRepo({
      getCallById: vi.fn().mockResolvedValue(makeCallEntity()),
    });
    const service = new CallService(repo);

    await expect(service.rejectCall('call-1', 'stranger')).rejects.toThrow('Forbidden');
  });

  it('updates status to rejected', async () => {
    const rejected = makeCallEntity({ status: 'rejected' });
    const repo = makeRepo({
      getCallById: vi.fn().mockResolvedValue(makeCallEntity()),
      updateCallStatusToRejected: vi.fn().mockResolvedValue(rejected),
    });
    const service = new CallService(repo);

    const result = await service.rejectCall('call-1', 'receiver-1');
    expect(result.status).toBe('rejected');
  });
});

describe('CallService.endCall', () => {
  it('throws when call not found', async () => {
    const repo = makeRepo({ getCallById: vi.fn().mockResolvedValue(null) });
    const service = new CallService(repo);

    await expect(service.endCall({ callId: 'missing' })).rejects.toThrow('not found');
  });

  it('calculates duration from startTime when available', async () => {
    const startTime = new Date(Date.now() - 30_000); // 30 seconds ago
    const call = makeCallEntity({ startTime });
    const ended = makeCallEntity({ status: 'ended', duration: 30, endTime: new Date() });
    const repo = makeRepo({
      getCallById: vi.fn().mockResolvedValue(call),
      updateCallStatusAndDuration: vi.fn().mockResolvedValue(ended),
    });
    const service = new CallService(repo);

    await service.endCall({ callId: 'call-1' });

    const [, , , duration] = repo.updateCallStatusAndDuration.mock.calls[0];
    expect(duration).toBeGreaterThanOrEqual(29);
    expect(duration).toBeLessThanOrEqual(32);
  });

  it('falls back to createdAt when startTime is absent, duration >= 0', async () => {
    const call = makeCallEntity({ startTime: undefined });
    const ended = makeCallEntity({ status: 'ended', duration: 0 });
    const repo = makeRepo({
      getCallById: vi.fn().mockResolvedValue(call),
      updateCallStatusAndDuration: vi.fn().mockResolvedValue(ended),
    });
    const service = new CallService(repo);

    await service.endCall({ callId: 'call-1' });

    const [, , , duration] = repo.updateCallStatusAndDuration.mock.calls[0];
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('duration is never negative', async () => {
    // Edge case: startTime is slightly in the future due to clock skew
    const futureStart = new Date(Date.now() + 5_000);
    const call = makeCallEntity({ startTime: futureStart });
    const ended = makeCallEntity({ status: 'ended', duration: 0 });
    const repo = makeRepo({
      getCallById: vi.fn().mockResolvedValue(call),
      updateCallStatusAndDuration: vi.fn().mockResolvedValue(ended),
    });
    const service = new CallService(repo);

    await service.endCall({ callId: 'call-1' });

    const [, , , duration] = repo.updateCallStatusAndDuration.mock.calls[0];
    expect(duration).toBe(0);
  });
});

describe('CallService.missCall', () => {
  it('throws when call not found', async () => {
    const repo = makeRepo({ updateCallStatus: vi.fn().mockResolvedValue(null) });
    const service = new CallService(repo);

    await expect(service.missCall('missing')).rejects.toThrow('not found');
  });

  it('updates status to missed', async () => {
    const missed = makeCallEntity({ status: 'missed' });
    const repo = makeRepo({ updateCallStatus: vi.fn().mockResolvedValue(missed) });
    const service = new CallService(repo);

    const result = await service.missCall('call-1');
    expect(result.status).toBe('missed');
  });
});

describe('CallService.getCallById', () => {
  it('returns null when call does not exist', async () => {
    const repo = makeRepo({ getCallById: vi.fn().mockResolvedValue(null) });
    const service = new CallService(repo);

    expect(await service.getCallById('x')).toBeNull();
  });

  it('returns mapped DTO', async () => {
    const call = makeCallEntity();
    const repo = makeRepo({ getCallById: vi.fn().mockResolvedValue(call) });
    const service = new CallService(repo);

    const result = await service.getCallById('call-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('call-1');
    expect(typeof result!.createdAt).toBe('string'); // ISO string
  });
});

describe('CallService.mapToDTO (via getCallHistory)', () => {
  it('converts Date fields to ISO strings', async () => {
    const startTime = new Date('2024-06-01T09:00:00Z');
    const endTime = new Date('2024-06-01T09:05:00Z');
    const call = makeCallEntity({ startTime, endTime });
    const repo = makeRepo({ getCallHistory: vi.fn().mockResolvedValue([call]) });
    const service = new CallService(repo);

    const [dto] = await service.getCallHistory('caller-1');
    expect(dto.startTime).toBe('2024-06-01T09:00:00.000Z');
    expect(dto.endTime).toBe('2024-06-01T09:05:00.000Z');
    expect(typeof dto.createdAt).toBe('string');
  });

  it('leaves startTime/endTime undefined when absent', async () => {
    const call = makeCallEntity({ startTime: undefined, endTime: undefined });
    const repo = makeRepo({ getCallHistory: vi.fn().mockResolvedValue([call]) });
    const service = new CallService(repo);

    const [dto] = await service.getCallHistory('caller-1');
    expect(dto.startTime).toBeUndefined();
    expect(dto.endTime).toBeUndefined();
  });
});
