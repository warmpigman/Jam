export interface FileMetadata {
  id: string;
  bucketName: string;
  objectKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  eTag?: string;
  uploadedAt: Date;
  processedAt?: Date;
  status: ProcessingStatus;
  error?: string;
}

export interface ContentUnit {
  id: string;
  fileId: string;
  type: ContentType;
  content: string;
  metadata: Record<string, any>;
  pageNumber?: number;
  timestamp?: number;
  coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  embeddingId?: string;
  createdAt: Date;
}

export interface EmbeddingRecord {
  id: string;
  contentId: string;
  vector: number[];
  model: string;
  dimensions: number;
  createdAt: Date;
}

// LanceDB specific types
export interface LanceDBRecord {
  id: string;
  content_id: string;
  file_id: string;
  vector: number[];
  content: string;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface LanceDBConfig {
  uri: string;
  tableName: string;
  dimensions: number;
  metricType: string;
  storageOptions: {
    writeMode: string;
    enableStats: boolean;
  };
}

// Enhanced file processing types
export interface ProcessingResult {
  success: boolean;
  contentUnits: ContentUnit[];
  error?: string;
  processingTime: number;
  metadata: {
    pageCount?: number;
    duration?: number;
    dimensions?: { width: number; height: number };
    extractedText?: string;
  };
}

export interface ChunkingResult {
  chunks: ContentUnit[];
  totalChunks: number;
  averageChunkSize: number;
}

// Health check types
export interface HealthStatus {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  lastCheck: Date;
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
}

export interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  services: HealthStatus[];
  timestamp: Date;
  uptime: number;
}

export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PENDING_EMBEDDING = 'pending_embedding',
  PROCESSING_EMBEDDING = 'processing_embedding',
  COMPLETED_EMBEDDING = 'completed_embedding',
  COMPLETED = 'completed',
  FAILED = 'failed',
  FAILED_EMBEDDING = 'failed_embedding',
  DELETED = 'deleted',
}

export enum ContentType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO_TRANSCRIPT = 'audio_transcript',
  VIDEO_FRAME = 'video_frame',
}

export interface MinioConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
}

export interface OllamaEmbeddingResponse {
  embedding: number[];
  model: string;
}

export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
  preserveStructure?: boolean;
}