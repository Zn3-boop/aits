#!/usr/bin/env python3
"""
Alternative: Download smaller face-expression model from @vladmandic/face-api
This fork uses quantized models that are much smaller than the original.
"""
import urllib.request
import os
import json

models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public', 'models')
os.makedirs(models_dir, exist_ok=True)

# @vladmandic/face-api uses smaller quantized models hosted on jsdelivr
# These are much smaller than the original face-api.js models
sources = [
    ('vladmandic face_expression model', 
     'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/face_expression_model-shard1',
     os.path.join(models_dir, 'face_expression_model-shard1')),
    ('vladmandic face_expression manifest',
     'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/face_expression_model-weights_manifest.json',
     os.path.join(models_dir, 'face_expression_model-weights_manifest.json')),
    ('vladmandic tiny_face_detector shard1',
     'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/tiny_face_detector_model-shard1',
     os.path.join(models_dir, 'tiny_face_detector_model-shard1')),
    ('vladmandic tiny_face_detector manifest',
     'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/tiny_face_detector_model-weights_manifest.json',
     os.path.join(models_dir, 'tiny_face_detector_model-weights_manifest.json')),
]

all_ok = True
for name, url, dest in sources:
    print(f'Downloading {name}...')
    try:
        urllib.request.urlretrieve(url, dest)
        size = os.path.getsize(dest)
        print(f'  OK: {size} bytes ({size/1024:.1f} KB)')
        # Validate manifest files are valid JSON
        if dest.endswith('.json'):
            with open(dest) as f:
                json.load(f)
            print(f'  Valid JSON')
    except Exception as e:
        print(f'  FAILED: {e}')
        all_ok = False

if all_ok:
    print('\nAll models downloaded successfully!')
else:
    print('\nSome downloads failed!')
