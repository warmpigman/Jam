import Redis from 'ioredis';
import { logger } from './logger.js';
import { config } from './index.js';

let redisClient: Redis | null = null;

export async function initializeRedis(): Promise<Redis> {
  if (redisClient) {
    logger.info('Redis already connected');
    return redisClient;
  }

  try {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    await redisClient.connect();
    
    logger.info(`✅ Connected to Redis: ${config.redis.host}:${config.redis.port}`);
    
    // Handle Redis events
    redisClient.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });
    
    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });
    
    redisClient.on('disconnect', () => {
      logger.warn('Redis disconnected');
    });
    
    return redisClient;
    
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
  }
  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.disconnect();
    redisClient = null;
    logger.info('Disconnected from Redis');
  }
}