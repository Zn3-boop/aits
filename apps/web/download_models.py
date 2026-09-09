#!/usr/bin/env python3
"""Download face-api.js model weights from GitHub Release."""
import urllib.request
import os
import sys

MODELS_DIR = os.path.join(os.path.dirname(__file__), "public", "models")
BASE_URL = "https://github.com/justadudewhohacks/face-api.js/raw/master/weights"

FILES = [
    "tiny_face_detector_model-weights_manifest.json",
    "tiny_face_detector_model-shard1",
    "face_expression_model-weights_manifest.json",
    "face_expression_model-shard1",
]

os.makedirs(MODELS_DIR, exist_ok=True)

for f in FILES:
    dest = os.path.join(MODELS_DIR, f)
    url = f"{BASE_URL}/{f}"
    print(f"Downloading {f}...", end=" ", flush=True)
    try:
        urllib.request.urlretrieve(url, dest)
        size = os.path.getsize(dest)
        print(f"OK ({size} bytes)")
    except Exception as e:
        print(f"FAILED: {e}")
        sys.exit(1)

# Validate face_expression_model-shard1 size (should be ~5MB)
shard_path = os.path.join(MODELS_DIR, "face_expression_model-shard1")
shard_size = os.path.getsize(shard_path)
if shard_size < 4_000_000:
    print(f"WARNING: face_expression_model-shard1 is only {shard_size} bytes, expected ~5MB. File may be incomplete.")
    sys.exit(1)
else:
    print(f"All models downloaded successfully! face_expression_model-shard1 = {shard_size} bytes")
