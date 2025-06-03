process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection:', reason);
  process.exit(1);
});

// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';

import { logger } from '@/config/logger.js';
import { config } from '@/config/index.js';
import { connectDatabase } from '@/config/database.js';
import { initializeRedis } from '@/config/redis.js';
import { webhookRouter } from '@/routes/webhook.js';
import { healthRouter } from '@/routes/health.js';
import { startWorkers } from '@/workers/index.js';

console.log("Ingestion service starting...");

async function bootstrap() {
  console.log("Bootstrap starting...");

  try {
    // Create Express app
    const app = express();
    
    // Security middleware
    app.use(helmet());
    app.use(cors());
    
    // Logging middleware
    app.use(morgan('combined', { 
      stream: { 
        write: (message: string) => logger.info(message.trim()) 
      },
      skip: (req: any) => req.url === '/health'
    }));
    
    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Root route
    app.get('/', (req: Request, res: Response) => {
      res.json({
        message: 'Ingestion service is running',
        timestamp: new Date().toISOString(),
        version: '0.0.1',
        environment: config.nodeEnv
      });
    });
    
    // Routes
    app.use('/health', healthRouter);
    app.use('/webhook', webhookRouter);
    
    // Initialize database connections
    console.log('Connecting to database...');
    await connectDatabase();
    console.log('Database connected successfully');
    
    console.log('Initializing Redis...');
    await initializeRedis();
    console.log('Redis initialized successfully');
    
    // Initialize LanceDB
    console.log('Initializing LanceDB...');
    const { LanceDBService } = await import('@/services/lancedbService.js');
    const lancedbService = new LanceDBService();
    await lancedbService.initialize();
    console.log('LanceDB initialized successfully');
    
    // Start background workers
    console.log('Starting workers...');
    console.log('About to exit on line 80...');
    // setTimeout(async () => {
    // process.exit(1)
    // await startWorkers();
    try {
      // console.log(startWorkers)
      await startWorkers();
    } catch (error) {
      console.error('startWorkers failed:', error);
      process.exit(1);
    }
    // }, 9000);
    // Global error handler middleware
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('🚨 EXPRESS ERROR HANDLER:', err);
      logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body
      });
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        timestamp: new Date().toISOString()
      });
    });
    
    // 404 handler
    app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });
    
    // Create HTTP server
    const server = createServer(app);
    
    // Start server
    server.listen(config.port, '0.0.0.0', () => {
      console.log(`✅ Ingestion service listening on port ${config.port}`);
      logger.info(`Ingestion service listening on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`MinIO endpoint: ${config.minio.endpoint}:${config.minio.port}`);
      logger.info(`MongoDB URI: ${config.mongodb.uri}`);
      logger.info(`Redis host: ${config.redis.host}:${config.redis.port}`);
    });

    // Graceful shutdown
    // const gracefulShutdown = (signal: string) => {
    //   console.log(`Received ${signal}. Starting graceful shutdown...`);
    //   logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
    //   server.close((err) => {
    //     if (err) {
    //       console.error('Error during server shutdown:', err);
    //       logger.error('Error during server shutdown:', err);
    //       process.exit(1);
    //     }
        
    //     console.log('Server closed successfully');
    //     logger.info('Server closed successfully');
    //     process.exit(0);
    //   });
      
    //   // Force shutdown after 30 seconds
    //   setTimeout(() => {
    //     console.error('Force shutdown after timeout');
    //     logger.error('Force shutdown after timeout');
    //     process.exit(1);
    //   }, 30000);
    // };

    // // Handle shutdown signals
    // process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    // process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('🚨 BOOTSTRAP ERROR - FULL DETAILS:');
    console.error('Error:', error);
    console.error('Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    logger.error('Failed to start ingestion service:', error);
    process.exit(1);
  }
}

// Start the application
bootstrap().catch((error) => {
  logger.error('Unhandled error during bootstrap:', error);
  process.exit(1);
});