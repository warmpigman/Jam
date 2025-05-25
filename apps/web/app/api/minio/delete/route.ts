import { deleteObject } from '@/lib/minio';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Don't cache this route

export async function DELETE(request: NextRequest) {
  // Extract the file path from the URL parameters
  const url = new URL(request.url);
  const bucketName = url.searchParams.get('bucket') || 'documents';
  const objectName = url.searchParams.get('objectName');

  if (!objectName) {
    return NextResponse.json(
      { error: 'No object name provided' },
      { status: 400 }
    );
  }

  try {
    // Delete the file from MinIO
    await deleteObject(bucketName, objectName);
    
    return NextResponse.json({ 
      message: 'File deleted successfully',
      objectName: objectName 
    });
  } catch (error: any) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { error: 'Failed to delete file', details: error.message },
      { status: 500 }
    );
  }
}