import { Job } from 'bullmq';
import { FileProcessingJobData } from '../queues.js';
import { downloadFile, getObjectStat } from '../../services/minioService.js';
import { getMongoDb } from '../../services/mongoService.js';
import { LanceDBService } from '../../services/lancedbService.js';
import { FileProcessorFactory } from './index.js';
import { logger } from '../../config/logger.js';
import { IFileMetadata, FileMetadataModel } from '../../models/FileMetadata.js';
import { IContentUnit, ContentUnitModel } from '../../models/ContentUnit.js';
import { IEmbeddingRecord } from '../../models/EmbeddingRecord.js';
import { config } from '../../config/index.js';
import { addEmbeddingJob } from '../queues.js';
import { ProcessingStatus } from '../../types/index.js';

// Create LanceDB service instance
const lancedbService = new LanceDBService();

export async function processFileJob(job: Job<FileProcessingJobData>) {
  const { bucketName, objectKey, eventType, metadata } = job.data;
  const jobId = job.id;

  logger.info(`Processing file job ${jobId}:`, {
    bucketName,
    objectKey,
    eventType,
  });

  const startTime = Date.now();

  try {
    // Handle delete events
    if (eventType === 'deleted') {
      await handleFileDelete(objectKey);
      return { success: true, message: 'File deleted successfully' };
    }

    // Get file from MinIO
    const fileBuffer = await downloadFile(bucketName, objectKey);
    const fileSize = fileBuffer.length;

    // Get file metadata
    const stat = await getObjectStat(bucketName, objectKey);
    if (!stat) {
      throw new Error(`File not found: ${bucketName}/${objectKey}`);
    }
    
    const mimeType = stat.metaData?.['content-type'] || 'application/octet-stream';
    const filename = objectKey.split('/').pop() || objectKey;

    // Check if file type is supported
    if (!FileProcessorFactory.isFileTypeSupported(mimeType)) {
      logger.warn(`Unsupported file type: ${mimeType} for ${objectKey}`);
      return { 
        success: false, 
        error: `Unsupported file type: ${mimeType}`,
        supportedTypes: FileProcessorFactory.getSupportedMimeTypes()
      };
    }

    const db = await getMongoDb();

    // Create or update file metadata
    const fileMetadata = new FileMetadataModel({
      bucketName,
      objectKey,
      fileName: filename,
      fileSize: fileSize,
      mimeType,
      uploadedAt: new Date(),
      status: ProcessingStatus.PROCESSING,
      processingStartedAt: new Date(),
    });

    await fileMetadata.save();

    // Process the file
    const processingResult = await FileProcessorFactory.processFile(
      fileBuffer,
      objectKey,
      mimeType,
      filename
    );

    if (!processingResult.success) {
      // Update file metadata with error
      fileMetadata.status = ProcessingStatus.FAILED;
      fileMetadata.error = processingResult.error;
      await fileMetadata.save();
      
      throw new Error(processingResult.error || 'File processing failed');
    }

    // Save content units to MongoDB
    const savedContentUnits = [];
    for (const contentUnit of processingResult.contentUnits) {
      const newContentUnit = new ContentUnitModel({
        fileId: objectKey,
        type: contentUnit.type,
        content: contentUnit.content,
        metadata: contentUnit.metadata,
        pageNumber: contentUnit.pageNumber,
        timestamp: contentUnit.timestamp,
        coordinates: contentUnit.coordinates,
        status: ProcessingStatus.PENDING,
        createdAt: new Date(),
      });
      
      const savedUnit = await newContentUnit.save();
      savedContentUnits.push(savedUnit);
    }

    // Update file metadata
    fileMetadata.status = ProcessingStatus.COMPLETED;
    fileMetadata.processedAt = new Date();
    fileMetadata.contentUnitsCount = savedContentUnits.length;
    await fileMetadata.save();

    // Queue embedding jobs for each content unit
    const embeddingJobs = savedContentUnits.map(unit => ({
      contentUnitId: unit.id,
      contentType: unit.type,
      content: unit.content,
      metadata: {
        fileId: objectKey,
        filename,
        mimeType,
        ...unit.metadata,
      },
    }));

    // Add embedding jobs to queue
    for (const embeddingJobData of embeddingJobs) {
      await addEmbeddingJob(embeddingJobData);
    }

    const processingTime = Date.now() - startTime;
    
    logger.info(`File processing completed for ${objectKey}:`, {
      jobId,
      processingTime,
      contentUnitsCount: savedContentUnits.length,
      embeddingJobsQueued: embeddingJobs.length,
    });

    return {
      success: true,
      fileId: objectKey,
      contentUnitsCount: savedContentUnits.length,
      embeddingJobsQueued: embeddingJobs.length,
      processingTime,
      metadata: processingResult.metadata,
    };

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`File processing failed for ${objectKey}:`, {
      jobId,
      error: error.message,
      processingTime,
    });

    // Update file metadata with error
    try {
      const fileToUpdate = await FileMetadataModel.findOne({ objectKey });
      if (fileToUpdate) {
        fileToUpdate.status = ProcessingStatus.FAILED;
        fileToUpdate.error = error.message;
        fileToUpdate.lastAttemptedAt = new Date();
        await fileToUpdate.save();
      }
    } catch (updateError: any) {
      logger.error(`Failed to update file metadata with error:`, updateError);
    }

    throw error;
  }
}

async function handleFileDelete(objectKey: string) {
  logger.info(`Handling file deletion for: ${objectKey}`);

  try {
    // Get file metadata
    const fileMetadata = await FileMetadataModel.findOne({ objectKey });
    if (!fileMetadata) {
      logger.warn(`File metadata not found for deletion: ${objectKey}`);
      return;
    }

    // Get all content units for this file
    const contentUnits = await ContentUnitModel.find({ fileId: objectKey });
    
    // Delete from LanceDB
    if (contentUnits.length > 0) {
      await lancedbService.deleteEmbeddings(objectKey);
      logger.info(`Deleted embeddings from LanceDB for file: ${objectKey}`);
    }

    // Delete content units from MongoDB
    await ContentUnitModel.deleteMany({ fileId: objectKey });
    
    // Delete file metadata
    await FileMetadataModel.deleteOne({ objectKey });

    logger.info(`Successfully deleted all data for file: ${objectKey}`);
  } catch (error: any) {
    logger.error(`Error deleting file data for ${objectKey}:`, error);
    throw error;
  }
}