import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { query, limit = 10, sparseWeight = 0.5 } = await request.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    const embedServiceUrl = process.env.EMBED_SERVICE_URL || 'http://embed-service:8080';
    
    // Create form-data for the hybrid search
    const formData = new FormData();
    formData.append('text', query.trim());
    formData.append('limit', Math.min(Math.max(1, Number(limit)), 50).toString());
    formData.append('sparse_weight', String(sparseWeight));
    formData.append('min_score', '0.3');

    // Call the embed service's hybrid search endpoint
    const searchResponse = await fetch(`${embedServiceUrl}/hybrid_search`, {
      method: 'POST',
      body: formData,
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Hybrid search error:', errorText);
      return NextResponse.json(
        { error: 'Hybrid search service temporarily unavailable' },
        { status: 503 }
      );
    }

    const hybridResults = await searchResponse.json();
    
    // Transform results to match our frontend expectations
    const transformedResults = hybridResults.map((result: any) => {
      const fileName = result.filename || result.type || 'Unknown';
      
      return {
        name: fileName,
        filename: fileName,
        vector_id: result.vector_id,
        similarity_score: result.score || 0,
        similarity: result.score || 0,
        dense_score: result.dense_score || 0,
        sparse_score: result.sparse_score || 0,
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
      chunked: false,
      hybrid: true
    });

  } catch (error) {
    console.error('Hybrid search error:', error);
    return NextResponse.json(
      { error: 'Internal server error during hybrid search' },
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
      service: 'hybrid-search',
      embed_service_status: isHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      service: 'hybrid-search',
      embed_service_status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}