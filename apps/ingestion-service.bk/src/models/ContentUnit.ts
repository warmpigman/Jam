import mongoose, { Schema, Document } from 'mongoose';
import { ContentUnit, ContentType, ProcessingStatus } from '@/types/index.js';

export interface IContentUnit extends Omit<ContentUnit, 'id'>, Document {
  _id: string;
  status?: ProcessingStatus;
  error?: string;
  lastAttemptedAt?: Date;
  processedAt?: Date;
  processingAttempts?: number;
}

const contentUnitSchema = new Schema<IContentUnit>({
  fileId: { type: String, required: true, index: true },
  type: { 
    type: String, 
    enum: Object.values(ContentType), 
    required: true,
    index: true
  },
  content: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  pageNumber: { type: Number, index: true },
  timestamp: { type: Number, index: true },
  coordinates: {
    x: { type: Number },
    y: { type: Number },
    width: { type: Number },
    height: { type: Number }
  },
  embeddingId: { type: String, index: true },
  status: { 
    type: String, 
    enum: Object.values(ProcessingStatus), 
    required: true, 
    default: ProcessingStatus.PENDING,
    index: true
  },
  error: { type: String },
  lastAttemptedAt: { type: Date },
  processedAt: { type: Date },
  createdAt: { type: Date, required: true, default: Date.now },
}, {
  timestamps: true,
  collection: 'content_units'
});

// Index for efficient file-based queries
contentUnitSchema.index({ fileId: 1, type: 1 });

// Index for embedding status queries
contentUnitSchema.index({ embeddingId: 1 });

// Text index for content search
contentUnitSchema.index({ content: 'text' });

export const ContentUnitModel = mongoose.model<IContentUnit>('ContentUnit', contentUnitSchema);