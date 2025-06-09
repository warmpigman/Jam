import { NextRequest, NextResponse } from 'next/server';

interface SearchResult {
  filename: string;
  vector_id: string;
  similarity_score: number;
  content_type: string;
  type: string;
  preview?: string;
  mongo_ref?: string;
}

interface ChunkedSearchResult {
  document_id: string;
  filename: string;
  content_type: string;
  type: string;
  mongo_ref: string;
  score: number;
  is_chunked_document: boolean;
  chunks?: Array<{
    vector_id: string;
    chunk_index: number;
    preview: string;
    score: number;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const { query, limit = 5, useChunking = true } = await request.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    const embedServiceUrl = process.env.EMBED_SERVICE_URL || 'http://embed-service:8080';
    
    // Create form-data for the embed service
    const formData = new FormData();
    formData.append('text', query.trim());
    formData.append('limit', Math.min(Math.max(1, Number(limit)), 50).toString());
    
    // Add candidates parameter for reranking - retrieve more candidates than we need
    const candidates = Math.min(Math.max(20, Number(limit) * 3), 100).toString();
    formData.append('candidates', candidates);
    
    // Add chunking parameters
    formData.append('group_by_document', 'true');
    formData.append('chunks_per_doc', '3');

    // Determine which endpoint to use based on chunking preference
    const searchEndpoint = useChunking ? '/search_reranked_chunked' : '/search_reranked';

    // Call the embed service with the appropriate endpoint
    const searchResponse = await fetch(`${embedServiceUrl}${searchEndpoint}`, {
      method: 'POST',
      body: formData,
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Embed service error:', errorText);
      return NextResponse.json(
        { error: 'Search service temporarily unavailable' },
        { status: 503 }
      );
    }

    const searchResults = await searchResponse.json();
    
    if (useChunking) {
      // Process chunked results (document-grouped format)
      return processChunkedResults(searchResults, query.trim());
    } else {
      // Process regular results (flat list format)
      return processRegularResults(searchResults, query.trim());
    }

  } catch (error) {
    console.error('Semantic search error:', error);
    return NextResponse.json(
      { error: 'Internal server error during search' },
      { status: 500 }
    );
  }
}

/**
 * Process regular (non-chunked) search results
 */
function processRegularResults(searchResults: any[], query: string) {
  // Transform results to match our frontend expectations
  const transformedResults = searchResults.map((result) => {
    // Find the corresponding file in MinIO to get real metadata
    const fileName = result.filename || result.type || 'Unknown';
    
    return {
      name: fileName,
      filename: fileName,
      vector_id: result.vector_id,
      similarity_score: result.score || 0,
      similarity: result.score || 0, 
      content_type: result.content_type,
      type: result.type || 'file',
      preview: result.preview,
      mongo_ref: result.mongo_ref,
      size: 0, // Will be enriched by frontend
      lastModified: new Date().toISOString(), // Will be enriched by frontend
    };
  });

  return NextResponse.json({
    results: transformedResults,
    query: query,
    total: transformedResults.length,
    chunked: false
  });
}

/**
 * Process chunked search results that are grouped by document
 */
function processChunkedResults(documentResults: ChunkedSearchResult[], query: string) {
  // Transform document results to match our frontend expectations
  const transformedResults = documentResults.map((docResult) => {
    // Base document info
    const result = {
      name: docResult.filename,
      filename: docResult.filename,
      document_id: docResult.document_id,
      vector_id: docResult.document_id, // Use document_id as vector_id for document-level results
      similarity_score: docResult.score,
      similarity: docResult.score,
      content_type: docResult.content_type,
      type: docResult.type || 'file',
      mongo_ref: docResult.mongo_ref,
      is_chunked_document: docResult.is_chunked_document,
      size: 0, // Will be enriched by frontend
      lastModified: new Date().toISOString(), // Will be enriched by frontend
      chunks: [] as any[]
    };
    
    // Add chunk information if available
    if (docResult.chunks && docResult.chunks.length > 0) {
      result.chunks = docResult.chunks.map((chunk, index) => ({
        vector_id: chunk.vector_id,
        chunk_index: chunk.chunk_index,
        preview: chunk.preview,
        score: chunk.score,
        highlight_index: index // Frontend can use this to highlight the matching chunk
      }));
      
      // Use the highest scoring chunk's preview as the document preview
      const bestChunk = [...docResult.chunks].sort((a, b) => b.score - a.score)[0];
      result.preview = bestChunk.preview;
    }
    
    return result;
  });

  return NextResponse.json({
    results: transformedResults,
    query: query,
    total: transformedResults.length,
    chunked: true
  });
}

// Health check endpoint
export async function GET() {
  try {
    const embedServiceUrl = process.env.EMBED_SERVICE_URL || 'http://embed-service:8080';
    
    const healthResponse = await fetch(`${embedServiceUrl}/health`, {
      method: 'GET',
    });

    const isHealthy = healthResponse.ok;

    return NextResponse.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'semantic-search',
      embed_service_status: isHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      service: 'semantic-search',
      embed_service_status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}