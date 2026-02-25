import mongoose, { Schema, Model, Document } from "mongoose";
const MessageSchema = new Schema<MessageDocument>({
  conversationId: { type: String, required: true },
  senderId: { type: String, required: true, index: true },
  content: { type: String, required: true },
  type: { type: String, default: 'text' },
  seenBy: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
});

MessageSchema.index({ conversationId: 1, createdAt: 1 });

export const MessageModel = mongoose.models.Message || mongoose.model<MessageDocument>("Message", MessageSchema);

import type {
  MessageDTO,
  MessageEntity,
} from "./message.types";
import { IMessageRepository } from "./message.repositories";

export interface MessageDocument extends MessageEntity, Document {
  id: string;
}

export class MongoMessageRepository implements IMessageRepository {
  constructor(private readonly messageModel: Model<MessageDocument>) { }

  private mapMessage(doc: MessageDocument): MessageDTO {
    return {
      id: doc.id,
      conversationId: doc.conversationId,
      senderId: doc.senderId,
      content: doc.content,
      type: doc.type,
      seenBy: doc.seenBy,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt?.toISOString(),
    };
  }

  async create(
    data: Pick<MessageEntity, "conversationId" | "senderId" | "content"> & Partial<Pick<MessageEntity, "type" | "seenBy">>
  ): Promise<MessageDTO> {
    const created = await this.messageModel.create({
      conversationId: data.conversationId,
      senderId: data.senderId,
      content: data.content,
      type: data.type || "text",
      seenBy: data.seenBy || [],
    });
    return this.mapMessage(created);
  }

  async findById(id: string): Promise<MessageDTO | null> {
    const doc = await this.messageModel.findById(id).exec();
    if (!doc) return null;
    return this.mapMessage(doc);
  }

  async findByConversationId(conversationId: string): Promise<MessageDTO[]> {
    const docs = await this.messageModel
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .exec();
    return docs.map((doc) => this.mapMessage(doc));
  }

  async deleteById(id: string): Promise<void> {
    await this.messageModel.findByIdAndDelete(id).exec();
  }
}

