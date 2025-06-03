from ultralytics import YOLO as yolo
import easyocr
import cv2
import tempfile
import os

IMAGE_PATH = "7.jpg" 

model = yolo.load("hermanshid/yolo-layout-detector")
ocr_reader = easyocr.Reader(['en'])

def run_pix2tex(image_path):
    return "LaTeX_code_here"

img = cv2.imread(IMAGE_PATH)
if img is None:
    print(f"Error: Could not read image {IMAGE_PATH}")
    exit(1)

results = model.predict(IMAGE_PATH)
layout_data = []

for box in results.boxes:
    xyxy = [int(coord) for coord in box.xyxy[0]]
    label = results.names[int(box.cls[0])]
    conf = float(box.conf[0])
    region_img = img[xyxy[1]:xyxy[3], xyxy[0]:xyxy[2]]

    region_info = {
        'label': label,
        'confidence': conf,
        'bbox': xyxy
    }

    if label.lower() in ['text', 'paragraph', 'caption', 'table']:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            cv2.imwrite(tmp.name, region_img)
            ocr_result = ocr_reader.readtext(tmp.name, detail=0)
            region_info['text'] = " ".join(ocr_result)
            os.unlink(tmp.name)
    elif label.lower() in ['math', 'equation']:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            cv2.imwrite(tmp.name, region_img)
            latex = run_pix2tex(tmp.name)
            region_info['latex'] = latex
            os.unlink(tmp.name)
    layout_data.append(region_info)

print("\n--- Layout Analysis Results ---")
for region in layout_data:
    print(f"\nLabel: {region['label']}")
    print(f"Confidence: {region['confidence']:.2f}")
    print(f"Bounding Box: {region['bbox']}")
    if 'text' in region:
        print(f"Extracted Text: {region['text']}")
    if 'latex' in region:
        print(f"Extracted LaTeX: {region['latex']}")
