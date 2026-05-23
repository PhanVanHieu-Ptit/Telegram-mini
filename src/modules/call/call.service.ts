import crypto from 'node:crypto';
import { MongoCallRepository } from './mongo-call.repository';
import { StartCallInput, EndCallInput, CallDTO } from './call.types';

export class CallService {
  constructor(private callRepository: MongoCallRepository) {}

  // ── Start a call ──────────────────────────────────────────────────────────
  async startCall(input: StartCallInput): Promise<CallDTO> {
    const roomName = `room_${crypto.randomUUID()}`;

    const call = await this.callRepository.createCall({
      callerId: input.callerId,
      receiverId: input.receiverId,
      callType: input.callType,
      roomName,
      status: 'ringing',
      duration: 0,
    });

    return this.mapToDTO(call);
  }

  // ── Accept a call ─────────────────────────────────────────────────────────
  async acceptCall(callId: string, calleeId: string): Promise<CallDTO> {
    const call = await this.callRepository.getCallById(callId);
    if (!call) throw new Error(`Call with ID ${callId} not found`);
    if (call.receiverId !== calleeId) throw new Error('Forbidden: not the callee of this call');

    const updatedCall = await this.callRepository.updateCallStatusAndDuration(
      callId,
      'ongoing',
      new Date(),   // startTime
      0             // duration not known yet
    );
    return this.mapToDTO(updatedCall!);
  }

  // ── Reject a call ─────────────────────────────────────────────────────────
  async rejectCall(callId: string, calleeId: string, _reason?: string): Promise<CallDTO> {
    const call = await this.callRepository.getCallById(callId);
    if (!call) throw new Error(`Call with ID ${callId} not found`);
    if (call.receiverId !== calleeId) throw new Error('Forbidden: not the callee of this call');

    const updatedCall = await this.callRepository.updateCallStatusToRejected(callId);
    return this.mapToDTO(updatedCall!);
  }

  // ── End a call ────────────────────────────────────────────────────────────
  async endCall(input: EndCallInput): Promise<CallDTO> {
    const call = await this.callRepository.getCallById(input.callId);
    if (!call) throw new Error(`Call with ID ${input.callId} not found`);

    const endTime = new Date();
    const startTime = call.startTime ?? call.createdAt;
    const duration = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));

    const updatedCall = await this.callRepository.updateCallStatusAndDuration(
      input.callId,
      'ended',
      endTime,
      duration
    );

    return this.mapToDTO(updatedCall!);
  }

  // ── Miss a call (no answer / timeout) ────────────────────────────────────
  async missCall(callId: string): Promise<CallDTO> {
    const updated = await this.callRepository.updateCallStatus(callId, 'missed');
    if (!updated) throw new Error(`Call with ID ${callId} not found`);
    return this.mapToDTO(updated);
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  async getCallById(id: string): Promise<CallDTO | null> {
    const call = await this.callRepository.getCallById(id);
    return call ? this.mapToDTO(call) : null;
  }

  async getCallHistory(userId: string): Promise<CallDTO[]> {
    const calls = await this.callRepository.getCallHistory(userId);
    return calls.map((c) => this.mapToDTO(c));
  }

  // ── Private mapper ─────────────────────────────────────────────────────────
  private mapToDTO(entity: any): CallDTO {
    return {
      ...entity,
      startTime: entity.startTime ? new Date(entity.startTime).toISOString() : undefined,
      endTime: entity.endTime ? new Date(entity.endTime).toISOString() : undefined,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: entity.updatedAt ? new Date(entity.updatedAt).toISOString() : undefined,
    };
  }
}
