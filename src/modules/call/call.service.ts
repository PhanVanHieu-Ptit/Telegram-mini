import { MongoCallRepository } from './mongo-call.repository';
import { StartCallInput, EndCallInput, CallDTO } from './call.types';

export class CallService {
  constructor(private callRepository: MongoCallRepository) {}

  async startCall(input: StartCallInput): Promise<CallDTO> {
    const roomName = `room_${Date.now()}_${input.callerId}`;
    
    const call = await this.callRepository.createCall({
      callerId: input.callerId,
      receiverId: input.receiverId,
      callType: input.callType,
      roomName,
      status: 'initiating',
      duration: 0
    });

    return this.mapToDTO(call);
  }

  async endCall(input: EndCallInput): Promise<CallDTO> {
    const call = await this.callRepository.getCallById(input.callId);
    if (!call) {
      throw new Error(`Call with ID ${input.callId} not found`);
    }

    const endTime = new Date();
    const startTime = call.startTime || call.createdAt;
    const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000) || 0;

    const updatedCall = await this.callRepository.updateCallStatusAndDuration(
      input.callId,
      'ended',
      endTime,
      duration
    );

    return this.mapToDTO(updatedCall!);
  }

  async getCallById(id: string): Promise<CallDTO | null> {
    const call = await this.callRepository.getCallById(id);
    if (!call) return null;
    return this.mapToDTO(call);
  }

  async getCallHistory(userId: string): Promise<CallDTO[]> {
    const calls = await this.callRepository.getCallHistory(userId);
    return calls.map(call => this.mapToDTO(call));
  }

  private mapToDTO(entity: any): CallDTO {
    return {
      ...entity,
      startTime: entity.startTime ? entity.startTime.toISOString() : undefined,
      endTime: entity.endTime ? entity.endTime.toISOString() : undefined,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt?.toISOString(),
    };
  }
}
