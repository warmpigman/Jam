import { listObjects, getPresignedUrl } from '@/lib/minio';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Don't cache this route

export async function GET() {
  try {
    // For production, ensure the bucket exists before trying to list objects
    const bucketName = 'documents';
    
    const objects = await listObjects(bucketName);
    
    const files = await Promise.all(
      objects.map(async (obj) => ({
        name: obj.name,
        size: obj.size,
        lastModified: obj.lastModified,
        url: await getPresignedUrl(bucketName, obj.name),
      }))
    );

    return NextResponse.json({ files });
  } catch (error: any) {
    console.error('Error listing files:', error);
    return NextResponse.json(
      { error: 'Failed to list files', details: error.message },
      { status: 500 }
    );
  }
}