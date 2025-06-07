import os
import io
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel, AutoImageProcessor
from PIL import Image
from flask import Flask, request, jsonify
from qdrant_client import QdrantClient
from qdrant_client.http.models import PointStruct, VectorParams, Distance
import uuid
print("Starting embedding service...")
TEXT_MODEL = "nomic-ai/nomic-embed-text-v1.5"
VISION_MODEL = "nomic-ai/nomic-embed-vision-v1.5"
CACHE_DIR = "./hf_cache"
QDRANT_HOST = "qdrant"
QDRANT_PORT = 6333
COLLECTION_NAME = "jam_embeddings"
VECTOR_SIZE = 768

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

preloaded = {
    "text_tokenizer": None,
    "text_model": None,
    "vision_processor": None,
    "vision_model": None,
}

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

@app.route('/embed', methods=['POST'])
def embed():
    mongo_ref = str(uuid.uuid4())
    vector_id = str(uuid.uuid4())

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
            embedding = embed_text(text, tokenizer, model)

            payload = {
                "type": "text",
                "mongo_ref": mongo_ref,
                "filename": file.filename,
                "preview": text[:100],
                "content_type": content_type
            }

        else:
            return jsonify({"error": f"Unsupported file type: {content_type}"}), 400

    elif 'text' in request.form:
        text = request.form['text']
        tokenizer = preloaded["text_tokenizer"]
        model = preloaded["text_model"]
        embedding = embed_text(text, tokenizer, model)
        print('hiiiii')
        payload = {
            "type": "text",
            "mongo_ref": mongo_ref,
            "preview": text[:100],
            "content_type": "text/plain"

        }

    else:
        return jsonify({"error": "No 'file' or 'text' provided"}), 400

    point = PointStruct(id=vector_id, vector=embedding, payload=payload)
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
        results.append({
            "vector_id": hit.id,
            "score": hit.score,  # Add the missing score field
            "type": hit.payload.get("type"),
            "mongo_ref": hit.payload.get("mongo_ref"),
            "filename": hit.payload.get("filename"),
            "content_type": hit.payload.get("content_type"),
            "preview": hit.payload.get("preview")
        })

    return jsonify(results)

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

if __name__ == "__main__":
    if PRELOAD_MODELS:
        print("Preloading models into memory...")
        preloaded["text_tokenizer"], preloaded["text_model"] = load_text_model_and_tokenizer()
        preloaded["vision_processor"], preloaded["vision_model"] = load_vision_model_and_processor()
        print("Models loaded.")
    ensure_collection_exists()
    app.run(host="0.0.0.0", port=8080)
