import { PDFProcessor } from './pdfProcessor.js';
import { WordProcessor } from './wordProcessor.js';
import { ExcelProcessor } from './excelProcessor.js';
import { ImageProcessor } from './imageProcessor.js';
import { VideoProcessor } from './videoProcessor.js';
import { ProcessingResult } from '../../types/index.js';
import { logger } from '../../config/logger.js';

export class FileProcessorFactory {
  private static pdfProcessor = new PDFProcessor();
  private static wordProcessor = new WordProcessor();
  private static excelProcessor = new ExcelProcessor();
  private static imageProcessor = new ImageProcessor();
  private static videoProcessor = new VideoProcessor();

  static async processFile(
    buffer: Buffer, 
    fileId: string, 
    mimeType: string,
    filename: string
  ): Promise<ProcessingResult> {
    logger.debug(`Processing file: ${filename} (${mimeType})`);

    try {
      switch (true) {
        // PDF files
        case mimeType === 'application/pdf':
          return await this.pdfProcessor.process(buffer, fileId);

        // Word documents
        case mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case mimeType === 'application/msword':
          return await this.wordProcessor.process(buffer, fileId);

        // Excel files
        case mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        case mimeType === 'application/vnd.ms-excel':
        case mimeType === 'text/csv':
          return await this.excelProcessor.process(buffer, fileId);

        // Image files
        case mimeType.startsWith('image/'):
          return await this.imageProcessor.process(buffer, fileId);

        // Video files
        case mimeType.startsWith('video/'):
          return await this.videoProcessor.process(buffer, fileId);

        // Text files
        case mimeType.startsWith('text/'):
        case mimeType === 'application/json':
        case mimeType === 'application/xml':
          return this.processTextFile(buffer, fileId, mimeType);

        // Unsupported file types
        default:
          logger.warn(`Unsupported file type: ${mimeType} for file ${filename}`);
          return {
            success: false,
            contentUnits: [],
            error: `Unsupported file type: ${mimeType}`,
            processingTime: 0,
            metadata: { mimeType, filename },
          };
      }
    } catch (error: any) {
      logger.error(`Error processing file ${filename}:`, error);
      return {
        success: false,
        contentUnits: [],
        error: error.message,
        processingTime: 0,
        metadata: { mimeType, filename },
      };
    }
  }

  private static processTextFile(buffer: Buffer, fileId: string, mimeType: string): ProcessingResult {
    const startTime = Date.now();
    
    try {
      const text = buffer.toString('utf-8');
      const { chunkText } = require('../../utils/textUtils.js');
      const { v4: uuidv4 } = require('uuid');
      const { ContentType } = require('../../types/index.js');
      
      const chunks = chunkText(text);
      const contentUnits = chunks.map((chunk, index) => ({
        id: uuidv4(),
        fileId,
        type: ContentType.TEXT,
        content: chunk,
        metadata: {
          source: 'text_file',
          mimeType,
          chunkIndex: index,
          totalChunks: chunks.length,
        },
        createdAt: new Date(),
      }));

      return {
        success: true,
        contentUnits,
        processingTime: Date.now() - startTime,
        metadata: {
          mimeType,
          characterCount: text.length,
          wordCount: text.split(/\s+/).length,
          lineCount: text.split('\n').length,
          extractedText: text.substring(0, 500) + '...',
        },
      };
    } catch (error: any) {
      return {
        success: false,
        contentUnits: [],
        error: error.message,
        processingTime: Date.now() - startTime,
        metadata: { mimeType },
      };
    }
  }

  static getSupportedMimeTypes(): string[] {
    return [
      // Documents
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      
      // Text files
      'text/plain',
      'text/html',
      'text/css',
      'text/javascript',
      'application/json',
      'application/xml',
      'text/xml',
      'text/markdown',
      
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/bmp',
      'image/tiff',
      
      // Videos
      'video/mp4',
      'video/avi',
      'video/mov',
      'video/wmv',
      'video/flv',
      'video/webm',
      'video/mkv',
    ];
  }

  static isFileTypeSupported(mimeType: string): boolean {
    return this.getSupportedMimeTypes().includes(mimeType) ||
           mimeType.startsWith('text/') ||
           mimeType.startsWith('image/') ||
           mimeType.startsWith('video/');
  }
}