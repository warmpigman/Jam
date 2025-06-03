// Note: fluent-ffmpeg requires installation via npm install fluent-ffmpeg @types/fluent-ffmpeg
// For now, using a conditional import to handle missing dependency
let ffmpeg: any;
try {
  ffmpeg = require('fluent-ffmpeg');
} catch (error) {
  console.warn('fluent-ffmpeg not installed. Video processing will be disabled.');
}

import { ContentUnit, ContentType, ProcessingResult } from '../../types/index.js';
import { logger } from '../../config/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { OllamaService } from '../../services/ollamaService.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ollamaService = new OllamaService();

export class VideoProcessor {
  async process(buffer: Buffer, fileId: string): Promise<ProcessingResult> {
    const startTime = Date.now();
    let tempVideoPath: string | null = null;
    let tempFramePaths: string[] = [];
    
    try {
      logger.debug(`Processing video file: ${fileId}`);
      
      const contentUnits: ContentUnit[] = [];
      
      // Create temporary file for video processing
      tempVideoPath = path.join(os.tmpdir(), `${fileId}_video.mp4`);
      fs.writeFileSync(tempVideoPath, buffer);
      
      // Extract video metadata
      const metadata = await this.getVideoMetadata(tempVideoPath);
      
      // Extract key frames from video
      const frameCount = Math.min(5, Math.floor(metadata.duration / 30)); // Max 5 frames, one every 30 seconds
      tempFramePaths = await this.extractFrames(tempVideoPath, frameCount);
      
      // Process each extracted frame
      for (let i = 0; i < tempFramePaths.length; i++) {
        try {
          const framePath = tempFramePaths[i];
          if (framePath) {
            const frameBuffer = fs.readFileSync(framePath);
            const frameDescription = await this.generateFrameDescription(frameBuffer);
            
            if (frameDescription) {
              contentUnits.push({
                id: uuidv4(),
                fileId,
                type: ContentType.VIDEO_FRAME,
                content: frameDescription,
                metadata: {
                  source: 'video_frame',
                  frameIndex: i,
                  totalFrames: frameCount,
                  timestamp: Math.floor((metadata.duration / frameCount) * i),
                },
                timestamp: Math.floor((metadata.duration / frameCount) * i),
                createdAt: new Date(),
              });
            }
          }
        } catch (error: any) {
          logger.warn(`Failed to process frame ${i} for video ${fileId}: ${error.message}`);
        }
      }
      
      // Create a summary content unit
      if (contentUnits.length > 0) {
        const summary = this.generateVideoSummary(contentUnits, metadata);
        contentUnits.unshift({
          id: uuidv4(),
          fileId,
          type: ContentType.TEXT,
          content: summary,
          metadata: {
            source: 'video_summary',
            frameCount: contentUnits.length,
            duration: metadata.duration,
          },
          createdAt: new Date(),
        });
      }
      
      const processingMetadata = {
        duration: metadata.duration,
        dimensions: {
          width: metadata.width,
          height: metadata.height,
        },
        frameRate: metadata.frameRate,
        bitrate: metadata.bitrate,
        format: metadata.format,
        framesExtracted: frameCount,
        extractedText: contentUnits.length > 0 && contentUnits[0]?.content ? 
          contentUnits[0].content.substring(0, 500) + '...' : '',
      };
      
      const processingTime = Date.now() - startTime;
      
      logger.debug(`Successfully processed video: ${fileId}, extracted ${contentUnits.length} content units from ${frameCount} frames`);
      
      return {
        success: true,
        contentUnits,
        processingTime,
        metadata: processingMetadata,
      };
    } catch (error: any) {
      logger.error(`Failed to process video file ${fileId}:`, error);
      
      return {
        success: false,
        contentUnits: [],
        error: error.message,
        processingTime: Date.now() - startTime,
        metadata: {},
      };
    } finally {
      // Cleanup temporary files
      this.cleanup(tempVideoPath, tempFramePaths);
    }
  }
  
  private async getVideoMetadata(videoPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err: any, metadata: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        const videoStream = metadata.streams.find((stream: any) => stream.codec_type === 'video');
        
        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          frameRate: eval(videoStream?.r_frame_rate || '0/1'),
          bitrate: metadata.format.bit_rate ? parseInt(metadata.format.bit_rate) : 0,
          format: metadata.format.format_name,
          size: metadata.format.size,
        });
      });
    });
  }
  
  private async extractFrames(videoPath: string, frameCount: number): Promise<string[]> {
    const framePaths: string[] = [];
    const tempDir = os.tmpdir();
    
    return new Promise((resolve, reject) => {
      const baseFilename = path.basename(videoPath, path.extname(videoPath));
      const outputPattern = path.join(tempDir, `${baseFilename}_frame_%03d.jpg`);
      
      ffmpeg(videoPath)
        .screenshots({
          count: frameCount,
          folder: tempDir,
          filename: `${baseFilename}_frame_%03d.jpg`,
          size: '512x?'
        })
        .on('end', () => {
          // Generate the expected frame paths
          for (let i = 1; i <= frameCount; i++) {
            const framePath = path.join(tempDir, `${baseFilename}_frame_${i.toString().padStart(3, '0')}.jpg`);
            if (fs.existsSync(framePath)) {
              framePaths.push(framePath);
            }
          }
          resolve(framePaths);
        })
        .on('error', reject);
    });
  }
  
  private async generateFrameDescription(frameBuffer: Buffer): Promise<string> {
    try {
      const response = await ollamaService.generateChat(
        "Describe what you see in this video frame. Focus on objects, people, actions, text, and scene composition. Be descriptive but concise.",
        undefined,
        "You are an AI assistant specialized in video frame analysis. Provide detailed descriptions of video frames."
      );
      
      return response;
    } catch (error: any) {
      logger.debug(`Frame description generation failed: ${error.message}`);
      throw error;
    }
  }
  
  private generateVideoSummary(frameUnits: ContentUnit[], metadata: any): string {
    const descriptions = frameUnits
      .filter(unit => unit.type === ContentType.VIDEO_FRAME)
      .map(unit => unit.content);
    
    const duration = Math.floor(metadata.duration);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    
    let summary = `Video Summary (${minutes}:${seconds.toString().padStart(2, '0')}):\n\n`;
    
    descriptions.forEach((desc, index) => {
      const timestamp = Math.floor((metadata.duration / descriptions.length) * index);
      const min = Math.floor(timestamp / 60);
      const sec = timestamp % 60;
      summary += `[${min}:${sec.toString().padStart(2, '0')}] ${desc}\n\n`;
    });
    
    return summary.trim();
  }
  
  private cleanup(videoPath: string | null, framePaths: string[]): void {
    try {
      if (videoPath && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      
      framePaths.forEach(framePath => {
        if (fs.existsSync(framePath)) {
          fs.unlinkSync(framePath);
        }
      });
    } catch (error: any) {
      logger.warn('Failed to cleanup temporary files:', error.message);
    }
  }
}