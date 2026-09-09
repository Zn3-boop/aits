#!/usr/bin/env python3
"""Download face-api.js model from multiple CDN sources."""
import urllib.request
import os

dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public', 'models', 'face_expression_model-shard1')

# Try multiple CDN sources
sources = [
    ('jsDelivr', 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights/face_expression_model-shard1'),
    ('unpkg', 'https://unpkg.com/face-api.js@0.22.2/weights/face_expression_model-shard1'),
    ('GitHub Raw', 'https://github.com/justadudewhohacks/face-api.js/raw/0.22.2/weights/face_expression_model-shard1'),
]

for name, url in sources:
    print(f'Trying {name}: {url}')
    try:
        urllib.request.urlretrieve(url, dest)
        size = os.path.getsize(dest)
        print(f'  Downloaded: {size} bytes ({size/1024/1024:.1f} MB)')
        if size > 4000000:
            print(f'  SUCCESS from {name}!')
            break
        else:
            print(f'  Too small, trying next source...')
            os.remove(dest)
    except Exception as e:
        print(f'  Failed: {e}')
        if os.path.exists(dest):
            os.remove(dest)
else:
    print('All sources failed!')
