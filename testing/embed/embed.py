import os
import io
import base64
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel, AutoImageProcessor
from PIL import Image
from flask import Flask, request, jsonify
from qdrant_client import QdrantClient
from qdrant_client.http.models import PointStruct, VectorParams, Distance
import uuid

TEXT_MODEL = "nomic-ai/nomic-embed-text-v1.5"
VISION_MODEL = "nomic-ai/nomic-embed-vision-v1.5"
CACHE_DIR = "./hf_cache"
QDRANT_HOST = "qdrant"
QDRANT_PORT = 6333
COLLECTION_NAME = "jam_embeddings"
VECTOR_SIZE = 768  # Nomic v1.5 embedding size

# Load models at startup
PRELOAD_MODELS = True
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
app = Flask(__name__)

preloaded = {
    "text_tokenizer": None,
    "text_model": None,
    "vision_processor": None,
    "vision_model": None,
}

# Qdrant client setup
qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

def ensure_collection_exists():
    collections = [c.name for c in qdrant.get_collections().collections]
    if COLLECTION_NAME not in collections:
        qdrant.create_collection(
            COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE)
        )
        print(f"Created Qdrant collection '{COLLECTION_NAME}' with size {VECTOR_SIZE}.")
    else:
        print(f"Qdrant collection '{COLLECTION_NAME}' already exists.")

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

def embed_text(text, tokenizer, model):
    # Use 'search_query:' prefix for retrieval tasks
    encoded_input = tokenizer(['search_query: ' + text], padding=True, truncation=True, return_tensors='pt').to(device)
    with torch.no_grad():
        model_output = model(**encoded_input)
        token_embeddings = model_output.last_hidden_state
        input_mask_expanded = encoded_input['attention_mask'].unsqueeze(-1).expand(token_embeddings.size()).float()
        pooled = torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        embedding = F.normalize(pooled, p=2, dim=1)
    return embedding[0].cpu().numpy()

def decode_base64_image(base64_string):
    if ',' in base64_string:
        base64_string = base64_string.split(',')[1]
    image_bytes = base64.b64decode(base64_string)
    image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    return image

def embed_image_base64(base64_string, processor, model):
    image = decode_base64_image(base64_string)
    inputs = processor(image, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model(**inputs)
        img_emb = outputs.last_hidden_state[:, 0]
        embedding = F.normalize(img_emb, p=2, dim=1)
    return embedding[0].cpu().numpy()

@app.route('/embed', methods=['POST'])
def embed():
    """
    POST JSON:
    {
      "type": "text" or "image",
      "data": "text string" or "base64-encoded image string"
    }
    """
    req = request.get_json()
    if not req or 'type' not in req or 'data' not in req:
        return jsonify({"error": "Request must contain 'type' and 'data'"}), 400

    # Generate a fake MongoDB reference (UUID)
    mongo_ref = str(uuid.uuid4())

    if req['type'] == 'text':
        tokenizer = preloaded["text_tokenizer"]
        model = preloaded["text_model"]
        embedding = embed_text(req['data'], tokenizer, model)
        payload = {"type": "text", "data": mongo_ref}
    elif req['type'] == 'image':
        processor = preloaded["vision_processor"]
        model = preloaded["vision_model"]
        embedding = embed_image_base64(req['data'], processor, model)
        payload = {"type": "image", "data": mongo_ref}
    else:
        return jsonify({"error": "Invalid type. Must be 'text' or 'image'."}), 400

    vector_id = str(uuid.uuid4())
    point = PointStruct(
        id=vector_id,
        vector=embedding,
        payload=payload
    )
    qdrant.upsert(COLLECTION_NAME, [point])

    return jsonify({
        "embedding": embedding.tolist(),
        "vector_id": vector_id,
        "mongo_ref": mongo_ref
    })

@app.route('/list', methods=['GET'])
def list_entries():
    try:
        scroll = qdrant.scroll(COLLECTION_NAME, limit=1000)
        items = []
        for point in scroll[0]:
            items.append({
                "id": point.id,
                "type": point.payload.get("type"),
                "data": point.payload.get("data")
            })
        return jsonify(items)
    except Exception as e:
        # If the collection doesn't exist, return an empty list
        return jsonify([])

@app.route('/search', methods=['POST'])
def search():
    """
    POST JSON:
    {
      "type": "text" or "image",
      "data": "text string" or "base64-encoded image string",
      "limit": 5  # optional, default 5
    }
    """
    req = request.get_json()
    if not req or 'type' not in req or 'data' not in req:
        return jsonify({"error": "Request must contain 'type' and 'data'"}), 400

    limit = req.get("limit", 5)

    if req['type'] == 'text':
        tokenizer = preloaded["text_tokenizer"]
        model = preloaded["text_model"]
        query_vector = embed_text(req['data'], tokenizer, model)
    elif req['type'] == 'image':
        processor = preloaded["vision_processor"]
        model = preloaded["vision_model"]
        query_vector = embed_image_base64(req['data'], processor, model)
    else:
        return jsonify({"error": "Invalid type. Must be 'text' or 'image'."}), 400

    # Perform vector search in Qdrant
    hits = qdrant.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        limit=limit
    )

    results = []
    for hit in hits:
        results.append({
            "id": hit.id,
            "score": hit.score,
            "type": hit.payload.get("type"),
            "data": hit.payload.get("data")
        })

    return jsonify(results)

if __name__ == "__main__":
    if PRELOAD_MODELS:
        print("Preloading models into memory...")
        preloaded["text_tokenizer"], preloaded["text_model"] = load_text_model_and_tokenizer()
        preloaded["vision_processor"], preloaded["vision_model"] = load_vision_model_and_processor()
        print("Models loaded.")
    ensure_collection_exists()
    app.run(host="0.0.0.0", port=8080)