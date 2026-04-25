import mongoose, { Schema, Model, Document } from "mongoose";
const MessageSchema = new Schema<MessageDocument>({
  conversationId: { type: String, required: true },
  senderId: { type: String, required: true, index: true },
  content: { type: String, required: true },
  type: { type: String, default: 'text' },
  attachments: { type: [Schema.Types.Mixed], default: [] },
  metadata: { type: Schema.Types.Mixed },
  mentions: { type: [String], default: [] },
  hiddenBy: { type: [String], default: [] },
  isPinned: { type: Boolean, default: false },
  reactions: { type: Schema.Types.Mixed, default: {} },
  seenBy: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },

  // New fields
  replyTo: { type: String },
  forwardedFrom: { type: String },
  isDeleted: { type: Boolean, default: false },
  deletedBy: { type: String },
  deletedAt: { type: Date },
  deletedForUsers: { type: [String], default: [] },
  editedAt: { type: Date },
  editHistory: { type: [{ content: String, editedAt: Date }], default: [] },
});

MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ content: "text" });
MessageSchema.index({ type: 1 });

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
      mentions: doc.mentions,
      hiddenBy: doc.hiddenBy,
      isPinned: doc.isPinned,
      reactions: doc.reactions,
      seenBy: doc.seenBy,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt?.toISOString(),

      replyTo: doc.replyTo,
      forwardedFrom: doc.forwardedFrom,
      isDeleted: doc.isDeleted,
      deletedBy: doc.deletedBy,
      deletedAt: doc.deletedAt?.toISOString(),
      editedAt: doc.editedAt?.toISOString(),
      editHistory: doc.editHistory?.map(h => ({
        content: h.content,
        editedAt: h.editedAt.toISOString()
      })),
      deletedForUsers: doc.deletedForUsers,
    };
  }

  async create(
    data: Pick<MessageEntity, "conversationId" | "senderId" | "content"> & Partial<Pick<MessageEntity, "type" | "seenBy" | "attachments" | "metadata" | "mentions" | "hiddenBy" | "isPinned" | "replyTo" | "forwardedFrom">>
  ): Promise<MessageDTO> {
    const created = await this.messageModel.create({
      conversationId: data.conversationId,
      senderId: data.senderId,
      content: data.content,
      type: data.type || "text",
      attachments: data.attachments || [],
      metadata: data.metadata || null,
      mentions: data.mentions || [],
      hiddenBy: data.hiddenBy || [],
      isPinned: data.isPinned || false,
      reactions: {},
      seenBy: data.seenBy || [],
      replyTo: data.replyTo,
      forwardedFrom: data.forwardedFrom,
    });
    return this.mapMessage(created);
  }

  async findById(id: string): Promise<MessageDTO | null> {
    const doc = await this.messageModel.findById(id).exec();
    if (!doc) return null;
    return this.mapMessage(doc);
  }

  async findByConversationId(conversationId: string, userId?: string): Promise<MessageDTO[]> {
    const filter: any = { conversationId };
    if (userId) {
      filter.deletedForUsers = { $ne: userId };
    }
    const docs = await this.messageModel
      .find(filter)
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

  async searchMessages(query: any): Promise<MessageDTO[]> {
    const { keyword, types, senderIds, fromDate, toDate, limit = 50, cursor } = query;
    const filter: any = {};

    if (keyword) {
      filter.$text = { $search: keyword };
    }
    if (types && types.length > 0) {
      filter.type = { $in: types };
    }
    if (senderIds && senderIds.length > 0) {
      filter.senderId = { $in: senderIds };
    }
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) filter.createdAt.$lte = new Date(toDate);
    }
    if (cursor) {
      // Assuming cursor is the createdAt of the last message
      filter.createdAt = { ...filter.createdAt, $lt: new Date(cursor) };
    }

    const docs = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    return docs.map((doc) => this.mapMessage(doc));
  }

  async hideMessage(messageId: string, userId: string | string[]): Promise<void> {
    const userIds = Array.isArray(userId) ? userId : [userId];
    await this.messageModel.findByIdAndUpdate(messageId, {
      $addToSet: { hiddenBy: { $each: userIds } }
    }).exec();
  }

  async unhideMessage(messageId: string, userId: string): Promise<void> {
    await this.messageModel.findByIdAndUpdate(messageId, {
      $pull: { hiddenBy: userId }
    }).exec();
  }

  async pinMessage(messageId: string): Promise<void> {
    await this.messageModel.findByIdAndUpdate(messageId, {
      isPinned: true
    }).exec();
  }

  async unpinMessage(messageId: string): Promise<void> {
    await this.messageModel.findByIdAndUpdate(messageId, {
      isPinned: false
    }).exec();
  }

  async update(messageId: string, data: Partial<MessageEntity>): Promise<MessageDTO | null> {
    const doc = await this.messageModel.findByIdAndUpdate(messageId, { $set: data }, { new: true }).exec();
    if (!doc) return null;
    return this.mapMessage(doc);
  }

  async deleteForEveryone(messageId: string, userId: string): Promise<MessageDTO | null> {
    const doc = await this.messageModel.findByIdAndUpdate(messageId, {
      $set: {
        isDeleted: true,
        deletedBy: userId,
        deletedAt: new Date(),
        content: "",
        attachments: [],
        metadata: null
      }
    }, { new: true }).exec();
    if (!doc) return null;
    return this.mapMessage(doc);
  }
  
  async deleteForMe(messageId: string, userId: string): Promise<void> {
    await this.messageModel.findByIdAndUpdate(messageId, {
      $addToSet: { deletedForUsers: userId }
    }).exec();
  }
}

export const mongoMessageRepository = new MongoMessageRepository(MessageModel);

