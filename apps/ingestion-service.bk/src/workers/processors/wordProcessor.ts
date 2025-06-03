import mammoth from 'mammoth';
import { ContentUnit, ContentType, ProcessingResult } from '../../types/index.js';
import { logger } from '../../config/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { chunkText } from '../../utils/textUtils.js';

export class WordProcessor {
  async process(buffer: Buffer, fileId: string): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Processing Word document: ${fileId}`);
      
      const result = await mammoth.extractRawText({ buffer });
      const contentUnits: ContentUnit[] = [];
      
      if (result.value && result.value.trim()) {
        // Chunk the extracted text
        const chunks = chunkText(result.value);
        
        chunks.forEach((chunk, index) => {
          contentUnits.push({
            id: uuidv4(),
            fileId,
            type: ContentType.TEXT,
            content: chunk,
            metadata: {
              source: 'word_text',
              chunkIndex: index,
              totalChunks: chunks.length,
              warnings: result.messages,
            },
            createdAt: new Date(),
          });
        });
      }
      
      const metadata = {
        extractedText: result.value.substring(0, 500) + '...',
        warnings: result.messages,
        wordCount: result.value.split(/\s+/).length,
      };
      
      const processingTime = Date.now() - startTime;
      
      logger.debug(`Successfully processed Word document: ${fileId}, extracted ${contentUnits.length} chunks`);
      
      return {
        success: true,
        contentUnits,
        processingTime,
        metadata,
      };
    } catch (error: any) {
      logger.error(`Failed to process Word document ${fileId}:`, error);
      
      return {
        success: false,
        contentUnits: [],
        error: error.message,
        processingTime: Date.now() - startTime,
        metadata: {},
      };
    }
  }
}