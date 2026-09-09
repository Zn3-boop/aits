#!/usr/bin/env python3
import urllib.request
import os

dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public', 'models', 'face_expression_model-shard1')
url = 'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_expression_model-shard1'

print(f'Downloading to {dest}...')
urllib.request.urlretrieve(url, dest)
size = os.path.getsize(dest)
print(f'Done! Size: {size} bytes ({size/1024/1024:.1f} MB)')
if size < 4000000:
    print('WARNING: File too small, expected ~5MB. Download may be incomplete.')
else:
    print('SUCCESS: File size looks correct!')
