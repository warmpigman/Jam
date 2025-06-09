import os
import io
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel, AutoImageProcessor, AutoModelForSequenceClassification
from PIL import Image
from flask import Flask, request, jsonify
from qdrant_client import QdrantClient
from qdrant_client.http.models import PointStruct, VectorParams, Distance, Filter, FieldCondition, MatchValue
from qdrant_client.http.models import VectorParams, Distance, NamedVector
from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np
import uuid
from langchain_text_splitters import RecursiveCharacterTextSplitter
import json
import re

print("Starting embedding service...")
TEXT_MODEL = "nomic-ai/nomic-embed-text-v1.5"
VISION_MODEL = "nomic-ai/nomic-embed-vision-v1.5"
RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
CACHE_DIR = "./hf_cache"
QDRANT_HOST = "qdrant"
QDRANT_PORT = 6333
COLLECTION_NAME = "jam_embeddings"
VECTOR_SIZE = 768

# Document chunking configuration
CHUNK_SIZE = 500  # Characters per chunk
CHUNK_OVERLAP = 200  # Overlap between chunks
USE_CHUNKING = True  # Can be toggled with a request parameter

PRELOAD_MODELS = True
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")
if device == torch.device("cuda"):
    torch.backends.cudnn.benchmark = True
    print("CUDA Device:", torch.cuda.get_device_name(0))
    print("VRAM:", round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 2), "GB")
elif device == torch.device("cpu"):
    print("Running on CPU, performance may be slower.")
    print("Core count:", os.cpu_count())
    print("CPU Info:", torch.__config__.show())
    print("RAM:", round(os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES') / (1024 ** 3), 2), "GB")
app = Flask(__name__)

# Configuration for sparse embeddings
SPARSE_VECTOR_SIZE = 1024  # Size of sparse embeddings
USE_HYBRID_SEARCH = True   # Enable hybrid search by default

# Add sparse vectorizer to preloaded models
preloaded = {
    "text_tokenizer": None,
    "text_model": None,
    "vision_processor": None,
    "vision_model": None,
    "reranker_model": None,
    "reranker_tokenizer": None,
    "sparse_vectorizer": None,
}

qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

def ensure_collection_exists():
    collections = [c.name for c in qdrant.get_collections().collections]
    if COLLECTION_NAME not in collections:
        # Create collection with support for both dense and sparse vectors
        qdrant.create_collection(
            COLLECTION_NAME,
            vectors_config={
                "dense": VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
                "sparse": VectorParams(size=SPARSE_VECTOR_SIZE, distance=Distance.COSINE)
            }
        )
        print(f"Created Qdrant collection '{COLLECTION_NAME}' with dense size {VECTOR_SIZE} and sparse size {SPARSE_VECTOR_SIZE}")
    else:
        # Check if the collection has the expected vector configuration
        collection_info = qdrant.get_collection(COLLECTION_NAME)
        if "sparse" not in collection_info.config.params.vectors:
            print("WARNING: Existing collection doesn't have sparse vectors configured. Hybrid search will not work.")
        else:
            print(f"Qdrant collection '{COLLECTION_NAME}' already exists with hybrid search support.")

def load_text_model_and_tokenizer():
    tokenizer = AutoTokenizer.from_pretrained(TEXT_MODEL, cache_dir=CACHE_DIR, trust_remote_code=True, use_fast=True)
    model = AutoModel.from_pretrained(TEXT_MODEL, cache_dir=CACHE_DIR, trust_remote_code=True).to(device)
    model.eval()
    return tokenizer, model

def load_vision_model_and_processor():
    processor = AutoImageProcessor.from_pretrained(VISION_MODEL, cache_dir=CACHE_DIR, use_fast=True)
    model = AutoModel.from_pretrained(VISION_MODEL, cache_dir=CACHE_DIR, trust_remote_code=True).to(device)
    model.eval()
    return processor, model

def load_reranker_model():
    """
    Load the cross-encoder reranking model
    """
    tokenizer = AutoTokenizer.from_pretrained(RERANKER_MODEL, cache_dir=CACHE_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(RERANKER_MODEL, cache_dir=CACHE_DIR).to(device)
    model.eval()
    return tokenizer, model

def initialize_sparse_vectorizer():
    """
    Initialize and return a TF-IDF vectorizer for sparse embeddings
    """
    print("Initializing TF-IDF vectorizer for sparse embeddings...")
    
    # Configure a TF-IDF vectorizer with parameters optimized for search
    vectorizer = TfidfVectorizer(
        lowercase=True,            # Convert to lowercase
        strip_accents='unicode',   # Remove accents
        analyzer='word',           # Use word-based analysis
        stop_words='english',      # Remove English stop words
        max_features=SPARSE_VECTOR_SIZE,  # Limit vocabulary size
        ngram_range=(1, 2),        # Include unigrams and bigrams
        min_df=2,                  # Minimum document frequency
        max_df=0.9,                # Maximum document frequency
        norm='l2'                  # L2 normalization
    )
    
    return vectorizer

def load_models():
    """
    Load all models needed for the embedding service
    """
    print("Loading all models into memory...")
    
    # Load dense embedding models
    text_tokenizer, text_model = load_text_model_and_tokenizer()
    vision_processor, vision_model = load_vision_model_and_processor()
    reranker_tokenizer, reranker_model = load_reranker_model()
    
    # Initialize sparse vectorizer
    sparse_vectorizer = initialize_sparse_vectorizer()
    
    # Return all loaded models
    return {
        "text_tokenizer": text_tokenizer,
        "text_model": text_model,
        "vision_processor": vision_processor,
        "vision_model": vision_model,
        "reranker_tokenizer": reranker_tokenizer,
        "reranker_model": reranker_model,
        "sparse_vectorizer": sparse_vectorizer
    }

def generate_sparse_embedding(text, vectorizer):
    """
    Generate a sparse embedding for the given text using TF-IDF
    
    Args:
        text (str): The text to embed
        vectorizer: The TF-IDF vectorizer
        
    Returns:
        numpy.ndarray: Sparse vector representation
    """
    # Preprocess the text
    if not text:
        return np.zeros(SPARSE_VECTOR_SIZE)
    
    # Clean the text: remove special characters but keep spaces and basic punctuation
    text = re.sub(r'[^\w\s.,?!-]', ' ', text)
    
    # Generate the TF-IDF vector
    try:
        # For a single document, we need to return a 1D array
        sparse_vector = vectorizer.transform([text]).toarray()[0]
        
        # If the vectorizer hasn't seen any of these words before, we may get all zeros
        if np.all(sparse_vector == 0):
            print("Warning: Generated an all-zero sparse vector")
        
        return sparse_vector
    except Exception as e:
        print(f"Error generating sparse embedding: {str(e)}")
        # Return a zero vector as fallback
        return np.zeros(SPARSE_VECTOR_SIZE)

def update_vectorizer_vocabulary(vectorizer, documents):
    """
    Update the vectorizer's vocabulary using a corpus of documents
    
    Args:
        vectorizer: The TF-IDF vectorizer to update
        documents (list): List of text documents
        
    Returns:
        TfidfVectorizer: Updated vectorizer
    """
    print(f"Updating TF-IDF vectorizer vocabulary with {len(documents)} documents...")
    
    # Fit the vectorizer on the corpus
    vectorizer.fit(documents)
    
    print(f"Vocabulary size: {len(vectorizer.vocabulary_)}")
    
    return vectorizer

def embed_text(text, tokenizer, model):
    """Generate a dense embedding for text using the neural model"""
    encoded_input = tokenizer(['search_query: ' + text], padding=True, truncation=True, return_tensors='pt').to(device)
    with torch.no_grad():
        model_output = model(**encoded_input)
        token_embeddings = model_output.last_hidden_state
        input_mask_expanded = encoded_input['attention_mask'].unsqueeze(-1).expand(token_embeddings.size()).float()
        pooled = torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        embedding = F.normalize(pooled, p=2, dim=1)
    return embedding[0].cpu().numpy()

def embed_image_file(file_storage, processor, model):
    print("Filename:", file_storage.filename)
    print("Content type:", file_storage.content_type)
    image = Image.open(file_storage.stream).convert('RGB')
    inputs = processor(image, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model(**inputs)
        img_emb = outputs.last_hidden_state[:, 0]
        embedding = F.normalize(img_emb, p=2, dim=1)
    return embedding[0].cpu().numpy()

def rerank_results(query, results, tokenizer, model):
    """
    Rerank results using cross-encoder model
    
    Args:
        query (str): The search query
        results (list): List of search results
        tokenizer: Cross-encoder tokenizer
        model: Cross-encoder model
        
    Returns:
        list: Reranked search results
    """
    print(f"\n===== RERANKING PROCESS =====")
    print(f"Query: '{query}'")
    print(f"Reranking {len(results)} results")
    
    if not results:
        print("No results to rerank")
        return results
        
    # Extract text content to rerank
    text_pairs = []
    print("\nContent being compared:")
    for i, result in enumerate(results):
        # Use preview if available, or use filename as fallback
        content = result.get("preview", result.get("filename", ""))
        # For images, we don't have meaningful text to compare
        if result.get("type") == "image":
            content = result.get("filename", "")
        text_pairs.append([query, content])
        print(f"  {i+1}. '{content[:50]}{'...' if len(content) > 50 else ''}' (Original score: {result['score']:.4f})")
    
    print("\nRunning cross-encoder reranking...")
    # Encode and score the pairs
    with torch.no_grad():
        inputs = tokenizer(
            text_pairs,
            padding=True,
            truncation=True,
            return_tensors="pt",
            max_length=512
        ).to(device)
        
        scores = model(**inputs).logits.squeeze(-1).cpu().tolist()
    
    # Update results with new scores
    print("\nScore comparison (Original → Reranked):")
    for i, score in enumerate(scores):
        results[i]["original_score"] = results[i]["score"]  # Keep original score
        results[i]["score"] = float(score)  # Update with cross-encoder score
        print(f"  {i+1}. {results[i]['original_score']:.4f} → {results[i]['score']:.4f} | {results[i].get('filename', '')}")
    
    # Sort by new scores
    reranked_results = sorted(results, key=lambda x: x["score"], reverse=True)
    
    print("\nNew ranking order:")
    for i, result in enumerate(reranked_results):
        print(f"  {i+1}. Score: {result['score']:.4f} | {result.get('filename', '')}")
    
    print("===== RERANKING COMPLETE =====\n")
    return reranked_results

def chunk_text(text, chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP):
    """
    Split a text document into chunks using LangChain's RecursiveCharacterTextSplitter
    
    Args:
        text (str): The text to chunk
        chunk_size (int): Maximum size of each chunk
        chunk_overlap (int): Overlap between chunks
        
    Returns:
        list: List of text chunks
    """
    print(f"Chunking text of length {len(text)} with chunk_size={chunk_size}, overlap={chunk_overlap}")
    
    # Initialize the text splitter
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    
    # Split the text into chunks
    chunks = text_splitter.split_text(text)
    
    print(f"Generated {len(chunks)} chunks from document")
    for i, chunk in enumerate(chunks[:3]):  # Log first few chunks for debugging
        print(f"  Chunk {i+1}: {chunk[:50]}..." + ("" if len(chunk) <= 50 else ""))
    
    if len(chunks) > 3:
        print(f"  ... and {len(chunks)-3} more chunks")
        
    return chunks

def embed_chunked_text(text, filename, content_type, document_id, tokenizer, model, chunk_size, chunk_overlap):
    """
    Embed a text document by chunking it first and embedding each chunk separately
    
    Args:
        text (str): The text to embed
        filename (str): Filename for the document
        content_type (str): Content type of the document
        document_id (str): Unique ID for the document (mongo_ref)
        tokenizer: Text tokenizer
        model: Text embedding model
        chunk_size (int): Size of each chunk
        chunk_overlap (int): Overlap between chunks
        
    Returns:
        Response: JSON response with embedding details
    """
    print(f"\n===== CHUNKING DOCUMENT =====")
    print(f"Document: {filename}, Length: {len(text)} characters")
    
    # Split the text into chunks
    chunks = chunk_text(text, chunk_size, chunk_overlap)
    
    if not chunks:
        return jsonify({"error": "Failed to create chunks from text"}), 400
        
    # Embed each chunk and store in Qdrant
    chunk_points = []
    chunk_ids = []
    
    print(f"Embedding {len(chunks)} chunks...")
    
    for i, chunk_content in enumerate(chunks):
        # Generate a unique ID for this chunk
        chunk_id = str(uuid.uuid4())
        chunk_ids.append(chunk_id)
        
        # Create a chunk-specific preview
        chunk_preview = chunk_content[:100]
        
        # Embed the chunk
        embedding = embed_text(chunk_content, tokenizer, model)
        
        # Create a payload for this chunk
        payload = {
            "type": "text",
            "mongo_ref": document_id,  # All chunks reference the same document
            "filename": filename,
            "content_type": content_type,
            "preview": chunk_preview,
            "is_chunk": True,
            "chunk_index": i,
            "document_id": document_id,
            "chunk_id": chunk_id,
            "total_chunks": len(chunks)
        }
        
        # Create a point for this chunk
        point = PointStruct(
            id=chunk_id,
            vector=embedding,
            payload=payload
        )
        
        chunk_points.append(point)
    
    # Insert all chunk points into Qdrant
    qdrant.upsert(COLLECTION_NAME, chunk_points)
    
    print(f"Successfully embedded {len(chunk_points)} chunks for document {filename}")
    print("===== CHUNKING COMPLETE =====\n")
    
    return jsonify({
        "document_id": document_id,
        "filename": filename,
        "chunk_ids": chunk_ids,
        "total_chunks": len(chunks),
        "chunked": True
    })

def embed_with_sparse_vector(text, tokenizer, model, vectorizer):
    """
    Generate both dense and sparse embeddings for text
    
    Args:
        text (str): The text to embed
        tokenizer: Dense embedding tokenizer
        model: Dense embedding model
        vectorizer: Sparse embedding vectorizer (TF-IDF)
        
    Returns:
        tuple: (dense_embedding, sparse_embedding)
    """
    # Generate dense embedding using the neural model
    dense_embedding = embed_text(text, tokenizer, model)
    
    # Generate sparse embedding using TF-IDF
    sparse_embedding = generate_sparse_embedding(text, vectorizer)
    
    return dense_embedding, sparse_embedding

@app.route('/embed', methods=['POST'])
def embed():
    mongo_ref = str(uuid.uuid4())
    vector_id = str(uuid.uuid4())
    
    # Check if chunking is requested (default to global setting)
    use_chunking = request.form.get("use_chunking", str(USE_CHUNKING)).lower() in ["true", "1", "yes"]
    chunk_size = int(request.form.get("chunk_size", CHUNK_SIZE))
    chunk_overlap = int(request.form.get("chunk_overlap", CHUNK_OVERLAP))
    use_hybrid = request.form.get("use_hybrid", str(USE_HYBRID_SEARCH)).lower() in ["true", "1", "yes"]

    if 'file' in request.files:
        file = request.files['file']
        filename = file.filename.lower()
        content_type = file.content_type
        print(content_type)
        # File type groups
        allowed_image_types = {'image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'}
        image_exts = ('.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif')

        allowed_text_types = {'text/plain'}
        text_exts = ('.txt',)

        # Handle image files
        if content_type in allowed_image_types or filename.endswith(image_exts):
            processor = preloaded["vision_processor"]
            model = preloaded["vision_model"]
            try:
                embedding = embed_image_file(file, processor, model)
            except Exception as e:
                return jsonify({"error": f"Failed to process image: {str(e)}"}), 400

            payload = {
                "type": "image",
                "mongo_ref": mongo_ref,
                "filename": file.filename,
                "content_type": content_type,
                "preview": f"[image: {file.filename}]"
            }
            
            # Images are stored with dense vector only (no sparse)
            point = PointStruct(
                id=vector_id,
                vector={"dense": embedding},  # Use named vector format
                payload=payload
            )
            qdrant.upsert(COLLECTION_NAME, [point])
            
            return jsonify({
                "embedding": embedding.tolist(),
                "vector_id": vector_id,
                "mongo_ref": mongo_ref
            })

        # Handle text files
        elif content_type in allowed_text_types or filename.endswith(text_exts):
            try:
                # Try to read as UTF-8 first
                raw_data = file.read()
                try:
                    text = raw_data.decode("utf-8")
                except UnicodeDecodeError:
                    # If UTF-8 fails, try other common encodings
                    file.seek(0)  # Reset file pointer
                    try:
                        text = file.read().decode("utf-16")
                        print(f"Warning: File {file.filename} decoded using utf-16 instead of utf-8")
                    except UnicodeDecodeError:
                        # If all text decodings fail, treat as binary and skip
                        return jsonify({"error": f"File {file.filename} appears to be binary data, not text. Cannot process as text file."}), 400
            except Exception as e:
                return jsonify({"error": f"Failed to read text! file: {str(e)}"}), 400

            # Validate that we have actual text content
            if not text.strip():
                return jsonify({"error": f"File {file.filename} appears to be empty or contains no readable text"}), 400
                
            tokenizer = preloaded["text_tokenizer"]
            model = preloaded["text_model"]
            vectorizer = preloaded["sparse_vectorizer"]
            
            # If chunking is enabled and the text is long enough to chunk
            if use_chunking and len(text) > chunk_size:
                return embed_chunked_text(text, file.filename, content_type, mongo_ref, tokenizer, model, 
                                         chunk_size, chunk_overlap)
            else:
                # Process as a single document
                if use_hybrid and vectorizer:
                    # Generate both dense and sparse embeddings
                    dense_embedding, sparse_embedding = embed_with_sparse_vector(text, tokenizer, model, vectorizer)
                    
                    payload = {
                        "type": "text",
                        "mongo_ref": mongo_ref,
                        "filename": file.filename,
                        "preview": text[:100],
                        "content_type": content_type,
                        "is_chunk": False,
                        "document_id": mongo_ref,  # Self-referential for non-chunked docs
                        "has_sparse_embedding": True  # Flag indicating this has a sparse embedding
                    }
                    
                    # Store with both embeddings using named vectors
                    point = PointStruct(
                        id=vector_id,
                        vector={
                            "dense": dense_embedding,
                            "sparse": sparse_embedding
                        },
                        payload=payload
                    )
                else:
                    # Fall back to dense embedding only
                    dense_embedding = embed_text(text, tokenizer, model)
                    
                    payload = {
                        "type": "text",
                        "mongo_ref": mongo_ref,
                        "filename": file.filename,
                        "preview": text[:100],
                        "content_type": content_type,
                        "is_chunk": False,
                        "document_id": mongo_ref,  # Self-referential for non-chunked docs
                        "has_sparse_embedding": False
                    }
                    
                    # Store with dense embedding only
                    point = PointStruct(
                        id=vector_id,
                        vector={"dense": dense_embedding},
                        payload=payload
                    )
                
                qdrant.upsert(COLLECTION_NAME, [point])
                
                return jsonify({
                    "vector_id": vector_id,
                    "mongo_ref": mongo_ref,
                    "chunked": False,
                    "hybrid": use_hybrid and vectorizer is not None
                })

        else:
            return jsonify({"error": f"Unsupported file type: {content_type}"}), 400

    elif 'text' in request.form:
        text = request.form['text']
        tokenizer = preloaded["text_tokenizer"]
        model = preloaded["text_model"]
        vectorizer = preloaded["sparse_vectorizer"]
        
        # Generate a descriptive filename based on the text content
        text_preview = text[:20].strip()
        if len(text_preview) < len(text):
            text_preview += "..."
        filename = f"text_{text_preview.replace(' ', '_').replace('/', '_')}.txt"
        
        # If chunking is enabled and the text is long enough to chunk
        if use_chunking and len(text) > chunk_size:
            return embed_chunked_text(text, filename, "text/plain", mongo_ref, tokenizer, model, 
                                     chunk_size, chunk_overlap)
        else:
            # Process as a single document
            if use_hybrid and vectorizer:
                # Generate both dense and sparse embeddings
                dense_embedding, sparse_embedding = embed_with_sparse_vector(text, tokenizer, model, vectorizer)
                
                payload = {
                    "type": "text",
                    "mongo_ref": mongo_ref,
                    "filename": filename,
                    "preview": text[:100],
                    "content_type": "text/plain",
                    "is_chunk": False,
                    "document_id": mongo_ref,  # Self-referential for non-chunked docs
                    "has_sparse_embedding": True  # Flag indicating this has a sparse embedding
                }
                
                # Store with both embeddings using named vectors
                point = PointStruct(
                    id=vector_id,
                    vector={
                        "dense": dense_embedding,
                        "sparse": sparse_embedding
                    },
                    payload=payload
                )
            else:
                # Fall back to dense embedding only
                dense_embedding = embed_text(text, tokenizer, model)
                
                payload = {
                    "type": "text",
                    "mongo_ref": mongo_ref,
                    "filename": filename,
                    "preview": text[:100],
                    "content_type": "text/plain",
                    "is_chunk": False,
                    "document_id": mongo_ref,  # Self-referential for non-chunked docs
                    "has_sparse_embedding": False
                }
                
                # Store with dense embedding only
                point = PointStruct(
                    id=vector_id,
                    vector={"dense": dense_embedding},
                    payload=payload
                )
            
            qdrant.upsert(COLLECTION_NAME, [point])
            
            return jsonify({
                "vector_id": vector_id,
                "mongo_ref": mongo_ref,
                "chunked": False,
                "hybrid": use_hybrid and vectorizer is not None
            })

    else:
        return jsonify({"error": "No 'file' or 'text' provided"}), 400

@app.route('/list', methods=['GET'])
def list_entries():
    try:
        scroll = qdrant.scroll(COLLECTION_NAME, limit=1000)
        items = []
        for point in scroll[0]:
            items.append({
                "vector_id": point.id,
                "type": point.payload.get("type"),
                "mongo_ref": point.payload.get("mongo_ref"),
                "filename": point.payload.get("filename"),
                "content_type": point.payload.get("content_type"),
                "preview": point.payload.get("preview")
            })
        return jsonify(items)
    except Exception:
        return jsonify([])

@app.route('/search', methods=['POST'])
def search():
    """
    Accepts:
    - text via form-data field 'text'
    - file via 'file'
    - optional field 'limit'
    """
    limit = int(request.form.get("limit", 5))

    if 'file' in request.files:
        file = request.files['file']
        processor = preloaded["vision_processor"]
        model = preloaded["vision_model"]
        query_vector = embed_image_file(file, processor, model)
    elif 'text' in request.form:
        text = request.form['text']
        tokenizer = preloaded["text_tokenizer"]
        model = preloaded["text_model"]
        query_vector = embed_text(text, tokenizer, model)
    else:
        return jsonify({"error": "No 'file' or 'text' provided"}), 400

    hits = qdrant.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        limit=limit
    )

    results = []
    for hit in hits:
        # Create a result object with basic info
        result = {
            "vector_id": hit.id,
            "score": hit.score,
            "type": hit.payload.get("type"),
            "mongo_ref": hit.payload.get("mongo_ref"),
            "content_type": hit.payload.get("content_type"),
            "preview": hit.payload.get("preview")
        }
        
        # Ensure there's always a valid filename
        if hit.payload.get("filename"):
            result["filename"] = hit.payload.get("filename")
        elif hit.payload.get("preview"):
            # Generate a filename from preview if missing
            preview = hit.payload.get("preview", "")
            text_preview = preview[:20].strip()
            if len(text_preview) < len(preview):
                text_preview += "..."
            result["filename"] = f"text_{text_preview.replace(' ', '_').replace('/', '_')}.txt"
        else:
            # Fallback filename if no preview either
            result["filename"] = f"document_{hit.id[:8]}.txt"
            
        results.append(result)

    return jsonify(results)

@app.route('/search_reranked', methods=['POST'])
def search_reranked():
    """
    Accepts:
    - text via form-data field 'text'
    - file via 'file'
    - optional field 'limit'
    - optional field 'candidates' (number of initial candidates to retrieve before reranking)
    """
    print("\n===== SEARCH WITH RERANKING =====")
    limit = int(request.form.get("limit", 5))
    candidates = int(request.form.get("candidates", min(20, limit * 3)))  # Default to 3x limit or 20, whichever is smaller
    print(f"Request parameters: limit={limit}, candidates={candidates}")
    
    query_text = None
    
    if 'file' in request.files:
        file = request.files['file']
        print(f"Processing file search: {file.filename}")
        processor = preloaded["vision_processor"]
        model = preloaded["vision_model"]
        query_vector = embed_image_file(file, processor, model)
        # Use filename as query text for reranking
        query_text = file.filename
    elif 'text' in request.form:
        text = request.form['text']
        print(f"Processing text search: '{text}'")
        tokenizer = preloaded["text_tokenizer"]
        model = preloaded["text_model"]
        query_vector = embed_text(text, tokenizer, model)
        query_text = text
    else:
        return jsonify({"error": "No 'file' or 'text' provided"}), 400

    print(f"Initial vector search retrieving {candidates} candidates...")
    # Initial vector search to get candidates
    hits = qdrant.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        limit=candidates
    )
    print(f"Retrieved {len(hits)} candidates")

    # Convert hits to results format
    candidates_results = []
    for hit in hits:
        # Create a result object with basic info
        result = {
            "vector_id": hit.id,
            "score": hit.score,
            "type": hit.payload.get("type"),
            "mongo_ref": hit.payload.get("mongo_ref"),
            "content_type": hit.payload.get("content_type"),
            "preview": hit.payload.get("preview")
        }
        
        # Ensure there's always a valid filename
        if hit.payload.get("filename"):
            result["filename"] = hit.payload.get("filename")
        elif hit.payload.get("preview"):
            # Generate a filename from preview if missing
            preview = hit.payload.get("preview", "")
            text_preview = preview[:20].strip()
            if len(text_preview) < len(preview):
                text_preview += "..."
            result["filename"] = f"text_{text_preview.replace(' ', '_').replace('/', '_')}.txt"
        else:
            # Fallback filename if no preview either
            result["filename"] = f"document_{hit.id[:8]}.txt"
            
        candidates_results.append(result)
    
    # Skip reranking if no results or reranker not loaded
    if not candidates_results:
        print("No candidates found, skipping reranking")
        return jsonify(candidates_results[:limit])
    
    if not preloaded["reranker_model"] or not preloaded["reranker_tokenizer"]:
        print("Reranker model not loaded, skipping reranking")
        return jsonify(candidates_results[:limit])
    
    # Rerank results
    reranked_results = rerank_results(
        query_text,
        candidates_results,
        preloaded["reranker_tokenizer"],
        preloaded["reranker_model"]
    )
    
    final_results = reranked_results[:limit]
    print(f"Returning top {len(final_results)} results after reranking")
    print("===== SEARCH COMPLETE =====\n")
    
    # Return top results after reranking
    return jsonify(final_results)

@app.route('/delete/<vector_id>', methods=['DELETE'])
def delete_entry(vector_id):
    """
    Delete an entry from Qdrant by vector_id
    """
    try:
        # Check if the point exists first
        result = qdrant.retrieve(
            collection_name=COLLECTION_NAME,
            ids=[vector_id]
        )
        
        if not result:
            return jsonify({"error": f"Vector ID {vector_id} not found"}), 404
        
        # Delete the point
        qdrant.delete(
            collection_name=COLLECTION_NAME,
            points_selector=[vector_id]
        )
        
        return jsonify({
            "message": f"Successfully deleted vector ID {vector_id}",
            "vector_id": vector_id
        }), 200
        
    except Exception as e:
        return jsonify({"error": f"Failed to delete: {str(e)}"}), 500

@app.route('/fix_missing_filenames', methods=['POST'])
def fix_missing_filenames():
    """
    Fix existing records that don't have filenames
    This is a one-time utility to address the "half fake documents" issue
    """
    try:
        print("Starting to fix records with missing filenames...")
        scroll = qdrant.scroll(COLLECTION_NAME, limit=1000)
        fixed_count = 0
        
        for point in scroll[0]:
            point_id = point.id
            payload = point.payload
            
            # Check if this is a record that needs fixing (has no filename but has preview)
            if not payload.get("filename") and payload.get("preview"):
                print(f"Fixing record {point_id}")
                
                # Generate a filename based on the preview content
                preview = payload.get("preview", "")
                text_preview = preview[:20].strip()
                if len(text_preview) < len(preview):
                    text_preview += "..."
                
                # Create a valid filename from the preview
                filename = f"text_{text_preview.replace(' ', '_').replace('/', '_')}.txt"
                
                # Update the payload with the new filename
                payload["filename"] = filename
                
                # Update the record in Qdrant
                qdrant.upsert(
                    collection_name=COLLECTION_NAME,
                    points=[PointStruct(id=point_id, vector=point.vector, payload=payload)]
                )
                fixed_count += 1
        
        return jsonify({
            "message": f"Successfully fixed {fixed_count} records with missing filenames",
            "fixed_count": fixed_count
        })
        
    except Exception as e:
        return jsonify({"error": f"Failed to fix missing filenames: {str(e)}"}), 500

@app.route('/search_chunked', methods=['POST'])
def search_chunked():
    """
    Semantic search that's aware of document chunks.
    
    Accepts:
    - text via form-data field 'text'
    - file via 'file'
    - optional field 'limit' (default: 5)
    - optional field 'group_by_document' (default: true) - whether to group results by document
    - optional field 'chunks_per_doc' (default: 3) - how many chunks to return per document when grouping
    """
    print("\n===== CHUNKED SEARCH =====")
    limit = int(request.form.get("limit", 5))
    group_by_document = request.form.get("group_by_document", "true").lower() in ["true", "1", "yes"]
    chunks_per_doc = int(request.form.get("chunks_per_doc", 3))
    
    query_text = None
    
    if 'file' in request.files:
        file = request.files['file']
        print(f"Processing file search: {file.filename}")
        processor = preloaded["vision_processor"]
        model = preloaded["vision_model"]
        query_vector = embed_image_file(file, processor, model)
        query_text = file.filename
    elif 'text' in request.form:
        text = request.form['text']
        print(f"Processing text search: '{text}'")
        tokenizer = preloaded["text_tokenizer"]
        model = preloaded["text_model"]
        query_vector = embed_text(text, tokenizer, model)
        query_text = text
    else:
        return jsonify({"error": "No 'file' or 'text' provided"}), 400

    # If grouping by document, we need to get more hits to ensure good coverage
    search_limit = limit * 5 if group_by_document else limit
    
    print(f"Searching for {search_limit} candidates...")
    # Vector search to get candidates
    hits = qdrant.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        limit=search_limit
    )
    print(f"Retrieved {len(hits)} candidates")

    # Convert hits to results format
    results = []
    for hit in hits:
        # Create a result object with basic info
        result = {
            "vector_id": hit.id,
            "score": hit.score,
            "type": hit.payload.get("type"),
            "mongo_ref": hit.payload.get("mongo_ref"),
            "content_type": hit.payload.get("content_type"),
            "preview": hit.payload.get("preview"),
            "is_chunk": hit.payload.get("is_chunk", False),
            "document_id": hit.payload.get("document_id"),
            "chunk_index": hit.payload.get("chunk_index")
        }
        
        # Ensure there's always a valid filename
        if hit.payload.get("filename"):
            result["filename"] = hit.payload.get("filename")
        elif hit.payload.get("preview"):
            # Generate a filename from preview if missing
            preview = hit.payload.get("preview", "")
            text_preview = preview[:20].strip()
            if len(text_preview) < len(preview):
                text_preview += "..."
            result["filename"] = f"text_{text_preview.replace(' ', '_').replace('/', '_')}.txt"
        else:
            # Fallback filename if no preview either
            result["filename"] = f"document_{hit.id[:8]}.txt"
            
        results.append(result)
    
    # If not grouping, just return the top results
    if not group_by_document:
        final_results = results[:limit]
        print(f"Returning top {len(final_results)} results without grouping")
        print("===== SEARCH COMPLETE =====\n")
        return jsonify(final_results)
    
    # Group results by document_id
    print("Grouping results by document...")
    grouped_results = {}
    
    for result in results:
        doc_id = result.get("document_id")
        if not doc_id:
            continue
            
        if doc_id not in grouped_results:
            grouped_results[doc_id] = {
                "document_id": doc_id,
                "filename": result.get("filename"),
                "content_type": result.get("content_type"),
                "type": result.get("type"),
                "mongo_ref": result.get("mongo_ref"),
                "is_chunked_document": result.get("is_chunk", False),
                "score": result.get("score"),  # Use the highest chunk score as document score
                "chunks": []
            }
        
        # If this is a chunk, add it to the chunks list
        if result.get("is_chunk", False):
            if len(grouped_results[doc_id]["chunks"]) < chunks_per_doc:
                grouped_results[doc_id]["chunks"].append({
                    "vector_id": result.get("vector_id"),
                    "chunk_index": result.get("chunk_index"),
                    "preview": result.get("preview"),
                    "score": result.get("score")
                })
        
        # Update document score if this chunk has a higher score
        if result.get("score", 0) > grouped_results[doc_id].get("score", 0):
            grouped_results[doc_id]["score"] = result.get("score")
    
    # Convert to list and sort by document score
    doc_results = list(grouped_results.values())
    doc_results.sort(key=lambda x: x.get("score", 0), reverse=True)
    
    # Only return up to the limit
    final_results = doc_results[:limit]
    print(f"Returning top {len(final_results)} document results with chunks")
    print("===== SEARCH COMPLETE =====\n")
    
    return jsonify(final_results)

@app.route('/search_reranked_chunked', methods=['POST'])
def search_reranked_chunked():
    """
    Semantic search with reranking that's aware of document chunks.
    
    Accepts:
    - text via form-data field 'text'
    - file via 'file'
    - optional field 'limit' (default: 5)
    - optional field 'candidates' (default: 20 or 3x limit)
    - optional field 'group_by_document' (default: true)
    - optional field 'chunks_per_doc' (default: 3)
    """
    print("\n===== CHUNKED SEARCH WITH RERANKING =====")
    limit = int(request.form.get("limit", 5))
    candidates = int(request.form.get("candidates", min(20, limit * 3)))
    group_by_document = request.form.get("group_by_document", "true").lower() in ["true", "1", "yes"]
    chunks_per_doc = int(request.form.get("chunks_per_doc", 3))
    
    print(f"Request parameters: limit={limit}, candidates={candidates}, group_by_document={group_by_document}")
    
    query_text = None
    
    if 'file' in request.files:
        file = request.files['file']
        print(f"Processing file search: {file.filename}")
        processor = preloaded["vision_processor"]
        model = preloaded["vision_model"]
        query_vector = embed_image_file(file, processor, model)
        query_text = file.filename
    elif 'text' in request.form:
        text = request.form['text']
        print(f"Processing text search: '{text}'")
        tokenizer = preloaded["text_tokenizer"]
        model = preloaded["text_model"]
        query_vector = embed_text(text, tokenizer, model)
        query_text = text
    else:
        return jsonify({"error": "No 'file' or 'text' provided"}), 400

    # If grouping by document, we need to get more candidates to ensure good coverage
    search_limit = candidates * 2 if group_by_document else candidates
    
    print(f"Initial vector search retrieving {search_limit} candidates...")
    # Initial vector search to get candidates
    hits = qdrant.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        limit=search_limit
    )
    print(f"Retrieved {len(hits)} candidates")

    # Skip processing if no results
    if not hits:
        print("No candidates found")
        return jsonify([])
    
    # Convert hits to results format
    results = []
    for hit in hits:
        # Create a result object with basic info
        result = {
            "vector_id": hit.id,
            "score": hit.score,
            "type": hit.payload.get("type"),
            "mongo_ref": hit.payload.get("mongo_ref"),
            "content_type": hit.payload.get("content_type"),
            "preview": hit.payload.get("preview"),
            "is_chunk": hit.payload.get("is_chunk", False),
            "document_id": hit.payload.get("document_id"),
            "chunk_index": hit.payload.get("chunk_index")
        }
        
        # Ensure there's always a valid filename
        if hit.payload.get("filename"):
            result["filename"] = hit.payload.get("filename")
        elif hit.payload.get("preview"):
            # Generate a filename from preview if missing
            preview = hit.payload.get("preview", "")
            text_preview = preview[:20].strip()
            if len(text_preview) < len(preview):
                text_preview += "..."
            result["filename"] = f"text_{text_preview.replace(' ', '_').replace('/', '_')}.txt"
        else:
            # Fallback filename if no preview either
            result["filename"] = f"document_{hit.id[:8]}.txt"
            
        results.append(result)
    
    # Skip reranking if reranker not loaded
    if not preloaded["reranker_model"] or not preloaded["reranker_tokenizer"]:
        print("Reranker model not loaded, skipping reranking")
        # If not grouping, just return the top results
        if not group_by_document:
            return jsonify(results[:limit])
    else:
        # Rerank results - we rerank before grouping for better quality
        results = rerank_results(
            query_text,
            results,
            preloaded["reranker_tokenizer"],
            preloaded["reranker_model"]
        )
    
    # If not grouping, just return the top reranked results
    if not group_by_document:
        final_results = results[:limit]
        print(f"Returning top {len(final_results)} results without grouping")
        print("===== SEARCH COMPLETE =====\n")
        return jsonify(final_results)
    
    # Group results by document_id
    print("Grouping results by document...")
    grouped_results = {}
    
    for result in results:
        doc_id = result.get("document_id")
        if not doc_id:
            continue
            
        if doc_id not in grouped_results:
            grouped_results[doc_id] = {
                "document_id": doc_id,
                "filename": result.get("filename"),
                "content_type": result.get("content_type"),
                "type": result.get("type"),
                "mongo_ref": result.get("mongo_ref"),
                "is_chunked_document": result.get("is_chunk", False),
                "score": result.get("score"),
                "original_score": result.get("original_score", result.get("score")),
                "chunks": []
            }
        
        # If this is a chunk, add it to the chunks list
        if result.get("is_chunk", False):
            if len(grouped_results[doc_id]["chunks"]) < chunks_per_doc:
                grouped_results[doc_id]["chunks"].append({
                    "vector_id": result.get("vector_id"),
                    "chunk_index": result.get("chunk_index"),
                    "preview": result.get("preview"),
                    "score": result.get("score"),
                    "original_score": result.get("original_score", result.get("score"))
                })
        
        # Update document score if this chunk/result has a higher score
        if result.get("score", 0) > grouped_results[doc_id].get("score", 0):
            grouped_results[doc_id]["score"] = result.get("score")
            if "original_score" in result:
                grouped_results[doc_id]["original_score"] = result.get("original_score")
    
    # Convert to list and sort by document score
    doc_results = list(grouped_results.values())
    doc_results.sort(key=lambda x: x.get("score", 0), reverse=True)
    
    # Only return up to the limit
    final_results = doc_results[:limit]
    print(f"Returning top {len(final_results)} document results with chunks")
    print("===== SEARCH WITH RERANKING COMPLETE =====\n")
    
    return jsonify(final_results)

@app.route('/delete_document/<filename>', methods=['DELETE'])
def delete_document(filename):
    """
    Delete all entries associated with a document filename from Qdrant, including all its chunks
    """
    try:
        print(f"\n===== DELETING DOCUMENT: {filename} =====")
        
        # First, find all entries with this filename
        filter_by_filename = Filter(
            must=[
                FieldCondition(
                    key="filename",
                    match=MatchValue(value=filename)
                )
            ]
        )
        
        # Get all matching points
        search_result = qdrant.scroll(
            collection_name=COLLECTION_NAME,
            scroll_filter=filter_by_filename,
            limit=1000
        )
        
        matching_points = search_result[0]
        print(f"Found {len(matching_points)} points with filename '{filename}'")
        
        if not matching_points:
            print(f"No entries found for filename: {filename}")
            return jsonify({"message": f"No entries found for filename: {filename}", "deleted_count": 0}), 404
        
        # Extract all vector IDs to delete
        vector_ids_to_delete = [point.id for point in matching_points]
        
        # Also check if any of these points are a document_id for other chunks
        for point in matching_points:
            if point.payload.get("mongo_ref"):
                document_id = point.payload.get("mongo_ref")
                
                # Find all chunks that reference this document_id
                filter_by_document_id = Filter(
                    must=[
                        FieldCondition(
                            key="document_id",
                            match=MatchValue(value=document_id)
                        )
                    ]
                )
                
                chunks_result = qdrant.scroll(
                    collection_name=COLLECTION_NAME,
                    scroll_filter=filter_by_document_id,
                    limit=1000
                )
                
                chunk_points = chunks_result[0]
                chunk_ids = [chunk.id for chunk in chunk_points if chunk.id not in vector_ids_to_delete]
                
                if chunk_ids:
                    print(f"Found {len(chunk_ids)} additional chunks for document_id '{document_id}'")
                    vector_ids_to_delete.extend(chunk_ids)
        
        # Delete all the points
        if vector_ids_to_delete:
            print(f"Deleting {len(vector_ids_to_delete)} total points")
            qdrant.delete(
                collection_name=COLLECTION_NAME,
                points_selector=vector_ids_to_delete
            )
            
            return jsonify({
                "message": f"Successfully deleted document '{filename}' with all its chunks",
                "deleted_count": len(vector_ids_to_delete),
                "vector_ids": vector_ids_to_delete
            }), 200
        
        return jsonify({"message": f"No vectors found to delete for '{filename}'", "deleted_count": 0}), 404
        
    except Exception as e:
        print(f"Error deleting document {filename}: {str(e)}")
        return jsonify({"error": f"Failed to delete document: {str(e)}"}), 500

@app.route('/hybrid_search', methods=['POST'])
def hybrid_search():
    """
    Hybrid search that combines dense (semantic) and sparse (keyword) search results.
    
    Accepts:
    - text via form-data field 'text'
    - optional field 'limit' (default: 10)
    - optional field 'sparse_weight' (default: 0.5) - weight given to sparse results (0-1)
    - optional field 'min_score' (default: 0.3) - minimum score threshold
    
    Returns:
    - List of results combining both semantic and keyword matching
    """
    print("\n===== HYBRID SEARCH =====")
    limit = int(request.form.get("limit", 10))
    sparse_weight = float(request.form.get("sparse_weight", 0.5))
    min_score = float(request.form.get("min_score", 0.3))
    
    # Ensure valid weight range
    sparse_weight = max(0.0, min(1.0, sparse_weight))
    dense_weight = 1.0 - sparse_weight
    
    # Get query text - only text queries supported for hybrid search
    if 'text' not in request.form:
        return jsonify({"error": "Hybrid search requires a text query"}), 400
    
    query_text = request.form['text']
    print(f"Hybrid search query: '{query_text}'")
    print(f"Parameters: limit={limit}, sparse_weight={sparse_weight}, dense_weight={dense_weight}")
    
    # Generate both dense and sparse embeddings for the query
    tokenizer = preloaded["text_tokenizer"]
    model = preloaded["text_model"]
    vectorizer = preloaded["sparse_vectorizer"]
    
    if not vectorizer:
        print("Sparse vectorizer not loaded, falling back to dense search only")
        return search()
    
    # Generate dense and sparse embeddings for the query
    dense_embedding = embed_text(query_text, tokenizer, model)
    sparse_embedding = generate_sparse_embedding(query_text, vectorizer)
    
    # Perform hybrid search using named vectors
    try:
        # Get extended candidate set
        search_limit = limit * 3
        
        # Perform searches with both vectors
        print(f"Searching with both vectors, retrieving {search_limit} candidates for each...")
        
        # Dense vector search
        dense_hits = qdrant.search(
            collection_name=COLLECTION_NAME,
            query_vector={"dense": dense_embedding},
            limit=search_limit,
            score_threshold=min_score
        )
        print(f"Dense search returned {len(dense_hits)} results")
        
        # Sparse vector search
        sparse_hits = qdrant.search(
            collection_name=COLLECTION_NAME,
            query_vector={"sparse": sparse_embedding},
            limit=search_limit,
            score_threshold=min_score
        )
        print(f"Sparse search returned {len(sparse_hits)} results")
        
        # Combine results with weighted scores
        combined_results = {}
        
        # Process dense results
        for hit in dense_hits:
            vector_id = hit.id
            combined_results[vector_id] = {
                "vector_id": vector_id,
                "dense_score": hit.score,
                "sparse_score": 0.0,
                "score": dense_weight * hit.score,  # Weighted dense score
                "payload": hit.payload
            }
        
        # Process sparse results
        for hit in sparse_hits:
            vector_id = hit.id
            if vector_id in combined_results:
                # Update existing result with sparse score
                combined_results[vector_id]["sparse_score"] = hit.score
                combined_results[vector_id]["score"] += sparse_weight * hit.score
            else:
                # Add new result
                combined_results[vector_id] = {
                    "vector_id": vector_id,
                    "dense_score": 0.0,
                    "sparse_score": hit.score,
                    "score": sparse_weight * hit.score,  # Weighted sparse score
                    "payload": hit.payload
                }
        
        # Convert to list and sort by combined score
        results_list = list(combined_results.values())
        results_list.sort(key=lambda x: x["score"], reverse=True)
        
        # Format the final results
        final_results = []
        for result in results_list[:limit]:
            formatted_result = {
                "vector_id": result["vector_id"],
                "score": result["score"],
                "dense_score": result["dense_score"],
                "sparse_score": result["sparse_score"],
                "type": result["payload"].get("type"),
                "mongo_ref": result["payload"].get("mongo_ref"),
                "content_type": result["payload"].get("content_type"),
                "preview": result["payload"].get("preview"),
                "is_chunk": result["payload"].get("is_chunk", False),
                "document_id": result["payload"].get("document_id"),
                "chunk_index": result["payload"].get("chunk_index")
            }
            
            # Ensure there's always a valid filename
            if result["payload"].get("filename"):
                formatted_result["filename"] = result["payload"].get("filename")
            elif result["payload"].get("preview"):
                # Generate a filename from preview if missing
                preview = result["payload"].get("preview", "")
                text_preview = preview[:20].strip()
                if len(text_preview) < len(preview):
                    text_preview += "..."
                formatted_result["filename"] = f"text_{text_preview.replace(' ', '_').replace('/', '_')}.txt"
            else:
                # Fallback filename if no preview either
                formatted_result["filename"] = f"document_{result['vector_id'][:8]}.txt"
                
            final_results.append(formatted_result)
        
        print(f"Returning top {len(final_results)} hybrid search results")
        print("===== HYBRID SEARCH COMPLETE =====\n")
        
        return jsonify(final_results)
        
    except Exception as e:
        print(f"Error during hybrid search: {str(e)}")
        # Fall back to regular search
        print("Falling back to regular search")
        return search()

if __name__ == "__main__":
    if PRELOAD_MODELS:
        print("Preloading models into memory...")
        preloaded = load_models()
        print("Models loaded.")
    
    # Check if we need to initialize sparse vectorizer with sample data
    if preloaded["sparse_vectorizer"] and USE_HYBRID_SEARCH:
        try:
            # Get some sample documents to initialize the vectorizer
            print("Initializing sparse vectorizer with existing documents...")
            scroll = qdrant.scroll(
                collection_name=COLLECTION_NAME,
                limit=100,
                with_payload=True,
                with_vectors=False
            )
            
            sample_texts = []
            for point in scroll[0]:
                if point.payload.get("type") == "text" and point.payload.get("preview"):
                    sample_texts.append(point.payload.get("preview", ""))
            
            if sample_texts:
                print(f"Found {len(sample_texts)} sample texts for vectorizer initialization")
                preloaded["sparse_vectorizer"] = update_vectorizer_vocabulary(
                    preloaded["sparse_vectorizer"], 
                    sample_texts
                )
            else:
                print("No existing text documents found to initialize vectorizer")
        except Exception as e:
            print(f"Error initializing sparse vectorizer: {e}")
            
    ensure_collection_exists()
    app.run(host="0.0.0.0", port=8080)
