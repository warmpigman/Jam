import { Worker } from 'bullmq';
import { logger } from '@/config/logger.js';
import { config } from '@/config/index.js';
import { getRedisClient } from '@/config/redis.js';
import { initializeQueues, getFileProcessingQueue, getEmbeddingQueue } from './queues.js';
import { processFileJob } from './processors/fileProcessor.js';
import { processEmbeddingJob, processEmbeddingBatchJob } from './processors/embeddingProcessor.js';

let fileProcessingWorker: Worker;
let embeddingWorker: Worker;
let isShuttingDown = false;

export async function startWorkers() {
  try {
    console.log('🚀 Starting workers...');
    logger.info('🚀 Starting workers...');
    
    // Initialize queues first
    console.log('Initializing queues...');
    initializeQueues();
    console.log('Queues initialized successfully');
    
    const redis = getRedisClient();
    console.log('Redis client obtained');
    
    // File Processing Worker
    console.log('Creating file processing worker...');
    fileProcessingWorker = new Worker(
      config.queues.fileProcessing,
      async (job) => {
        return await processFileJob(job);
      },
      {
        connection: redis,
        concurrency: config.processing.concurrency.fileProcessing,
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );
    console.log('File processing worker created');
    
    // Embedding Worker
    console.log('Creating embedding worker...');
    embeddingWorker = new Worker(
      config.queues.embedding,
      async (job) => {
        if (job.name === 'generate-embeddings-batch') {
          return await processEmbeddingBatchJob(job);
        } else {
          return await processEmbeddingJob(job);
        }
      },
      {
        connection: redis,
        concurrency: config.processing.concurrency.embedding,
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );
    console.log('Embedding worker created');
    
    // Enhanced worker event handlers
    setupWorkerEventHandlers();
    
    // Setup graceful shutdown
    setupGracefulShutdown();
    
    logger.info('✅ All workers started successfully', {
      fileProcessingConcurrency: config.processing.concurrency.fileProcessing,
      embeddingConcurrency: config.processing.concurrency.embedding,
      queues: [config.queues.fileProcessing, config.queues.embedding]
    });
    
  } catch (error) {
    console.error('❌ DETAILED ERROR in startWorkers:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error cause:', error instanceof Error ? error.cause : 'No cause');
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    logger.error('❌ Failed to start workers:', error);
    
    // Force exit to trigger nodemon restart with error visible
    process.exit(1);
  }
}

// function setupWorkerEventHandlers() {
//   // File Processing Worker Events
//   fileProcessingWorker.on('completed', (job, result) => {
//     logger.info(`File processing completed:`, {
//       jobId: job.id,
//       objectKey: job.data?.objectKey,
//       contentUnits: result?.contentUnits,
//       embeddingJobsQueued: result?.embeddingJobsQueued,
//       processingTime: result?.processingTime
//     });
//   });
  
//   fileProcessingWorker.on('failed', (job, err) => {
//     logger.error(`File processing failed:`, {
//       jobId: job?.id,
//       objectKey: job?.data?.objectKey,
//       error: err.message,
//       attempts: job?.attemptsMade,
//       maxAttempts: job?.opts?.attempts
//     });
//   });
  
//   fileProcessingWorker.on('error', (err) => {
//     logger.error('File processing worker error:', err);
//   });
  
//   fileProcessingWorker.on('stalled', (jobId) => {
//     logger.warn(`File processing job stalled: ${jobId}`);
//   });
  
//   // Embedding Worker Events
//   embeddingWorker.on('completed', (job, result) => {
//     logger.info(`Embedding generation completed:`, {
//       jobId: job.id,
//       jobType: job.name,
//       contentUnitId: job.data?.contentUnitId,
//       embeddingId: result?.embeddingId,
//       vectorDimensions: result?.vectorDimensions,
//       processingTime: result?.processingTime,
//       action: result?.action
//     });
//   });
  
//   embeddingWorker.on('failed', (job, err) => {
//     logger.error(`Embedding generation failed:`, {
//       jobId: job?.id,
//       jobType: job?.name,
//       contentUnitId: job?.data?.contentUnitId,
//       error: err.message,
//       attempts: job?.attemptsMade,
//       maxAttempts: job?.opts?.attempts
//     });
//   });
  
//   embeddingWorker.on('error', (err) => {
//     logger.error('Embedding worker error:', err);
//   });
  
//   embeddingWorker.on('stalled', (jobId) => {
//     logger.warn(`Embedding job stalled: ${jobId}`);
//   });
  
//   // Progress tracking for long-running jobs
//   fileProcessingWorker.on('progress', (job, progress) => {
//     logger.debug(`File processing progress:`, {
//       jobId: job.id,
//       progress: `${progress}%`,
//       objectKey: job.data?.objectKey
//     });
//   });
  
//   embeddingWorker.on('progress', (job, progress) => {
//     logger.debug(`Embedding progress:`, {
//       jobId: job.id,
//       progress: `${progress}%`,
//       contentUnitId: job.data?.contentUnitId
//     });
//   });
// }

// function setupGracefulShutdown() {
//   const gracefulShutdown = async (signal: string) => {
//     if (isShuttingDown) {
//       logger.warn('Shutdown already in progress, forcing exit...');
//       process.exit(1);
//     }
    
//     isShuttingDown = true;
//     logger.info(`📤 Received ${signal}, starting graceful shutdown...`);
    
//     try {
//       // Stop accepting new jobs
//       await Promise.all([
//         fileProcessingWorker?.close(),
//         embeddingWorker?.close()
//       ]);
      
//       // Wait for running jobs to complete (with timeout)
//       const shutdownTimeout = setTimeout(() => {
//         logger.warn('⏰ Shutdown timeout reached, forcing exit...');
//         process.exit(1);
//       }, 30000); // 30 second timeout
      
//       // Wait for workers to finish current jobs
//       await Promise.all([
//         fileProcessingWorker?.waitUntilReady(),
//         embeddingWorker?.waitUntilReady()
//       ]);
      
//       clearTimeout(shutdownTimeout);
//       logger.info('✅ Graceful shutdown completed');
//       process.exit(0);
      
//     } catch (error) {
//       logger.error('❌ Error during shutdown:', error);
//       process.exit(1);
//     }
//   };
  
//   // Handle various shutdown signals
//   process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
//   process.on('SIGINT', () => gracefulShutdown('SIGINT'));
//   process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Nodemon restart
  
//   // Handle uncaught exceptions and unhandled rejections
//   process.on('uncaughtException', (error) => {
//     console.error('🚨 UNCAUGHT EXCEPTION - FULL DETAILS:');
//     console.error('Error name:', error.name);
//     console.error('Error message:', error.message);
//     console.error('Error stack:', error.stack);
//     console.error('Error details:', error);
//     logger.error('Uncaught Exception:', error);
    
//     // Give time for the error to be displayed before shutting down
//     setTimeout(() => {
//       gracefulShutdown('uncaughtException');
//     }, 2000);
//   });
  
//   process.on('unhandledRejection', (reason, promise) => {
//     console.error('🚨 UNHANDLED REJECTION - FULL DETAILS:');
//     console.error('Promise:', promise);
//     console.error('Reason:', reason);
//     if (reason instanceof Error) {
//       console.error('Error name:', reason.name);
//       console.error('Error message:', reason.message);
//       console.error('Error stack:', reason.stack);
//     }
//     logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    
//     // Give time for the error to be displayed before shutting down
//     setTimeout(() => {
//       gracefulShutdown('unhandledRejection');
//     }, 2000);
//   });
// }

// export async function stopWorkers() {
//   if (isShuttingDown) return;
  
//   logger.info('🛑 Stopping workers...');
  
//   try {
//     await Promise.all([
//       fileProcessingWorker?.close(),
//       embeddingWorker?.close()
//     ]);
    
//     logger.info('✅ All workers stopped');
//   } catch (error) {
//     logger.error('❌ Error stopping workers:', error);
//     throw error;
//   }
// }

// // Health check function
// export async function getWorkerHealth() {
//   try {
//     const fileQueue = getFileProcessingQueue();
//     const embeddingQueue = getEmbeddingQueue();
    
//     const [fileStats, embeddingStats] = await Promise.all([
//       fileQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
//       embeddingQueue.getJobCounts('waiting', 'active', 'completed', 'failed')
//     ]);
    
//     return {
//       status: 'healthy',
//       workers: {
//         fileProcessing: {
//           isRunning: fileProcessingWorker?.isRunning() || false,
//           isPaused: fileProcessingWorker?.isPaused() || false,
//           concurrency: config.processing.concurrency.fileProcessing,
//           queue: fileStats
//         },
//         embedding: {
//           isRunning: embeddingWorker?.isRunning() || false,
//           isPaused: embeddingWorker?.isPaused() || false,
//           concurrency: config.processing.concurrency.embedding,
//           queue: embeddingStats
//         }
//       },
//       timestamp: new Date()
//     };
//   } catch (error) {
//     return {
//       status: 'unhealthy',
//       error: error instanceof Error ? error.message : 'Unknown error',
//       timestamp: new Date()
//     };
//   }
// }

// // Pause/Resume functions for maintenance
// export async function pauseWorkers() {
//   await Promise.all([
//     fileProcessingWorker?.pause(),
//     embeddingWorker?.pause()
//   ]);
//   logger.info('⏸️ All workers paused');
// }

// export async function resumeWorkers() {
//   await Promise.all([
//     fileProcessingWorker?.resume(),
//     embeddingWorker?.resume()
//   ]);
//   logger.info('▶️ All workers resumed');
// }