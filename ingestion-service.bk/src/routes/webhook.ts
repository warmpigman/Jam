import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '@/config/logger.js';
import { config } from '@/config/index.js';
import { addFileProcessingJob } from '@/workers/queues.js';

const router = Router();

// Webhook secret validation middleware
function verifyWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const providedSecret = req.headers['x-webhook-secret'] || req.headers.authorization?.replace('Bearer ', '');
  
  if (!providedSecret) {
    logger.warn('Webhook received without secret');
    return res.status(403).json({ error: 'Forbidden: Missing webhook secret' });
  }
  
  if (providedSecret !== config.minio.webhookToken) {
    logger.warn('Webhook received with invalid secret');
    return res.status(403).json({ error: 'Forbidden: Invalid webhook secret' });
  }
  
  next();
}

// MinIO webhook endpoint
router.post('/minio', verifyWebhookSecret, async (req: Request, res: Response) => {
  try {
    const notification = req.body;
    logger.info('Received MinIO notification:', JSON.stringify(notification, null, 2));

    // Handle both single event and batch events
    const records = notification.Records || [];
    
    if (!Array.isArray(records) || records.length === 0) {
      logger.warn('No records found in notification');
      return res.status(200).json({ 
        message: 'Event received but no records to process',
        timestamp: new Date().toISOString()
      });
    }

    const processedJobs = [];

    for (const record of records) {
      try {
        // Extract event information
        const eventName = record.eventName;
        const bucketName = record.s3?.bucket?.name;
        const objectKey = record.s3?.object?.key;
        const objectSize = record.s3?.object?.size || 0;
        let eTag = record.s3?.object?.eTag;
        const versionId = record.s3?.object?.versionId;

        // Clean up eTag (remove quotes if present)
        if (eTag && typeof eTag === 'string') {
          eTag = eTag.replace(/"/g, '');
        }

        // Decode object key (handle URL encoding and plus signs)
        const decodedObjectKey = objectKey ? decodeURIComponent(objectKey.replace(/\+/g, ' ')) : '';

        // Validate required fields
        if (!eventName || !bucketName || !decodedObjectKey) {
          logger.warn('Invalid record format - missing required fields:', {
            eventName,
            bucketName,
            objectKey: decodedObjectKey
          });
          continue;
        }

        // Skip directory events (objects ending with /)
        if (decodedObjectKey.endsWith('/')) {
          logger.info(`Skipping directory event: ${bucketName}/${decodedObjectKey}`);
          continue;
        }

        // Filter for relevant events
        const isObjectCreated = eventName.startsWith('s3:ObjectCreated:');
        const isObjectRemoved = eventName.startsWith('s3:ObjectRemoved:');

        if (!isObjectCreated && !isObjectRemoved) {
          logger.info(`Event not processed - irrelevant event type: ${eventName}`);
          continue;
        }

        logger.info(`Processing ${eventName} for ${bucketName}/${decodedObjectKey}`);

        // Determine event type
        const eventType: 'created' | 'deleted' | 'updated' = isObjectCreated ? 'created' : 'deleted';

        // Construct job data
        const jobData = {
          bucketName,
          objectKey: decodedObjectKey,
          objectSize,
          eTag,
          eventType,
          timestamp: new Date(),
        };

        // Add job to queue
        const job = await addFileProcessingJob(jobData);
        processedJobs.push({
          jobId: job.id,
          objectKey: decodedObjectKey,
          eventType,
          eventName
        });

        logger.info(`Successfully queued job ${job.id} for ${bucketName}/${decodedObjectKey}`);

      } catch (recordError) {
        logger.error('Error processing individual record:', {
          record,
          error: recordError instanceof Error ? recordError.message : recordError
        });
        // Continue processing other records even if one fails
      }
    }

    // Send response
    res.status(202).json({
      message: 'Webhook processed successfully',
      processedJobs,
      totalRecords: records.length,
      processedCount: processedJobs.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error processing MinIO webhook:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body
    });
    
    res.status(500).json({
      error: 'Failed to process webhook',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check for webhook endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'webhook-receiver',
    timestamp: new Date().toISOString()
  });
});

export { router as webhookRouter };