#!/usr/bin/env python3
import json, os

models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public', 'models')

# Calculate expected size from manifest
with open(os.path.join(models_dir, 'face_expression_model-weights_manifest.json')) as f:
    data = json.load(f)

total = 0
for w in data[0]['weights']:
    size = 1
    for s in w['shape']:
        size *= s
    if w.get('quantization', {}).get('dtype') == 'uint8':
        total += size  # 1 byte per value
    else:
        total += size * 4  # float32 = 4 bytes

actual = os.path.getsize(os.path.join(models_dir, 'face_expression_model.bin'))
print(f'Expected size: {total} bytes ({total/1024:.1f} KB)')
print(f'Actual size:   {actual} bytes ({actual/1024:.1f} KB)')
if actual >= total:
    print('SUCCESS: File size matches or exceeds expected!')
else:
    print(f'MISSING: {total - actual} bytes short ({(total-actual)/1024:.1f} KB)')

# Also check tiny_face_detector
with open(os.path.join(models_dir, 'tiny_face_detector_model-weights_manifest.json')) as f:
    data2 = json.load(f)

total2 = 0
for w in data2[0]['weights']:
    size = 1
    for s in w['shape']:
        size *= s
    if w.get('quantization', {}).get('dtype') == 'uint8':
        total2 += size
    else:
        total2 += size * 4

actual2 = os.path.getsize(os.path.join(models_dir, 'tiny_face_detector_model-shard1'))
print(f'\ntiny_face_detector expected: {total2} bytes ({total2/1024:.1f} KB)')
print(f'tiny_face_detector actual:   {actual2} bytes ({actual2/1024:.1f} KB)')
if actual2 >= total2:
    print('SUCCESS: File size matches!')
else:
    print(f'MISSING: {total2 - actual2} bytes short')
