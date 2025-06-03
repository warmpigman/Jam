import base64
import requests
import sys
import json
import os

def encode_image_to_base64(image_path):
    with open(image_path, "rb") as image_file:
        encoded = base64.b64encode(image_file.read()).decode("utf-8")
    return encoded

def read_text_file(text_path):
    with open(text_path, "r", encoding="utf-8") as text_file:
        return text_file.read()

def detect_file_type(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    image_exts = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'}
    text_exts = {'.txt'}
    if ext in image_exts:
        return "image"
    elif ext in text_exts:
        return "text"
    else:
        raise ValueError(f"Unsupported file extension: {ext}")

def send_file_to_server(file_path, server_url="http://localhost:8080/embed"):
    file_type = detect_file_type(file_path)
    if file_type == "image":
        data = encode_image_to_base64(file_path)
    elif file_type == "text":
        data = read_text_file(file_path)
    else:
        raise ValueError("Unsupported file type")

    payload = {
        "type": file_type,
        "data": data
    }
    headers = {"Content-Type": "application/json"}
    response = requests.post(server_url, data=json.dumps(payload), headers=headers)
    print("Status code:", response.status_code)
    try:
        print("Response:", response.json())
    except Exception:
        print("Response text:", response.text)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("python testupload.py <file_path>")
        sys.exit(1)
    send_file_to_server(sys.argv[1])