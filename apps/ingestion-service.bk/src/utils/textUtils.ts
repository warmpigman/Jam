import { logger } from '@/config/logger.js';

/**
 * Chunks text content into smaller segments with optional overlap
 */
export function chunkText(
  content: string, 
  chunkSize: number = 1000, 
  chunkOverlap: number = 200
): string[] {
  if (!content || content.trim().length === 0) {
    return [];
  }

  const chunks: string[] = [];
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  let currentChunk = '';
  let currentLength = 0;
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    // If adding this sentence would exceed chunk size and we have content
    if (currentLength + trimmedSentence.length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      
      // Start new chunk with overlap from the end of current chunk
      if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
        currentChunk = currentChunk.slice(-chunkOverlap) + ' ' + trimmedSentence;
        currentLength = currentChunk.length;
      } else {
        currentChunk = trimmedSentence;
        currentLength = trimmedSentence.length;
      }
    } else {
      // Add sentence to current chunk
      if (currentChunk) {
        currentChunk += '. ' + trimmedSentence;
        currentLength += trimmedSentence.length + 2;
      } else {
        currentChunk = trimmedSentence;
        currentLength = trimmedSentence.length;
      }
    }
  }
  
  // Add the last chunk if it has content
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  logger.debug(`Chunked text into ${chunks.length} segments`, {
    originalLength: content.length,
    chunkSize,
    chunkOverlap
  });
  
  return chunks;
}

/**
 * Detects file type based on MIME type and content
 */
export function detectFileType(mimeType: string, extension?: string): 'text' | 'image' | 'video' | 'audio' | 'document' | 'other' {
  // Check MIME type first
  if (mimeType.startsWith('text/')) {
    return 'text';
  }
  
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  
  // Check for document types
  if (mimeType.includes('pdf') || 
      mimeType.includes('msword') || 
      mimeType.includes('wordprocessingml') ||
      mimeType.includes('spreadsheet') ||
      mimeType.includes('presentation')) {
    return 'document';
  }
  
  // Fallback to extension-based detection
  if (extension) {
    const ext = extension.toLowerCase();
    
    if (['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'py', 'java', 'cpp', 'c', 'h'].includes(ext)) {
      return 'text';
    }
    
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'ico'].includes(ext)) {
      return 'image';
    }
    
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp'].includes(ext)) {
      return 'video';
    }
    
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a'].includes(ext)) {
      return 'audio';
    }
    
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].includes(ext)) {
      return 'document';
    }
  }
  
  return 'other';
}