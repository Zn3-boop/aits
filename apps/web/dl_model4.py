#!/usr/bin/env python3
"""Download @vladmandic/face-api quantized models (much smaller than original)."""
import urllib.request
import os
import json

models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public', 'models')
os.makedirs(models_dir, exist_ok=True)

# vladmandic uses .bin extension and quantized weights (much smaller)
files = [
    ('face_expression_model.bin', 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/face_expression_model.bin'),
    ('face_expression_model-weights_manifest.json', 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/face_expression_model-weights_manifest.json'),
    ('tiny_face_detector_model.bin', 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/tiny_face_detector_model.bin'),
    ('tiny_face_detector_model-weights_manifest.json', 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/tiny_face_detector_model-weights_manifest.json'),
]

all_ok = True
for filename, url in files:
    dest = os.path.join(models_dir, filename)
    print(f'Downloading {filename}...', end=' ', flush=True)
    try:
        urllib.request.urlretrieve(url, dest)
        size = os.path.getsize(dest)
        print(f'OK ({size} bytes, {size/1024:.1f} KB)')
        if dest.endswith('.json'):
            with open(dest) as f:
                json.load(f)
            print(f'  Valid JSON')
    except Exception as e:
        print(f'FAILED: {e}')
        all_ok = False

if all_ok:
    print('\nAll models downloaded! Now update useFaceEmotion.ts to use @vladmandic/face-api')
else:
    print('\nSome downloads failed!')
