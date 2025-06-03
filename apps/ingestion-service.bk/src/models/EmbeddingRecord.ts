import mongoose, { Schema, Document } from 'mongoose';
import { EmbeddingRecord } from '@/types/index.js';

export interface IEmbeddingRecord extends Document {
  contentId: string;
  vector: number[];
  modelName: string; // Renamed to avoid conflict with Document.model
  dimensions: number;
  createdAt: Date;
}

const embeddingRecordSchema = new Schema<IEmbeddingRecord>({
  contentId: { type: String, required: true, index: true },
  vector: { type: [Number], required: true },
  modelName: { type: String, required: true, index: true },
  dimensions: { type: Number, required: true },
  createdAt: { type: Date, required: true, default: Date.now }
}, {
  timestamps: true,
  collection: 'embedding_records'
});

// Index for content-based queries
embeddingRecordSchema.index({ contentId: 1, modelName: 1 }, { unique: true });

// Index for model-based queries
embeddingRecordSchema.index({ modelName: 1, createdAt: -1 });

export const EmbeddingRecordModel = mongoose.model<IEmbeddingRecord>('EmbeddingRecord', embeddingRecordSchema);