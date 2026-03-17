import mongoose, { Schema, Document } from 'mongoose';
import { CallEntity } from './call.types';

export interface CallDocument extends Document {
  callerId: string;
  receiverId: string;
  status: string;
  callType: string;
  startTime?: Date;
  endTime?: Date;
  duration: number;
  roomName: string;
}

const callSchema = new Schema<CallDocument>(
  {
    callerId: { type: String, required: true },
    receiverId: { type: String, required: true },
    status: {
      type: String,
      enum: ['initiating', 'ringing', 'ongoing', 'ended', 'missed', 'rejected', 'failed'],
      default: 'initiating',
    },
    callType: { type: String, enum: ['audio', 'video'], required: true },
    startTime: { type: Date },
    endTime: { type: Date },
    duration: { type: Number, default: 0 },
    roomName: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

export const CallModel = mongoose.model<CallDocument>('Call', callSchema);

export class MongoCallRepository {
  async createCall(data: Partial<CallEntity>): Promise<CallEntity> {
    const call = new CallModel(data);
    const savedCall = await call.save();
    return this.mapToEntity(savedCall);
  }

  async getCallById(id: string): Promise<CallEntity | null> {
    const call = await CallModel.findById(id);
    if (!call) return null;
    return this.mapToEntity(call);
  }

  /**
   * Update status, startTime (when call becomes active), and duration.
   * Used for both 'ongoing' (accept) and 'ended' statuses.
   */
  async updateCallStatusAndDuration(
    callId: string,
    status: string,
    startOrEndTime: Date,
    duration: number
  ): Promise<CallEntity | null> {
    const updatePayload: Record<string, unknown> = { status, duration };

    if (status === 'ongoing') {
      updatePayload['startTime'] = startOrEndTime;
    } else if (status === 'ended') {
      updatePayload['endTime'] = startOrEndTime;
    }

    const call = await CallModel.findByIdAndUpdate(callId, updatePayload, { new: true });
    if (!call) return null;
    return this.mapToEntity(call);
  }

  /** Mark a call as rejected. */
  async updateCallStatusToRejected(callId: string): Promise<CallEntity | null> {
    const call = await CallModel.findByIdAndUpdate(
      callId,
      { status: 'rejected' },
      { new: true }
    );
    if (!call) return null;
    return this.mapToEntity(call);
  }

  async getCallHistory(userId: string): Promise<CallEntity[]> {
    const calls = await CallModel.find({
      $or: [{ callerId: userId }, { receiverId: userId }],
    }).sort({ createdAt: -1 });

    return calls.map((c) => this.mapToEntity(c));
  }

  private mapToEntity(doc: any): CallEntity {
    return {
      id: doc._id.toString(),
      callerId: doc.callerId,
      receiverId: doc.receiverId,
      status: doc.status,
      callType: doc.callType,
      startTime: doc.startTime ? new Date(doc.startTime) : undefined,
      endTime: doc.endTime ? new Date(doc.endTime) : undefined,
      duration: doc.duration,
      roomName: doc.roomName,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
