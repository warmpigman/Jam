import mongoose, { Schema, Document } from 'mongoose';
import { FileMetadata, ProcessingStatus } from '@/types/index.js';

export interface IFileMetadata extends Omit<FileMetadata, 'id'>, Document {
  _id: string;
  detectedExtension?: string;
  processingStartedAt?: Date;
  lastAttemptedAt?: Date;
  processingAttempts?: number;
  contentUnitsCount?: number;
  lastJobId?: string;
  deletedAt?: Date;
  embeddingProgress?: {
    total: number;
    completed: number;
    pending: number;
    failed: number;
    lastUpdated: Date;
  };
}

const fileMetadataSchema = new Schema<IFileMetadata>({
  bucketName: { type: String, required: true, index: true },
  objectKey: { type: String, required: true, index: true },
  fileName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  mimeType: { type: String, required: true, index: true },
  detectedExtension: { type: String },
  eTag: { type: String, index: true },
  uploadedAt: { type: Date, required: true, default: Date.now },
  processedAt: { type: Date },
  processingStartedAt: { type: Date },
  lastAttemptedAt: { type: Date },
  status: { 
    type: String, 
    enum: Object.values(ProcessingStatus), 
    required: true, 
    default: ProcessingStatus.PENDING,
    index: true
  },
  error: { type: String },
  processingAttempts: { type: Number, default: 0 },
  contentUnitsCount: { type: Number, default: 0 },
  lastJobId: { type: String },
  deletedAt: { type: Date },
}, {
  timestamps: true,
  collection: 'file_metadata'
});

// Compound index for unique file identification
fileMetadataSchema.index({ bucketName: 1, objectKey: 1 }, { unique: true });

// Index for querying by processing status
fileMetadataSchema.index({ status: 1, uploadedAt: -1 });

export const FileMetadataModel = mongoose.model<IFileMetadata>('FileMetadata', fileMetadataSchema);