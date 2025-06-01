export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // MinIO configuration
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    ingestionBucket: process.env.MINIO_INGESTION_BUCKET || 'documents',
    webhookToken: process.env.MINIO_WEBHOOK_TOKEN || 'webhook-secret',
  },
  
  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
  },
  
  // MongoDB configuration
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/jam_ingestion',
    database: process.env.MONGODB_DATABASE || 'jam_ingestion',
  },
  
  // LanceDB configuration
  lancedb: {
    uri: process.env.LANCEDB_URI || './lancedb',
    tableName: process.env.LANCEDB_TABLE_NAME || 'embeddings',
    dimensions: parseInt(process.env.LANCEDB_DIMENSIONS || '768'),
    metricType: process.env.LANCEDB_METRIC_TYPE || 'cosine',
    storageOptions: {
      writeMode: process.env.LANCEDB_WRITE_MODE || 'append',
      enableStats: process.env.LANCEDB_ENABLE_STATS === 'true',
    },
  },
  
  // Enhanced Ollama configuration
  ollama: {
    host: process.env.OLLAMA_HOST || 'localhost',
    port: parseInt(process.env.OLLAMA_PORT || '11434'),
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    textModel: process.env.OLLAMA_TEXT_MODEL || 'nomic-embed-text',
    imageModel: process.env.OLLAMA_IMAGE_MODEL || 'nomic-embed-vision',
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
    embeddingDimensions: parseInt(process.env.OLLAMA_EMBEDDING_DIMENSIONS || '768'),
    chatModel: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
    timeout: parseInt(process.env.OLLAMA_TIMEOUT || '120000'),
    maxRetries: parseInt(process.env.OLLAMA_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.OLLAMA_RETRY_DELAY || '1000'),
    keepAlive: process.env.OLLAMA_KEEP_ALIVE || '5m',
    numCtx: parseInt(process.env.OLLAMA_NUM_CTX || '4096'),
    temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.1'),
  },
  
  // Embedding configuration
  embedding: {
    provider: process.env.EMBEDDING_PROVIDER || 'ollama', // 'ollama' | 'mock'
    batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '10'),
    timeout: parseInt(process.env.EMBEDDING_TIMEOUT || '30000'),
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768'),
    maxTokens: parseInt(process.env.EMBEDDING_MAX_TOKENS || '8192'),
  },
  
  // Queue configuration
  queues: {
    fileProcessing: 'file-processing',
    embedding: 'embedding-generation',
    cleanup: 'cleanup-tasks',
    healthCheck: 'health-check',
  },
  
  // Processing configuration
  processing: {
    maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
    chunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
    batchDelay: parseInt(process.env.BATCH_DELAY || '1000'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '100') * 1024 * 1024, // MB to bytes
    supportedFormats: {
      documents: ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf'],
      spreadsheets: ['.xlsx', '.xls', '.csv'],
      images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'],
      videos: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'],
      audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'],
    },
  },
  
  // Worker configuration
  workers: {
    fileProcessing: {
      concurrency: parseInt(process.env.FILE_PROCESSING_CONCURRENCY || '2'),
    },
    embedding: {
      concurrency: parseInt(process.env.EMBEDDING_CONCURRENCY || '5'),
    },
    cleanup: {
      concurrency: parseInt(process.env.CLEANUP_CONCURRENCY || '1'),
    },
  },
  
  // Cleanup configuration
  cleanup: {
    retentionDays: parseInt(process.env.CLEANUP_RETENTION_DAYS || '30'),
    batchSize: parseInt(process.env.CLEANUP_BATCH_SIZE || '100'),
    scheduleExpression: process.env.CLEANUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
  },
  
  // Health check configuration
  health: {
    checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'), // 30 seconds
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'),
    retryAttempts: parseInt(process.env.HEALTH_CHECK_RETRIES || '3'),
  },
};