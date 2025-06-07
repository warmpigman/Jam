import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { minioClient } from './lib/minio.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Webhook token validation middleware
function verifyWebhookToken(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const expectedToken = process.env.MINIO_WEBHOOK_TOKEN || 'webhook-secret';
  const providedToken = req.headers['authorization']?.replace('Bearer ', '') || 
                       req.headers['x-minio-auth-token'] ||
                       req.headers['auth-token'];
  
  if (!providedToken) {
    console.log('⚠️ Webhook received without authentication token');
    res.status(403).json({ error: 'Forbidden: Missing authentication token' });
    return;
  }
  
  if (providedToken !== expectedToken) {
    console.log('⚠️ Webhook received with invalid authentication token');
    res.status(403).json({ error: 'Forbidden: Invalid authentication token' });
    return;
  }
  
  next();
}

// MinIO webhook endpoint to receive notifications
app.post('/webhook/minio', verifyWebhookToken, async (req, res) => {
  try {
    console.log('📦 MinIO webhook received:', JSON.stringify(req.body, null, 2));
    
    const { Records } = req.body;
    
    if (!Records || !Array.isArray(Records)) {
      console.log('⚠️ No records found in webhook payload');
      res.status(400).json({ error: 'No records found' });
      return;
    }

    for (const record of Records) {
      const { eventName, s3 } = record;
      
      if (eventName?.startsWith('s3:ObjectCreated:')) {
        const bucketName = s3?.bucket?.name;
        const objectKey = s3?.object?.key;
        
        console.log(`🔔 New file uploaded: ${objectKey} in bucket ${bucketName}`);
        
        // Process the uploaded file
        await processUploadedFile(bucketName, objectKey);
      } else if (eventName?.startsWith('s3:ObjectRemoved:')) {
        const bucketName = s3?.bucket?.name;
        const objectKey = s3?.object?.key;
        
        console.log(`🗑️ File deleted: ${objectKey} from bucket ${bucketName}`);
      }
    }
    
    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Function to send file to embed service
async function sendToEmbedService(fileBuffer: Buffer, fileName: string, contentType: string) {
  try {
    const embedServiceUrl = process.env.EMBED_SERVICE_URL || 'http://embed-service:8080/embed';
    
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: contentType
    });
    
    console.log(`📤 Sending ${fileName} to embed service...`);
    
    const response = await fetch(embedServiceUrl, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log(`✅ Successfully embedded ${fileName}:`, result);
      return result;
    } else {
      console.error(`❌ Embed service error for ${fileName}:`, result);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error sending ${fileName} to embed service:`, error);
    return null;
  }
}

// Function to check if file should be embedded
function shouldEmbed(contentType: string, fileName: string): boolean {
  const supportedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'];
  const supportedTextTypes = ['text/plain'];
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'];
  const textExtensions = ['.txt'];
  
  const lowerFileName = fileName.toLowerCase();
  
  return (
    supportedImageTypes.includes(contentType) ||
    supportedTextTypes.includes(contentType) ||
    imageExtensions.some(ext => lowerFileName.endsWith(ext)) ||
    textExtensions.some(ext => lowerFileName.endsWith(ext))
  );
}

// Function to process uploaded files
async function processUploadedFile(bucketName: string, objectKey: string) {
  try {
    console.log(`🔄 Processing file: ${objectKey} from bucket: ${bucketName}`);
    
    // Get object metadata
    const stat = await minioClient.statObject(bucketName, objectKey);
    console.log(`📊 File metadata:`, {
      size: stat.size,
      lastModified: stat.lastModified,
      etag: stat.etag,
      contentType: stat.metaData?.['content-type']
    });
    
    // Download the file content
    const stream = await minioClient.getObject(bucketName, objectKey);
    
    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);
    
    console.log(`📥 Downloaded file: ${objectKey} (${fileBuffer.length} bytes)`);
    
    // Check if file should be embedded
    const contentType = stat.metaData?.['content-type'] || '';
    if (shouldEmbed(contentType, objectKey)) {
      console.log(`🎯 File ${objectKey} is embeddable, sending to embed service...`);
      const embedResult = await sendToEmbedService(fileBuffer, objectKey, contentType);
      
      if (embedResult) {
        console.log(`🔗 Embed service response for ${objectKey}:`, {
          vector_id: embedResult.vector_id,
          mongo_ref: embedResult.mongo_ref
        });
      }
    } else {
      console.log(`⏭️ File ${objectKey} (${contentType}) is not supported for embedding, skipping...`);
    }
    
    // For text files, log the content with proper encoding detection
    if (contentType.includes('text') || objectKey.endsWith('.txt')) {
      try {
        // Try multiple encodings like the embed service does
        let textContent: string;
        let encoding = 'utf-8';
        
        // First try UTF-8
        try {
          textContent = fileBuffer.toString('utf-8');
          // Check if the text contains replacement characters (indicating encoding issues)
          if (textContent.includes('�')) {
            throw new Error('UTF-8 decoding produced replacement characters');
          }
        } catch {
          // Try UTF-16 LE (common for Windows text files)
          try {
            textContent = fileBuffer.toString('utf16le');
            encoding = 'utf-16le';
          } catch {
            // Try Latin-1 as fallback
            textContent = fileBuffer.toString('latin1');
            encoding = 'latin1';
          }
        }
        
        if (encoding !== 'utf-8') {
          console.log(`📝 Text file ${objectKey} decoded using ${encoding} encoding`);
        }
        
        console.log(`📄 Text content of ${objectKey}:`);
        console.log('---START---');
        console.log(textContent);
        console.log('---END---');
      } catch (error) {
        console.error(`❌ Could not decode text content of ${objectKey}:`, error);
      }
    } else {
      console.log(`📁 Binary file processed: ${objectKey} (${contentType})`);
    }
    
    console.log(`✅ Successfully processed: ${objectKey}`);
    
  } catch (error) {
    console.error(`❌ Error processing file ${objectKey}:`, error);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ingestion-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: 'Ingestion Service API',
    version: '0.0.1',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Ingestion service running on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health`);
  console.log(`🔗 MinIO webhook endpoint: http://localhost:${PORT}/webhook/minio`);
  console.log(`🔄 Environment: ${process.env.NODE_ENV || 'development'}`);
});
