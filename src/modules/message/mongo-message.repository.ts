import mongoose, { Schema, Model, Document } from "mongoose";
const MessageSchema = new Schema<MessageDocument>({
  conversationId: { type: String, required: true },
  senderId: { type: String, required: true, index: true },
  content: { type: String, required: true },
  type: { type: String, default: 'text' },
  attachments: { type: [Schema.Types.Mixed], default: [] },
  metadata: { type: Schema.Types.Mixed },
  reactions: { type: Schema.Types.Mixed, default: {} },
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
      id: doc._id?.toString() || doc.id,
      conversationId: doc.conversationId,
      senderId: doc.senderId,
      content: doc.content,
      type: doc.type,
      attachments: doc.attachments,
      metadata: doc.metadata,
      reactions: doc.reactions,
      seenBy: doc.seenBy,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt?.toISOString(),
    };
  }

  async create(
    data: Pick<MessageEntity, "conversationId" | "senderId" | "content"> & Partial<Pick<MessageEntity, "type" | "seenBy" | "attachments" | "metadata">>
  ): Promise<MessageDTO> {
    const created = await this.messageModel.create({
      conversationId: data.conversationId,
      senderId: data.senderId,
      content: data.content,
      type: data.type || "text",
      attachments: data.attachments || [],
      metadata: data.metadata || null,
      reactions: {},
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

  async markMessagesSeen(conversationId: string, userId: string): Promise<void> {
    await this.messageModel.updateMany(
      { conversationId, seenBy: { $ne: userId } },
      { $addToSet: { seenBy: userId } },
    ).exec();
  }

  async addReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    const doc = await this.messageModel.findById(messageId).exec();
    if (!doc) return;
    
    const newReactions = { ...(doc.reactions || {}) };
    if (!newReactions[emoji]) newReactions[emoji] = [];
    
    const usersList = [...newReactions[emoji]];
    const idx = usersList.indexOf(userId);
    
    if (idx > -1) {
      usersList.splice(idx, 1);
      if (usersList.length === 0) {
         delete newReactions[emoji];
      } else {
         newReactions[emoji] = usersList;
      }
    } else {
      usersList.push(userId);
      newReactions[emoji] = usersList;
    }
    
    // Explicitly overwrite the mixed property to trigger Mongoose tracking
    doc.reactions = newReactions;
    doc.markModified('reactions');
    await doc.save();
  }

  async deleteByConversationId(conversationId: string): Promise<void> {
    await this.messageModel.deleteMany({ conversationId }).exec();
  }
}

export const mongoMessageRepository = new MongoMessageRepository(MessageModel);

