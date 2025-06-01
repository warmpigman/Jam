import pdfParse from 'pdf-parse';
import { ContentUnit, ContentType, ProcessingResult } from '../../types/index.js';
import { logger } from '../../config/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { chunkText } from '../../utils/textUtils.js';

export class PDFProcessor {
  async process(buffer: Buffer, fileId: string): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Processing PDF file: ${fileId}`);
      
      const data = await pdfParse(buffer);
      const contentUnits: ContentUnit[] = [];
      
      // Extract text content
      if (data.text && data.text.trim()) {
        // Chunk the text
        const chunks = chunkText(data.text);
        
        chunks.forEach((chunk, index) => {
          contentUnits.push({
            id: uuidv4(),
            fileId,
            type: ContentType.TEXT,
            content: chunk,
            metadata: {
              source: 'pdf_text',
              chunkIndex: index,
              totalChunks: chunks.length,
            },
            createdAt: new Date(),
          });
        });
      }
      
      // Extract metadata from PDF info
      const metadata = {
        pageCount: data.numpages,
        extractedText: data.text.substring(0, 500) + '...', // Preview
        info: data.info,
      };
      
      const processingTime = Date.now() - startTime;
      
      logger.debug(`Successfully processed PDF: ${fileId}, extracted ${contentUnits.length} chunks from ${data.numpages} pages`);
      
      return {
        success: true,
        contentUnits,
        processingTime,
        metadata,
      };
    } catch (error: any) {
      logger.error(`Failed to process PDF file ${fileId}:`, error);
      
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