import * as Minio from 'minio';
import { config } from '@/config/index.js';
import { logger } from '@/config/logger.js';

let minioClient: Minio.Client | null = null;

export function getMinioClient(): Minio.Client {
  if (!minioClient) {
    minioClient = new Minio.Client({
      endPoint: config.minio.endpoint,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
    
    logger.info(`✅ MinIO client initialized: ${config.minio.endpoint}:${config.minio.port}`);
  }
  
  return minioClient;
}

export async function getObjectStat(bucketName: string, objectKey: string): Promise<Minio.BucketItemStat | null> {
  try {
    const client = getMinioClient();
    const stat = await client.statObject(bucketName, objectKey);
    return stat;
  } catch (error: any) {
    if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
      logger.warn(`[MinioService] File not found via statObject: ${bucketName}/${objectKey}`);
      return null;
    }
    logger.error(`[MinioService] Error getting object stats for ${bucketName}/${objectKey}:`, {
      error: error.message,
      code: error.code,
      bucketName,
      objectKey
    });
    throw error;
  }
}

export async function downloadFile(bucketName: string, objectKey: string): Promise<Buffer> {
  try {
    const client = getMinioClient();
    const stream = await client.getObject(bucketName, objectKey);
    
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', (error) => {
        logger.error(`[MinioService] Stream error downloading ${bucketName}/${objectKey}:`, {
          error: error.message,
          bucketName,
          objectKey
        });
        reject(error);
      });
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        logger.info(`[MinioService] Successfully downloaded ${bucketName}/${objectKey}, size: ${buffer.length} bytes`);
        resolve(buffer);
      });
    });
    
  } catch (error: any) {
    logger.error(`[MinioService] Error downloading file ${bucketName}/${objectKey}:`, {
      error: error.message,
      bucketName,
      objectKey
    });
    throw error;
  }
}

export async function fileExists(bucketName: string, objectKey: string): Promise<boolean> {
  try {
    const client = getMinioClient();
    await client.statObject(bucketName, objectKey);
    return true;
  } catch (error) {
    return false;
  }
}

export async function deleteFile(bucketName: string, objectKey: string): Promise<void> {
  try {
    const client = getMinioClient();
    await client.removeObject(bucketName, objectKey);
    logger.info(`[MinioService] Successfully deleted file: ${bucketName}/${objectKey}`);
  } catch (error: any) {
    logger.error(`[MinioService] Error deleting file ${bucketName}/${objectKey}:`, {
      error: error.message,
      bucketName,
      objectKey
    });
    throw error;
  }
}