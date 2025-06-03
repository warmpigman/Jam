import { Router } from 'express';
import { logger } from '@/config/logger.js';
import { getRedisClient } from '@/config/redis.js';
import mongoose from 'mongoose';

const router = Router();

router.get('/', async (req, res) => {
  try {
    // Check database connections
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    let redisStatus = 'disconnected';
    try {
      const redis = getRedisClient();
      await redis.ping();
      redisStatus = 'connected';
    } catch (error) {
      logger.warn('Redis health check failed:', error);
    }
    
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      connections: {
        mongodb: mongoStatus,
        redis: redisStatus,
      },
      memory: process.memoryUsage(),
    };
    
    res.json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
    });
  }
});

export { router as healthRouter };