import { uploadObject } from '@/lib/minio';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic'; // Don't cache this route

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Generate a unique filename using UUID to avoid collisions
    const uuid = uuidv4();
    const originalName = file.name;
    const timestamp = Date.now();
    // Keep original filename in the object name for better readability
    // but prefix with UUID for guaranteed uniqueness
    const objectName = `${uuid}-${timestamp}-${originalName}`;
    const bucketName = 'documents';
    
    // Convert file to buffer for MinIO
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Upload to MinIO
    await uploadObject(bucketName, objectName, buffer, {
      'Content-Type': file.type,
      'X-Original-Name': originalName,
      'X-Upload-Date': new Date().toISOString(),
    });

    return NextResponse.json({ 
      message: 'File uploaded successfully',
      fileName: objectName
    });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error.message },
      { status: 500 }
    );
  }
}