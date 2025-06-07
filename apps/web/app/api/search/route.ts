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

export async function POST(request: NextRequest) {
  try {
    const { query, limit = 5 } = await request.json();

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

    // Call the embed service search endpoint with form-data
    const searchResponse = await fetch(`${embedServiceUrl}/search`, {
      method: 'POST',
      body: formData, // Don't set Content-Type header, let fetch handle it for FormData
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

    // Transform results to match our frontend expectations
    const transformedResults = searchResults.map((result) => {
      // Find the corresponding file in MinIO to get real metadata
      const fileName = result.filename || result.type || 'Unknown';
      
      return {
        name: fileName,
        filename: fileName,
        vector_id: result.vector_id,
        similarity_score: result.score || 0, // Keep original score (0-1 range)
        similarity: result.score || 0, // Keep as 0-1 for percentage calculation
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
      query: query.trim(),
      total: transformedResults.length
    });

  } catch (error) {
    console.error('Semantic search error:', error);
    return NextResponse.json(
      { error: 'Internal server error during search' },
      { status: 500 }
    );
  }
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