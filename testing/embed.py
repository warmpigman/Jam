import sys
import os
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel, AutoImageProcessor
from PIL import Image

TEXT_MODEL = "nomic-ai/nomic-embed-text-v1.5"
VISION_MODEL = "nomic-ai/nomic-embed-vision-v1.5"
CACHE_DIR = "./hf_cache"

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

def is_image(filename):
    ext = os.path.splitext(filename)[1].lower()
    return ext in ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp']

def embed_text(text):
    tokenizer = AutoTokenizer.from_pretrained(TEXT_MODEL, cache_dir=CACHE_DIR, trust_remote_code=True, use_fast=True)
    model = AutoModel.from_pretrained(TEXT_MODEL, cache_dir=CACHE_DIR, trust_remote_code=True).to(device)
    model.eval()
    encoded_input = tokenizer([text], padding=True, truncation=True, return_tensors='pt').to(device)
    with torch.no_grad():
        model_output = model(**encoded_input)
        token_embeddings = model_output.last_hidden_state
        input_mask_expanded = encoded_input['attention_mask'].unsqueeze(-1).expand(token_embeddings.size()).float()
        pooled = torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        embedding = F.normalize(pooled, p=2, dim=1)
    return embedding[0].cpu().tolist()

def embed_image(image_path):
    processor = AutoImageProcessor.from_pretrained(VISION_MODEL, cache_dir=CACHE_DIR, use_fast=True)
    model = AutoModel.from_pretrained(VISION_MODEL, cache_dir=CACHE_DIR, trust_remote_code=True).to(device)
    model.eval()
    image = Image.open(image_path).convert('RGB')
    inputs = processor(image, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model(**inputs)
        img_emb = outputs.last_hidden_state[:, 0]
        embedding = F.normalize(img_emb, p=2, dim=1)
    return embedding[0].cpu().tolist()

def main(filepath):
    if is_image(filepath):
        print(f"Detected image file: {filepath}")
        embedding = embed_image(filepath)
    else:
        print(f"Detected text file: {filepath}")
        with open(filepath, 'r', encoding='utf-8') as f:
            text = f.read().strip()
        embedding = embed_text(text)
    print("Embedding vector:", embedding)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("python embed_nomic.py <path-to-text-or-image-file>")
        sys.exit(1)
    main(sys.argv[1])
