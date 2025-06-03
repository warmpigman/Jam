import { MongoClient, Db } from 'mongodb';
import { config } from '@/config/index.js';
import { logger } from '@/config/logger.js';

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

export async function connectToMongoDB(): Promise<Db> {
  // Singleton logic - return existing connection if available
  if (dbInstance && client) {
    try {
      // Test the connection with a simple ping
      await dbInstance.admin().ping();
      return dbInstance;
    } catch (error) {
      // Connection is stale, reset and reconnect
      logger.warn('MongoDB connection test failed, reconnecting...');
      client = null;
      dbInstance = null;
    }
  }

  try {
    // Create new MongoClient instance
    const mongoClient = new MongoClient(config.mongodb.uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    // Connect to MongoDB
    await mongoClient.connect();
    
    // Set module-level variables
    client = mongoClient;
    dbInstance = client.db(config.mongodb.database);
    
    logger.info(`✅ Successfully connected to MongoDB database: ${config.mongodb.database}`);
    
    // Set up connection event handlers
    client.on('error', (error: any) => {
      logger.error('MongoDB client error:', error);
    });
    
    client.on('close', () => {
      logger.warn('MongoDB connection closed');
      client = null;
      dbInstance = null;
    });
    
    return dbInstance;
    
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    client = null;
    dbInstance = null;
    throw error;
  }
}

export async function getMongoDb(): Promise<Db> {
  return await connectToMongoDB();
}

export async function closeMongoDBConnection(): Promise<void> {
  if (client) {
    try {
      await client.close();
      client = null;
      dbInstance = null;
      logger.info('MongoDB connection closed');
    } catch (error) {
      logger.error('Error closing MongoDB connection:', error);
    }
  }
}

// Health check function
export async function isMongoDBConnected(): Promise<boolean> {
  try {
    if (!client || !dbInstance) {
      return false;
    }
    
    // Ping the database to check connection
    await dbInstance.admin().ping();
    return true;
  } catch (error) {
    logger.warn('MongoDB health check failed:', error);
    return false;
  }
}