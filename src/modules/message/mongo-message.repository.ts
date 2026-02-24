import mongoose, { Schema, Model, Document } from "mongoose";
const MessageSchema = new Schema<MessageDocument>({
  conversationId: { type: String, required: true },
  senderId: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
});

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
  constructor(private readonly messageModel: Model<MessageDocument>) {}

  async create(
    data: Pick<MessageEntity, "conversationId" | "senderId" | "content">
  ): Promise<MessageDTO> {
    const created = await this.messageModel.create({
      conversationId: data.conversationId,
      senderId: data.senderId,
      content: data.content,
    });
    return {
      id: created.id,
      conversationId: created.conversationId,
      senderId: created.senderId,
      content: created.content,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt?.toISOString(),
    };
  }

  async findById(id: string): Promise<MessageDTO | null> {
    const doc = await this.messageModel.findById(id).exec();
    if (!doc) return null;
    return {
      id: doc.id,
      conversationId: doc.conversationId,
      senderId: doc.senderId,
      content: doc.content,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt?.toISOString(),
    };
  }

  async findByConversationId(conversationId: string): Promise<MessageDTO[]> {
    const docs = await this.messageModel
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .exec();
    return docs.map((doc) => ({
      id: doc.id,
      conversationId: doc.conversationId,
      senderId: doc.senderId,
      content: doc.content,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt?.toISOString(),
    }));
  }

  async deleteById(id: string): Promise<void> {
    await this.messageModel.findByIdAndDelete(id).exec();
  }
}

