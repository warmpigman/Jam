import { Client } from 'minio';

// Determine if we're running on the server or client side
const isServer = typeof window === 'undefined';

// Use different environment variables based on where the code is running
// Server-side uses INTERNAL_MINIO_* variables
// Client-side uses PUBLIC_MINIO_* variables
const endPoint = isServer
  ? (process.env.INTERNAL_MINIO_ENDPOINT || 'minio').replace(/^https?:\/\//, '').replace(/\/$/, '')
  : (process.env.NEXT_PUBLIC_PUBLIC_MINIO_ENDPOINT || 'localhost').replace(/^https?:\/\//, '').replace(/\/$/, '');

const port = isServer
  ? parseInt(process.env.INTERNAL_MINIO_PORT || '9000')
  : parseInt(process.env.NEXT_PUBLIC_PUBLIC_MINIO_PORT || '9000');

const useSSL = isServer
  ? process.env.INTERNAL_MINIO_USE_SSL === 'true'
  : process.env.NEXT_PUBLIC_PUBLIC_MINIO_USE_SSL === 'true';

// Initialize MinIO client with access and secret keys
export const minioClient = new Client({
  endPoint,
  port,
  useSSL,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

/**
 * List all objects in a MinIO bucket
 */
export async function listObjects(bucketName: string) {
  return new Promise<any[]>((resolve, reject) => {
    const objects: any[] = [];
    const stream = minioClient.listObjects(bucketName, '', true);
    
    stream.on('data', (obj) => objects.push(obj));
    stream.on('error', reject);
    stream.on('end', () => resolve(objects));
  });
}

/**
 * Generate a presigned URL for an object in a MinIO bucket
 */
export async function getPresignedUrl(bucketName: string, objectName: string) {
  return minioClient.presignedGetObject(bucketName, objectName, 24 * 60 * 60); // 24 hours expiry
}

/**
 * Upload a file to a MinIO bucket
 */
export async function uploadObject(bucketName: string, objectName: string, fileBuffer: Buffer, metaData?: any) {
  return minioClient.putObject(bucketName, objectName, fileBuffer, metaData);
}

/**
 * Delete an object from a MinIO bucket
 */
export async function deleteObject(bucketName: string, objectName: string) {
  return minioClient.removeObject(bucketName, objectName);
}