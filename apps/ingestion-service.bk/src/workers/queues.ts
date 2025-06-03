import { Queue } from 'bullmq';
import { getRedisClient } from '@/config/redis.js';
import { config } from '@/config/index.js';
import { logger } from '@/config/logger.js';

// Job data interfaces
export interface FileProcessingJobData {
  bucketName: string;
  objectKey: string;
  objectSize?: number;
  eTag?: string;
  eventType: 'created' | 'deleted' | 'updated';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface EmbeddingJobData {
  contentUnitId: string;
  contentType: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface EmbeddingBatchJobData {
  contentUnitIds: string[];
  batchSize?: number;
  metadata?: Record<string, any>;
}

// Initialize queues
let fileProcessingQueue: Queue<FileProcessingJobData>;
let embeddingQueue: Queue<EmbeddingJobData>;

export function initializeQueues() {
  const redis = getRedisClient();
  
  fileProcessingQueue = new Queue<FileProcessingJobData>(config.queues.fileProcessing, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: config.processing.maxRetries,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  });

  embeddingQueue = new Queue<EmbeddingJobData>(config.queues.embedding, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: config.processing.maxRetries,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  // Enhanced queue event listeners for better monitoring
  fileProcessingQueue.on('error', (error: Error) => {
    logger.error(`File Processing Queue Error:`, error);
  });

  fileProcessingQueue.on('failed', (job: any, err: Error) => {
    logger.error(`File Processing Job Failed:`, {
      jobId: job?.id,
      jobName: job?.name,
      objectKey: job?.data?.objectKey,
      bucketName: job?.data?.bucketName,
      error: err.message,
      attempts: job?.attemptsMade
    });
  });

  fileProcessingQueue.on('completed', (job: any, result: any) => {
    logger.info(`File Processing Job Completed:`, {
      jobId: job.id,
      objectKey: job?.data?.objectKey,
      contentUnits: result?.contentUnits,
      embeddingJobsQueued: result?.embeddingJobsQueued,
      processingTime: result?.processingTime
    });
  });

  fileProcessingQueue.on('stalled', (job: any) => {
    logger.warn(`File Processing Job Stalled:`, {
      jobId: job?.id,
      objectKey: job?.data?.objectKey
    });
  });

  embeddingQueue.on('error', (error: Error) => {
    logger.error(`Embedding Queue Error:`, error);
  });

  embeddingQueue.on('failed', (job: any, err: Error) => {
    logger.error(`Embedding Job Failed:`, {
      jobId: job?.id,
      jobName: job?.name,
      contentUnitId: job?.data?.contentUnitId,
      textLength: job?.data?.text?.length,
      error: err.message,
      attempts: job?.attemptsMade
    });
  });

  embeddingQueue.on('completed', (job: any, result: any) => {
    logger.info(`Embedding Job Completed:`, {
      jobId: job.id,
      contentUnitId: job?.data?.contentUnitId,
      embeddingId: result?.embeddingId,
      vectorDimensions: result?.vectorDimensions,
      processingTime: result?.processingTime
    });
  });

  embeddingQueue.on('stalled', (job: any) => {
    logger.warn(`Embedding Job Stalled:`, {
      jobId: job?.id,
      contentUnitId: job?.data?.contentUnitId
    });
  });

  logger.info('✅ Queues initialized with enhanced monitoring');
}

export async function addFileProcessingJob(data: FileProcessingJobData) {
  if (!fileProcessingQueue) {
    throw new Error('File processing queue not initialized');
  }

  // Create a unique job ID to prevent duplicate processing
  const jobId = `${data.bucketName}:${data.objectKey}:${data.eTag || Date.now()}`;
  
  const job = await fileProcessingQueue.add('process-file', data, {
    jobId,
    attempts: config.processing.maxRetries,
    // Add priority based on file size (smaller files processed first)
    priority: data.objectSize ? Math.max(1, 1000 - Math.min(999, Math.floor(data.objectSize / 1024))) : 500,
  });

  logger.info(`Queued file processing job:`, {
    jobId: job.id,
    objectKey: data.objectKey,
    bucketName: data.bucketName,
    eventType: data.eventType,
    priority: job.opts.priority
  });
  
  return job;
}

export async function addEmbeddingJob(data: EmbeddingJobData, options?: any) {
  if (!embeddingQueue) {
    throw new Error('Embedding queue not initialized');
  }

  const job = await embeddingQueue.add('generate-embedding', data, {
    ...options,
    // Add priority based on content length (shorter content processed first)
    priority: Math.max(1, 1000 - Math.min(999, data.content.length)),
  });
  
  logger.debug(`Queued embedding job:`, {
    jobId: job.id,
    contentUnitId: data.contentUnitId,
    contentType: data.contentType,
    contentLength: data.content.length,
    priority: job.opts.priority
  });
  
  return job;
}

export async function addEmbeddingBatchJob(data: EmbeddingBatchJobData) {
  if (!embeddingQueue) {
    throw new Error('Embedding queue not initialized');
  }

  const job = await embeddingQueue.add('generate-embeddings-batch', data, {
    attempts: 2, // Fewer retries for batch jobs
    priority: 100, // Lower priority than individual jobs
  });
  
  logger.info(`Queued embedding batch job:`, {
    jobId: job.id,
    contentUnitCount: data.contentUnitIds.length,
    batchSize: data.batchSize || 10
  });
  
  return job;
}

// Queue status and monitoring functions
export async function getQueueStats() {
  const fileStats = await fileProcessingQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
  const embeddingStats = await embeddingQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
  
  return {
    fileProcessing: fileStats,
    embedding: embeddingStats,
    timestamp: new Date()
  };
}

export async function pauseQueues() {
  await Promise.all([
    fileProcessingQueue.pause(),
    embeddingQueue.pause()
  ]);
  logger.info('All queues paused');
}

export async function resumeQueues() {
  await Promise.all([
    fileProcessingQueue.resume(),
    embeddingQueue.resume()
  ]);
  logger.info('All queues resumed');
}

export async function cleanQueues() {
  // Clean completed jobs older than 1 hour
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  
  await Promise.all([
    fileProcessingQueue.clean(oneHourAgo, 'completed'),
    fileProcessingQueue.clean(oneHourAgo, 'failed'),
    embeddingQueue.clean(oneHourAgo, 'completed'),
    embeddingQueue.clean(oneHourAgo, 'failed')
  ]);
  
  logger.info('Queue cleanup completed');
}

export function getFileProcessingQueue() {
  if (!fileProcessingQueue) {
    throw new Error('File processing queue not initialized');
  }
  return fileProcessingQueue;
}

export function getEmbeddingQueue() {
  if (!embeddingQueue) {
    throw new Error('Embedding queue not initialized');
  }
  return embeddingQueue;
}