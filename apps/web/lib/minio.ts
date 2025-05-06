// apps/web/lib/minio.ts
import { Client as MinioClient, BucketItem } from 'minio'

const {
  NEXT_PUBLIC_MINIO_ENDPOINT,
  NEXT_PUBLIC_MINIO_PORT,
  NEXT_PUBLIC_MINIO_USE_SSL,
  MINIO_ROOT_USER,
  MINIO_ROOT_PASSWORD,
} = process.env

if (
  !NEXT_PUBLIC_MINIO_ENDPOINT ||
  !MINIO_ROOT_USER ||
  !MINIO_ROOT_PASSWORD
) {
  throw new Error('Missing MinIO environment variables')
}

export const minioClient = new MinioClient({
  endPoint: NEXT_PUBLIC_MINIO_ENDPOINT,
  port: NEXT_PUBLIC_MINIO_PORT ? parseInt(NEXT_PUBLIC_MINIO_PORT) : 9000,
  useSSL: NEXT_PUBLIC_MINIO_USE_SSL === 'true',
  accessKey: MINIO_ROOT_USER,
  secretKey: MINIO_ROOT_PASSWORD,
})

// ensure a bucket exists (idempotent)
export async function ensureBucket(bucketName: string) {
  const exists = await minioClient.bucketExists(bucketName)
  if (!exists) {
    await minioClient.makeBucket(bucketName, '')
  }
}

// upload a buffer or stream
export async function uploadObject(
  bucketName: string,
  objectName: string,
  buffer: Buffer | NodeJS.ReadableStream,
  meta?: Record<string, string>
) {
  await ensureBucket(bucketName)
  return minioClient.putObject(bucketName, objectName, buffer, meta)
}

// generate a presigned GET URL
export function getPresignedUrl(
  bucketName: string,
  objectName: string,
  expires = 24 * 60 * 60 // default 1 day
): Promise<string> {
  return minioClient.presignedGetObject(bucketName, objectName, expires)
}

// list objects in a bucket (optionally with prefix)
export function listObjects(
  bucketName: string,
  prefix = ''
): Promise<BucketItem[]> {
  return new Promise((resolve, reject) => {
    const items: BucketItem[] = []
    const stream = minioClient.listObjectsV2(bucketName, prefix, true)
    stream.on('data', (item) => items.push(item))
    stream.on('error', reject)
    stream.on('end', () => resolve(items))
  })
}
