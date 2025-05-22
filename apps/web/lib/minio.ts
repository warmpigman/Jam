import { Client } from 'minio';

// Determine if we're running on the server or client side
const isServer = typeof window === 'undefined';

// For both server and client, we use the same domain (s3.jam.local)
// This ensures consistent signatures for presigned URLs
const minioEndpoint = process.env.NEXT_PUBLIC_PUBLIC_MINIO_ENDPOINT || 's3.jam.local';
const minioPort = parseInt(process.env.NEXT_PUBLIC_PUBLIC_MINIO_PORT || '80');
const useSSL = process.env.NEXT_PUBLIC_PUBLIC_MINIO_USE_SSL === 'true';

// For debugging purposes, log the DNS lookup before creating the client
if (isServer) {
  console.log(`Attempting to connect to MinIO at ${minioEndpoint}:${minioPort}`);
  
  // Add a DNS check using Node's dns module
  const dns = require('dns');
  dns.lookup(minioEndpoint, (err, address, family) => {
    if (err) {
      console.error(`DNS lookup error for ${minioEndpoint}:`, err);
    } else {
      console.log(`DNS lookup for ${minioEndpoint} resolved to ${address} (IPv${family})`);
    }
  });
}

// Use the same client configuration for both server and client
// This ensures signatures are always calculated the same way
export const minioClient = new Client({
  endPoint: minioEndpoint,
  port: minioPort,
  useSSL,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

// For debugging connection issues
if (isServer) {
  console.log('MinIO connection settings:');
  console.log(`Endpoint: ${minioEndpoint}`);
  console.log(`Port: ${minioPort}`);
  console.log(`Use SSL: ${useSSL}`);
  console.log(`Access Key: ${process.env.MINIO_ACCESS_KEY ? '***' : 'minioadmin'}`);
}

/**
 * List all objects in a MinIO bucket
 */
export async function listObjects(bucketName: string) {
  return new Promise<any[]>((resolve, reject) => {
    try {
      const objects: any[] = [];
      const stream = minioClient.listObjects(bucketName, '', true);
      
      stream.on('data', (obj) => objects.push(obj));
      stream.on('error', (err) => {
        console.error('MinIO listObjects error:', err);
        reject(err);
      });
      stream.on('end', () => resolve(objects));
    } catch (error) {
      console.error('Failed to create MinIO list stream:', error);
      reject(error);
    }
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