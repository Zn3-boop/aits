#!/usr/bin/env python3
"""Download vladmandic tiny_face_detector manifest and clean up old files."""
import urllib.request
import os

models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public', 'models')

# Download tiny_face_detector manifest (overwrites old one)
url = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/tiny_face_detector_model-weights_manifest.json'
dest = os.path.join(models_dir, 'tiny_face_detector_model-weights_manifest.json')
print(f'Downloading tiny_face_detector manifest...', end=' ', flush=True)
urllib.request.urlretrieve(url, dest)
print(f'OK ({os.path.getsize(dest)} bytes)')

# Rename old shard1 to .bin (vladmandic uses .bin extension)
old_shard = os.path.join(models_dir, 'tiny_face_detector_model-shard1')
new_bin = os.path.join(models_dir, 'tiny_face_detector_model.bin')
if os.path.exists(old_shard) and not os.path.exists(new_bin):
    os.rename(old_shard, new_bin)
    print(f'Renamed tiny_face_detector_model-shard1 -> tiny_face_detector_model.bin')

# Remove old face_expression shard1 if exists
old_expr_shard = os.path.join(models_dir, 'face_expression_model-shard1')
if os.path.exists(old_expr_shard):
    os.remove(old_expr_shard)
    print(f'Removed old face_expression_model-shard1')

# Clean up nested public/models/public directory
import shutil
nested = os.path.join(models_dir, 'public')
if os.path.exists(nested):
    shutil.rmtree(nested)
    print(f'Removed nested public/ directory')

# List final files
print('\nFinal model files:')
for f in sorted(os.listdir(models_dir)):
    fp = os.path.join(models_dir, f)
    if os.path.isfile(fp):
        print(f'  {f} ({os.path.getsize(fp)} bytes)')
