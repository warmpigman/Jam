import * as XLSX from 'xlsx';
import { ContentUnit, ContentType, ProcessingResult } from '../../types/index.js';
import { logger } from '../../config/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { chunkText } from '../../utils/textUtils.js';

export class ExcelProcessor {
  async process(buffer: Buffer, fileId: string): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Processing Excel file: ${fileId}`);
      
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const contentUnits: ContentUnit[] = [];
      let totalRows = 0;
      let totalCells = 0;
      
      // Process each worksheet
      workbook.SheetNames.forEach((sheetName, sheetIndex) => {
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert sheet to JSON for easier processing
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '',
          raw: false 
        });
        
        if (jsonData.length > 0) {
          // Convert sheet data to text format
          const sheetText = this.convertSheetToText(jsonData as any[][], sheetName);
          
          if (sheetText.trim()) {
            // Chunk the sheet content
            const chunks = chunkText(sheetText);
            
            chunks.forEach((chunk, index) => {
              contentUnits.push({
                id: uuidv4(),
                fileId,
                type: ContentType.TEXT,
                content: chunk,
                metadata: {
                  source: 'excel_sheet',
                  sheetName,
                  sheetIndex,
                  chunkIndex: index,
                  totalChunks: chunks.length,
                  rowCount: jsonData.length,
                },
                createdAt: new Date(),
              });
            });
          }
          
          totalRows += jsonData.length;
          totalCells += jsonData.reduce((sum, row: any[]) => sum + row.length, 0);
        }
      });
      
      const metadata = {
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
        totalRows,
        totalCells,
        extractedText: contentUnits.length > 0 ? 
          contentUnits[0].content.substring(0, 500) + '...' : '',
      };
      
      const processingTime = Date.now() - startTime;
      
      logger.debug(`Successfully processed Excel file: ${fileId}, extracted ${contentUnits.length} chunks from ${workbook.SheetNames.length} sheets`);
      
      return {
        success: true,
        contentUnits,
        processingTime,
        metadata,
      };
    } catch (error: any) {
      logger.error(`Failed to process Excel file ${fileId}:`, error);
      
      return {
        success: false,
        contentUnits: [],
        error: error.message,
        processingTime: Date.now() - startTime,
        metadata: {},
      };
    }
  }
  
  private convertSheetToText(data: any[][], sheetName: string): string {
    if (!data || data.length === 0) return '';
    
    let text = `Sheet: ${sheetName}\n\n`;
    
    // Assume first row contains headers
    const headers = data[0] || [];
    if (headers.length > 0) {
      text += `Headers: ${headers.join(' | ')}\n\n`;
    }
    
    // Process data rows
    for (let i = 1; i < data.length; i++) {
      const row = data[i] || [];
      if (row.some(cell => cell && cell.toString().trim())) {
        const rowText = row.map((cell, index) => {
          const header = headers[index] || `Column${index + 1}`;
          const value = cell ? cell.toString().trim() : '';
          return value ? `${header}: ${value}` : '';
        }).filter(Boolean).join(', ');
        
        if (rowText) {
          text += `Row ${i}: ${rowText}\n`;
        }
      }
    }
    
    return text;
  }
}