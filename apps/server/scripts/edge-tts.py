#!/usr/bin/env python3
"""Edge TTS wrapper for Node.js"""

import sys
import asyncio
import argparse
import tempfile
import os

async def synthesize(text: str, voice: str, output: str):
    try:
        from edge_tts import Communicate
        
        communicate = Communicate(text, voice)
        await communicate.save(output)
        return True
    except ImportError:
        print("ERROR: edge-tts not installed. Run: pip install edge-tts", file=sys.stderr)
        return False
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return False

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--text', required=True, help='Text to synthesize')
    parser.add_argument('--voice', default='zh-CN-XiaoxiaoNeural', help='Voice name')
    parser.add_argument('--output', help='Output file path')
    args = parser.parse_args()
    
    # Create temp file if no output specified
    output = args.output
    if not output:
        fd, output = tempfile.mkstemp(suffix='.mp3')
        os.close(fd)
    
    success = asyncio.run(synthesize(args.text, args.voice, output))
    
    if success:
        # Read and output binary data
        with open(output, 'rb') as f:
            sys.stdout.buffer.write(f.read())
        
        if not args.output:
            os.unlink(output)
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == '__main__':
    main()
