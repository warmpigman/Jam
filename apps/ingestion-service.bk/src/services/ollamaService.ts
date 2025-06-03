import axios, { AxiosInstance } from 'axios';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { OllamaEmbeddingResponse } from '../types/index.js';

export class OllamaService {
  private client: AxiosInstance;
  private config: typeof config.ollama;

  constructor() {
    this.config = config.ollama;
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async generateEmbedding(
    text: string,
    model?: string
  ): Promise<OllamaEmbeddingResponse> {
    const modelToUse = model || this.config.embeddingModel;
    let lastError: any;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        logger.debug(`Generating embedding (attempt ${attempt}/${this.config.maxRetries}) for text length: ${text.length}`);

        const response = await this.client.post('/api/embeddings', {
          model: modelToUse,
          prompt: text,
          options: {
            num_ctx: this.config.numCtx,
            temperature: this.config.temperature,
          },
          keep_alive: this.config.keepAlive,
        });

        if (!response.data.embedding) {
          throw new Error('No embedding returned from Ollama');
        }

        logger.debug(`Successfully generated embedding with ${response.data.embedding.length} dimensions`);

        return {
          embedding: response.data.embedding,
          model: modelToUse,
        };
      } catch (error: any) {
        lastError = error;
        logger.warn(`Embedding generation attempt ${attempt} failed:`, error.message);

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * attempt;
          logger.debug(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(`Failed to generate embedding after ${this.config.maxRetries} attempts:`, lastError);
    throw new Error(`Embedding generation failed: ${lastError.message}`);
  }

  async generateBatchEmbeddings(
    texts: string[],
    model?: string
  ): Promise<OllamaEmbeddingResponse[]> {
    const batchSize = config.embedding.batchSize;
    const results: OllamaEmbeddingResponse[] = [];

    logger.info(`Generating embeddings for ${texts.length} texts in batches of ${batchSize}`);

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      logger.debug(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`);

      // Process batch in parallel with limited concurrency
      const batchPromises = batch.map(text => this.generateEmbedding(text, model));
      const batchResults = await Promise.all(batchPromises);
      
      results.push(...batchResults);

      // Add delay between batches to prevent overloading
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, config.processing.batchDelay));
      }
    }

    logger.info(`Successfully generated ${results.length} embeddings`);
    return results;
  }

  async generateImageEmbedding(
    imageData: Buffer,
    model?: string
  ): Promise<OllamaEmbeddingResponse> {
    const modelToUse = model || this.config.imageModel;
    let lastError: any;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        logger.debug(`Generating image embedding (attempt ${attempt}/${this.config.maxRetries})`);

        // Convert buffer to base64
        const base64Image = imageData.toString('base64');

        const response = await this.client.post('/api/embeddings', {
          model: modelToUse,
          images: [base64Image],
          options: {
            num_ctx: this.config.numCtx,
            temperature: this.config.temperature,
          },
          keep_alive: this.config.keepAlive,
        });

        if (!response.data.embedding) {
          throw new Error('No embedding returned from Ollama for image');
        }

        logger.debug(`Successfully generated image embedding with ${response.data.embedding.length} dimensions`);

        return {
          embedding: response.data.embedding,
          model: modelToUse,
        };
      } catch (error: any) {
        lastError = error;
        logger.warn(`Image embedding generation attempt ${attempt} failed:`, error.message);

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * attempt;
          logger.debug(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(`Failed to generate image embedding after ${this.config.maxRetries} attempts:`, lastError);
    throw new Error(`Image embedding generation failed: ${lastError.message}`);
  }

  async generateChat(
    prompt: string,
    model?: string,
    systemPrompt?: string
  ): Promise<string> {
    const modelToUse = model || this.config.chatModel;
    let lastError: any;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        logger.debug(`Generating chat response (attempt ${attempt}/${this.config.maxRetries})`);

        const messages = [];
        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await this.client.post('/api/chat', {
          model: modelToUse,
          messages,
          stream: false,
          options: {
            num_ctx: this.config.numCtx,
            temperature: this.config.temperature,
          },
          keep_alive: this.config.keepAlive,
        });

        if (!response.data.message?.content) {
          throw new Error('No response content returned from Ollama chat');
        }

        logger.debug('Successfully generated chat response');
        return response.data.message.content;
      } catch (error: any) {
        lastError = error;
        logger.warn(`Chat generation attempt ${attempt} failed:`, error.message);

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * attempt;
          logger.debug(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(`Failed to generate chat response after ${this.config.maxRetries} attempts:`, lastError);
    throw new Error(`Chat generation failed: ${lastError.message}`);
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/api/tags');
      return response.data.models?.map((model: any) => model.name) || [];
    } catch (error: any) {
      logger.error('Failed to list Ollama models:', error);
      throw new Error(`Failed to list models: ${error.message}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/tags', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      logger.debug('Ollama health check failed:', error);
      return false;
    }
  }

  async pullModel(modelName: string): Promise<void> {
    try {
      logger.info(`Pulling Ollama model: ${modelName}`);
      await this.client.post('/api/pull', { name: modelName });
      logger.info(`Successfully pulled model: ${modelName}`);
    } catch (error: any) {
      logger.error(`Failed to pull model ${modelName}:`, error);
      throw new Error(`Failed to pull model: ${error.message}`);
    }
  }
}

export const ollamaService = new OllamaService();