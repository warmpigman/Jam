import * as lancedb from 'vectordb';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { LanceDBRecord, LanceDBConfig } from '../types/index.js';

export class LanceDBService {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private config: LanceDBConfig;

  constructor() {
    this.config = config.lancedb;
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing LanceDB connection...');
      
      // Connect to LanceDB
      this.db = await lancedb.connect(this.config.uri);
      
      // Check if table exists, create if not
      const tableNames = await this.db.tableNames();
      
      if (!tableNames.includes(this.config.tableName)) {
        logger.info(`Creating LanceDB table: ${this.config.tableName}`);
        
        // Create table with schema
        const sampleData = [{
          id: 'sample',
          content_id: 'sample',
          file_id: 'sample',
          vector: new Array(this.config.dimensions).fill(0),
          content: 'sample content',
          metadata: {},
          created_at: new Date(),
        }];
        
        this.table = await this.db.createTable(this.config.tableName, sampleData, {
          writeMode: lancedb.WriteMode.Create,
        });
        
        // Delete the sample data
        await this.table.delete('id = "sample"');
      } else {
        logger.info(`Opening existing LanceDB table: ${this.config.tableName}`);
        this.table = await this.db.openTable(this.config.tableName);
      }
      
      logger.info('LanceDB initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize LanceDB:', error);
      throw error;
    }
  }

  async insertEmbeddings(records: LanceDBRecord[]): Promise<void> {
    if (!this.table) {
      throw new Error('LanceDB table not initialized');
    }

    try {
      logger.debug(`Inserting ${records.length} embeddings into LanceDB`);
      
      await this.table.add(records, {
        writeMode: this.config.storageOptions.writeMode as any,
      });
      
      logger.debug(`Successfully inserted ${records.length} embeddings`);
    } catch (error) {
      logger.error('Failed to insert embeddings:', error);
      throw error;
    }
  }

  async searchSimilar(
    queryVector: number[],
    limit: number = 10,
    filter?: string
  ): Promise<LanceDBRecord[]> {
    if (!this.table) {
      throw new Error('LanceDB table not initialized');
    }

    try {
      logger.debug(`Searching for ${limit} similar vectors`);
      
      let query = this.table
        .search(queryVector)
        .limit(limit)
        .metricType(this.config.metricType as any);
      
      if (filter) {
        query = query.where(filter);
      }
      
      const results = await query.toArray();
      
      logger.debug(`Found ${results.length} similar vectors`);
      return results as LanceDBRecord[];
    } catch (error) {
      logger.error('Failed to search similar vectors:', error);
      throw error;
    }
  }

  async deleteEmbeddings(fileId: string): Promise<void> {
    if (!this.table) {
      throw new Error('LanceDB table not initialized');
    }

    try {
      logger.debug(`Deleting embeddings for file: ${fileId}`);
      
      await this.table.delete(`file_id = "${fileId}"`);
      
      logger.debug(`Successfully deleted embeddings for file: ${fileId}`);
    } catch (error) {
      logger.error(`Failed to delete embeddings for file ${fileId}:`, error);
      throw error;
    }
  }

  async getTableInfo(): Promise<any> {
    if (!this.table) {
      throw new Error('LanceDB table not initialized');
    }

    try {
      const schema = await this.table.schema;
      const stats = this.config.storageOptions.enableStats 
        ? await this.table.countRows() 
        : null;
      
      return {
        tableName: this.config.tableName,
        schema: schema.toString(),
        rowCount: stats,
        dimensions: this.config.dimensions,
        metricType: this.config.metricType,
      };
    } catch (error) {
      logger.error('Failed to get table info:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.db || !this.table) {
        return false;
      }
      
      // Simple health check by trying to get table info
      await this.table.countRows();
      return true;
    } catch (error) {
      logger.error('LanceDB health check failed:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.db) {
        logger.info('Closing LanceDB connection');
        await this.db.close();
        this.db = null;
        this.table = null;
      }
    } catch (error) {
      logger.error('Error closing LanceDB connection:', error);
    }
  }
}

export const lancedbService = new LanceDBService();