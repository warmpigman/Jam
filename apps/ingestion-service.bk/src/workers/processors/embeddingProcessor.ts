import { Job } from 'bullmq';
import { logger } from '@/config/logger.js';
import { config } from '@/config/index.js';
import { ContentUnitModel } from '@/models/ContentUnit.js';
import { EmbeddingRecordModel } from '@/models/EmbeddingRecord.js';
import { FileMetadataModel } from '@/models/FileMetadata.js';
import { ProcessingStatus, ContentType } from '@/types/index.js';
import { connectDatabase } from '@/config/database.js';
import { EmbeddingJobData, EmbeddingBatchJobData } from '../queues.js';
import crypto from 'crypto';

// Enhanced embedding service interfaces
interface EmbeddingService {
  generateEmbedding(content: string, contentType: ContentType): Promise<number[]>;
  getDimensions(): number;
  getModelName(): string;
  isHealthy(): Promise<boolean>;
}

// Ollama embedding service implementation
class OllamaEmbeddingService implements EmbeddingService {
  private baseUrl: string;
  private model: string;
  private dimensions: number;

  constructor() {
    this.baseUrl = config.ollama.baseUrl;
    this.model = config.ollama.embeddingModel;
    this.dimensions = config.ollama.embeddingDimensions;
  }

  getModelName(): string {
    return this.model;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      return response.ok;
    } catch (error) {
      logger.error('[EmbeddingProcessor] Ollama health check failed:', error);
      return false;
    }
  }

  async generateEmbedding(content: string, contentType: ContentType): Promise<number[]> {
    try {
      // Prepare the prompt based on content type
      const prompt = this.preparePrompt(content, contentType);
      
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt
        }),
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      if (!result.embedding || !Array.isArray(result.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }

      logger.debug('[EmbeddingProcessor] Generated embedding via Ollama:', {
        contentLength: content.length,
        contentType,
        embeddingDimensions: result.embedding.length,
        model: this.model
      });

      return result.embedding;

    } catch (error: any) {
      logger.error('[EmbeddingProcessor] Ollama embedding generation failed:', {
        error: error.message,
        contentType,
        contentLength: content.length,
        model: this.model,
        baseUrl: this.baseUrl
      });
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  private preparePrompt(content: string, contentType: ContentType): string {
    switch (contentType) {
      case ContentType.TEXT:
        return content;
      case ContentType.IMAGE:
        return `Image file: ${content}`;
      default:
        return content;
    }
  }
}

// Mock embedding service for development/testing
class MockEmbeddingService implements EmbeddingService {
  getDimensions(): number {
    return 1536;
  }

  getModelName(): string {
    return 'mock-embedding-service';
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async generateEmbedding(content: string, contentType: ContentType): Promise<number[]> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));
    
    // Generate deterministic mock embedding
    const hash = crypto.createHash('sha256').update(`${content}-${contentType}`).digest();
    const embedding = [];
    
    for (let i = 0; i < this.getDimensions(); i++) {
      const hashIndex = i % hash.length;
      const hashValue = hash.at(hashIndex);
      if (hashValue !== undefined) {
        const value = (hashValue - 128) / 128;
        embedding.push(value);
      } else {
        embedding.push(0);
      }
    }
    
    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }
}

// Initialize embedding service based on configuration
function createEmbeddingService(): EmbeddingService {
  if (config.embedding.provider === 'ollama') {
    return new OllamaEmbeddingService();
  } else {
    logger.warn('[EmbeddingProcessor] Using mock embedding service for development');
    return new MockEmbeddingService();
  }
}

const embeddingService = createEmbeddingService();

export async function processEmbeddingJob(job: Job<EmbeddingJobData>): Promise<any> {
  const startTime = Date.now();
  const { contentUnitId, contentType, content, metadata } = job.data;
  
  logger.info(`[EmbeddingProcessor] Starting embedding job: ${job.id}`, { 
    contentUnitId, 
    contentType,
    contentLength: content?.length || 0,
    jobId: job.id
  });
  
  try {
    await connectDatabase();
    
    // Step 1: Validate embedding service health
    const isServiceHealthy = await embeddingService.isHealthy();
    if (!isServiceHealthy) {
      throw new Error('Embedding service is not available');
    }
    
    // Step 2: Find and validate content unit
    const contentUnit = await ContentUnitModel.findById(contentUnitId);
    if (!contentUnit) {
      throw new Error(`Content unit not found: ${contentUnitId}`);
    }
    
    // Update content unit status to processing
    contentUnit.status = ProcessingStatus.PROCESSING_EMBEDDING;
    contentUnit.lastAttemptedAt = new Date();
    contentUnit.processingAttempts = (contentUnit.processingAttempts || 0) + 1;
    await contentUnit.save();
    
    // Step 3: Check for existing embedding
    const existingEmbedding = await EmbeddingRecordModel.findOne({ contentId: contentUnitId });
    
    // Step 4: Generate embedding
    logger.debug(`[EmbeddingProcessor] Generating embedding for content unit: ${contentUnitId}`);
    const vector = await embeddingService.generateEmbedding(content, contentType as ContentType);
    
    if (!vector || vector.length === 0) {
      throw new Error('Generated embedding is empty');
    }
    
    // Step 5: Create or update embedding record
    let embeddingRecord;
    let action: string;
    
    if (existingEmbedding) {
      logger.info(`[EmbeddingProcessor] Updating existing embedding: ${existingEmbedding._id}`);
      
      existingEmbedding.vector = vector;
      existingEmbedding.modelName = embeddingService.getModelName();
      existingEmbedding.dimensions = vector.length;
      
      embeddingRecord = await existingEmbedding.save();
      action = 'updated';
      
    } else {
      logger.info(`[EmbeddingProcessor] Creating new embedding record for: ${contentUnitId}`);
      
      embeddingRecord = new EmbeddingRecordModel({
        contentId: contentUnitId,
        vector,
        modelName: embeddingService.getModelName(),
        dimensions: vector.length,
        createdAt: new Date()
      });
      
      embeddingRecord = await embeddingRecord.save();
      action = 'created';
    }
    
    // Step 6: Update content unit with success status
    contentUnit.status = ProcessingStatus.COMPLETED_EMBEDDING;
    contentUnit.embeddingId = (embeddingRecord._id as any).toString();
    contentUnit.processedAt = new Date();
    contentUnit.error = undefined;
    await contentUnit.save();
    
    // Step 7: Update file metadata embedding progress
    await updateFileEmbeddingProgress(contentUnit.fileId);
    
    const processingTime = Date.now() - startTime;
    const result = {
      success: true,
      action,
      contentUnitId,
      embeddingId: (embeddingRecord._id as any).toString(),
      contentType,
      vectorDimensions: vector.length,
      model: embeddingService.getModelName(),
      processingTime
    };
    
    logger.info(`[EmbeddingProcessor] Embedding job completed:`, result);
    return result;
    
  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    logger.error(`[EmbeddingProcessor] Embedding job failed: ${job.id}`, {
      error: error.message,
      contentUnitId,
      contentType,
      processingTime,
      stack: error.stack
    });
    
    // Update content unit with error status
    await updateContentUnitOnError(contentUnitId, error.message);
    
    throw error;
  }
}

export async function processEmbeddingBatchJob(job: Job<EmbeddingBatchJobData>): Promise<any> {
  const startTime = Date.now();
  const { contentUnitIds, batchSize = 10, metadata } = job.data;
  
  logger.info(`[EmbeddingProcessor] Starting batch embedding job: ${job.id}`, { 
    contentUnitCount: contentUnitIds.length,
    batchSize,
    jobId: job.id
  });
  
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
    processingTime: 0,
    processedUnits: [] as string[],
    failedUnits: [] as string[]
  };
  
  try {
    await connectDatabase();
    
    // Validate embedding service health
    const isServiceHealthy = await embeddingService.isHealthy();
    if (!isServiceHealthy) {
      throw new Error('Embedding service is not available for batch processing');
    }
    
    // Process content units in batches
    for (let i = 0; i < contentUnitIds.length; i += batchSize) {
      const batch = contentUnitIds.slice(i, i + batchSize);
      
      logger.debug(`[EmbeddingProcessor] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(contentUnitIds.length / batchSize)}`, {
        batchSize: batch.length,
        startIndex: i
      });
      
      // Process batch items in parallel with individual error handling
      const batchResults = await Promise.allSettled(
        batch.map(async (contentUnitId: string) => {
          try {
            const contentUnit = await ContentUnitModel.findById(contentUnitId);
            if (!contentUnit) {
              throw new Error(`Content unit not found: ${contentUnitId}`);
            }
            
            // Update status to processing
            contentUnit.status = ProcessingStatus.PROCESSING_EMBEDDING;
            contentUnit.lastAttemptedAt = new Date();
            await contentUnit.save();
            
            // Generate embedding
            const vector = await embeddingService.generateEmbedding(
              contentUnit.content,
              contentUnit.type
            );
            
            // Create embedding record
            const embeddingRecord = new EmbeddingRecordModel({
              contentId: contentUnitId,
              vector,
              modelName: embeddingService.getModelName(),
              dimensions: vector.length,
              createdAt: new Date()
            });
            
            await embeddingRecord.save();
            
            // Update content unit
            contentUnit.status = ProcessingStatus.COMPLETED_EMBEDDING;
            contentUnit.embeddingId = (embeddingRecord._id as any).toString();
            contentUnit.processedAt = new Date();
            contentUnit.error = undefined;
            await contentUnit.save();
            
            // Update file embedding progress
            await updateFileEmbeddingProgress(contentUnit.fileId);
            
            results.success++;
            results.processedUnits.push(contentUnitId);
            
            return { success: true, contentUnitId, embeddingId: (embeddingRecord._id as any).toString() };
            
          } catch (error: any) {
            const errorMessage = error.message || 'Unknown error during batch processing';
            results.failed++;
            results.errors.push(`${contentUnitId}: ${errorMessage}`);
            results.failedUnits.push(contentUnitId);
            
            // Update content unit with error status
            await updateContentUnitOnError(contentUnitId, errorMessage);
            
            logger.error(`[EmbeddingProcessor] Batch item failed:`, {
              contentUnitId,
              error: errorMessage,
              batchJobId: job.id
            });
            
            return { success: false, contentUnitId, error: errorMessage };
          }
        })
      );
      
      // Log batch completion
      const batchSuccesses = batchResults.filter(r => r.status === 'fulfilled').length;
      const batchFailures = batchResults.filter(r => r.status === 'rejected').length;
      
      logger.info(`[EmbeddingProcessor] Batch ${Math.floor(i / batchSize) + 1} completed:`, {
        successes: batchSuccesses,
        failures: batchFailures,
        totalProcessed: i + batch.length
      });
      
      // Rate limiting between batches
      if (i + batchSize < contentUnitIds.length) {
        const delay = config.processing.batchDelay || 1000;
        logger.debug(`[EmbeddingProcessor] Waiting ${delay}ms before next batch`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    results.processingTime = Date.now() - startTime;
    
    logger.info(`[EmbeddingProcessor] Batch embedding job completed:`, {
      jobId: job.id,
      totalUnits: contentUnitIds.length,
      ...results
    });
    
    return results;
    
  } catch (error: any) {
    results.processingTime = Date.now() - startTime;
    logger.error(`[EmbeddingProcessor] Batch embedding job failed: ${job.id}`, {
      error: error.message,
      ...results
    });
    throw error;
  }
}

// Helper function to update file metadata embedding progress
async function updateFileEmbeddingProgress(fileId: string): Promise<void> {
  try {
    // Count completed embeddings for this file
    const totalUnits = await ContentUnitModel.countDocuments({ fileId });
    const completedUnits = await ContentUnitModel.countDocuments({ 
      fileId, 
      status: ProcessingStatus.COMPLETED_EMBEDDING 
    });
    
    const pendingUnits = await ContentUnitModel.countDocuments({ 
      fileId, 
      status: { $in: [ProcessingStatus.PENDING_EMBEDDING, ProcessingStatus.PROCESSING_EMBEDDING] }
    });
    
    const failedUnits = await ContentUnitModel.countDocuments({ 
      fileId, 
      status: ProcessingStatus.FAILED_EMBEDDING 
    });
    
    // Update file metadata
    const updateData: any = {
      embeddingProgress: {
        total: totalUnits,
        completed: completedUnits,
        pending: pendingUnits,
        failed: failedUnits,
        lastUpdated: new Date()
      }
    };
    
    // Update overall file status if all embeddings are complete
    if (completedUnits === totalUnits && totalUnits > 0) {
      updateData.status = ProcessingStatus.COMPLETED;
    } else if (completedUnits > 0 || pendingUnits > 0) {
      updateData.status = ProcessingStatus.PENDING_EMBEDDING;
    }
    
    await FileMetadataModel.findByIdAndUpdate(fileId, updateData);
    
    logger.debug(`[EmbeddingProcessor] Updated file embedding progress:`, {
      fileId,
      progress: updateData.embeddingProgress,
      status: updateData.status
    });
    
  } catch (error: any) {
    logger.error(`[EmbeddingProcessor] Failed to update file embedding progress:`, {
      error: error.message,
      fileId
    });
  }
}

// Helper function to update content unit on error
async function updateContentUnitOnError(contentUnitId: string, errorMessage: string): Promise<void> {
  try {
    await ContentUnitModel.findByIdAndUpdate(contentUnitId, {
      status: ProcessingStatus.FAILED_EMBEDDING,
      error: errorMessage,
      processedAt: new Date(),
      lastAttemptedAt: new Date(),
      $inc: { processingAttempts: 1 }
    });
    
    logger.debug(`[EmbeddingProcessor] Updated content unit error status:`, {
      contentUnitId,
      error: errorMessage
    });
    
  } catch (dbError: any) {
    logger.error(`[EmbeddingProcessor] Failed to update content unit error status:`, {
      error: dbError.message,
      contentUnitId
    });
  }
}