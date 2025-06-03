import sharp from 'sharp';
import { ContentUnit, ContentType, ProcessingResult } from '../../types/index.js';
import { logger } from '../../config/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { ollamaService } from '../../services/ollamaService.js';

export class ImageProcessor {
  async process(buffer: Buffer, fileId: string): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Processing image file: ${fileId}`);
      
      const contentUnits: ContentUnit[] = [];
      
      // Get image metadata
      const metadata = await sharp(buffer).metadata();
      
      // Resize image if too large for processing
      const maxDimension = 1024;
      let processedBuffer = buffer;
      
      if (metadata.width && metadata.height) {
        const needsResize = metadata.width > maxDimension || metadata.height > maxDimension;
        
        if (needsResize) {
          processedBuffer = await sharp(buffer)
            .resize(maxDimension, maxDimension, { 
              fit: 'inside',
              withoutEnlargement: true 
            })
            .jpeg({ quality: 85 })
            .toBuffer();
        }
      }
      
      // Generate image description using Ollama vision model
      try {
        const description = await this.generateImageDescription(processedBuffer);
        
        if (description) {
          contentUnits.push({
            id: uuidv4(),
            fileId,
            type: ContentType.IMAGE,
            content: description,
            metadata: {
              source: 'image_description',
              originalDimensions: {
                width: metadata.width,
                height: metadata.height,
              },
              format: metadata.format,
              colorSpace: metadata.space,
              hasAlpha: metadata.hasAlpha,
              density: metadata.density,
            },
            createdAt: new Date(),
          });
        }
      } catch (error: any) {
        logger.warn(`Failed to generate image description for ${fileId}: ${error.message}`);
        
        // Fallback: create a basic content unit with metadata
        contentUnits.push({
          id: uuidv4(),
          fileId,
          type: ContentType.IMAGE,
          content: `Image file: ${metadata.format} format, ${metadata.width}x${metadata.height} pixels`,
          metadata: {
            source: 'image_metadata',
            originalDimensions: {
              width: metadata.width,
              height: metadata.height,
            },
            format: metadata.format,
            colorSpace: metadata.space,
            hasAlpha: metadata.hasAlpha,
            density: metadata.density,
            processingError: error.message,
          },
          createdAt: new Date(),
        });
      }
      
      const processingMetadata = {
        dimensions: {
          width: metadata.width || 0,
          height: metadata.height || 0,
        },
        format: metadata.format,
        colorSpace: metadata.space,
        hasAlpha: metadata.hasAlpha,
        fileSize: buffer.length,
        extractedText: contentUnits.length > 0 ? 
          contentUnits[0].content.substring(0, 500) + '...' : '',
      };
      
      const processingTime = Date.now() - startTime;
      
      logger.debug(`Successfully processed image: ${fileId}, generated ${contentUnits.length} content units`);
      
      return {
        success: true,
        contentUnits,
        processingTime,
        metadata: processingMetadata,
      };
    } catch (error: any) {
      logger.error(`Failed to process image file ${fileId}:`, error);
      
      return {
        success: false,
        contentUnits: [],
        error: error.message,
        processingTime: Date.now() - startTime,
        metadata: {},
      };
    }
  }
  
  private async generateImageDescription(buffer: Buffer): Promise<string> {
    try {
      const response = await ollamaService.generateChat(
        "Describe this image in detail. Focus on objects, people, text, colors, composition, and any notable features. Be descriptive but concise.",
        undefined,
        "You are an AI assistant specialized in image analysis. Provide detailed, accurate descriptions of images."
      );
      
      return response;
    } catch (error: any) {
      logger.debug(`Image description generation failed: ${error.message}`);
      throw error;
    }
  }
}