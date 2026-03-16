export interface StartCallInput {
  receiverId: string;
  callerId: string;
  callType: 'audio' | 'video';
}

export interface EndCallInput {
  callId: string;
  reason?: string;
}

export interface CallEntity {
  id: string;
  callerId: string;
  receiverId: string;
  status: 'initiating' | 'ringing' | 'ongoing' | 'ended' | 'missed' | 'rejected' | 'failed';
  callType: 'audio' | 'video';
  startTime?: Date;
  endTime?: Date;
  duration: number;
  roomName: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface CallDTO {
  id: string;
  callerId: string;
  receiverId: string;
  status: 'initiating' | 'ringing' | 'ongoing' | 'ended' | 'missed' | 'rejected' | 'failed';
  callType: 'audio' | 'video';
  startTime?: string | Date;
  endTime?: string | Date;
  duration: number;
  roomName: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
}
