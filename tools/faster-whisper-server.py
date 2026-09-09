# -*- coding: utf-8 -*-
"""
Faster-Whisper 本地语音识别服务
启动后监听 http://localhost:10095

使用方法:
1. 安装依赖: pip install faster-whisper
2. 启动服务: python faster-whisper-server.py
3. 服务会自动下载默认模型(base)
"""

import os

os.environ['CURL_CA_BUNDLE'] = ''
os.environ['HF_HUB_DISABLE_SSL_VERIFICATION'] = '1'
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

import tempfile
from pathlib import Path
from typing import Optional
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

try:
    import torch
    CUDA_AVAILABLE = torch.cuda.is_available()
except BaseException:
    torch = None
    CUDA_AVAILABLE = False

# 延迟导入，避免启动时卡住
model = None
model_loaded = False

app = FastAPI(title="Faster-Whisper STT Server")


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    device: str
    cuda_available: bool


class TranscribeResponse(BaseModel):
    text: str
    segments: list
    duration: float
    language: str


def load_model():
    """延迟加载模型"""
    global model, model_loaded

    if model_loaded:
        return model

    print("[Faster-Whisper] 首次调用，正在加载模型...")
    print("[Faster-Whisper] 这可能需要几分钟（下载模型约 140MB）...")

    try:
        os.environ['CURL_CA_BUNDLE'] = ''
        os.environ['HF_HUB_DISABLE_SSL_VERIFICATION'] = '1'
        os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

        from faster_whisper import WhisperModel

        # 检测设备
        device = "cuda" if CUDA_AVAILABLE else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"

        print(f"[Faster-Whisper] 使用设备: {device}, 计算类型: {compute_type}")

        # 下载并加载模型(base 模型约 140MB)
        model = WhisperModel(
            "base",
            device=device,
            compute_type=compute_type,
            download_root=os.path.join(tempfile.gettempdir(), "faster-whisper-models")
        )

        model_loaded = True
        print("[Faster-Whisper] [OK] Model loaded!")

        return model
    except Exception as e:
        print(f"[Faster-Whisper] [FAIL] Model load failed: {e}")
        raise


def convert_to_wav(input_path: str, output_path: str):
    """使用系统 ffmpeg 转换音频为 WAV 格式（16kHz 单声道）"""
    import subprocess
    import platform

    # 检查 ffmpeg
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("[Faster-Whisper] 警告: ffmpeg 未安装，尝试直接处理原始音频")
        return False

    try:
        # 转换为 16kHz 单声道 WAV
        subprocess.run([
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "16000", "-ac", "1",
            "-c:a", "pcm_s16le", output_path
        ], capture_output=True, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"[Faster-Whisper] 音频转换失败: {e}")
        return False


@app.get("/api/health")
async def health():
    """健康检查"""
    return JSONResponse({
        "status": "ok",
        "model_loaded": model_loaded,
        "device": "cuda" if CUDA_AVAILABLE else "cpu",
        "cuda_available": CUDA_AVAILABLE,
        "model": "base"
    })


@app.post("/api/asr", response_model=TranscribeResponse)
async def transcribe(file: UploadFile = File(...)):
    """语音识别接口"""

    # 检查文件
    if not file.filename:
        raise HTTPException(status_code=400, detail="未提供文件名")

    # 保存上传的音频
    suffix = Path(file.filename).suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_input:
        content = await file.read()
        tmp_input.write(content)
        tmp_input_path = tmp_input.name

    try:
        # 转换为 WAV (16kHz)
        wav_path = tmp_input_path + ".wav"
        converted = convert_to_wav(tmp_input_path, wav_path)

        # 使用转换后的文件或原始文件
        audio_path = wav_path if converted else tmp_input_path

        # 加载模型（延迟）
        whisper_model = load_model()

        print(f"[Faster-Whisper] 开始识别: {file.filename}")

        # 执行识别
        segments, info = whisper_model.transcribe(
            audio_path,
            language="zh",  # 中文
            beam_size=5,
            vad_filter=True,  # 语音活动检测
            vad_parameters=dict(min_silence_duration_ms=500)
        )

        # 收集结果
        text_parts = []
        segment_list = []

        for segment in segments:
            text_parts.append(segment.text)
            segment_list.append({
                "text": segment.text,
                "start": round(segment.start, 2),
                "end": round(segment.end, 2)
            })

        full_text = "".join(text_parts).strip()
        duration = info.duration if info.duration else 0

        print(f"[Faster-Whisper] [OK] Recognition done: {len(full_text)} chars, {duration:.1f}s")

        return TranscribeResponse(
            text=full_text,
            segments=segment_list,
            duration=duration,
            language=info.language or "zh"
        )

    except Exception as e:
        print(f"[Faster-Whisper] [FAIL] Recognition failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # 清理临时文件
        try:
            os.unlink(tmp_input_path)
            if converted:
                os.unlink(wav_path)
        except:
            pass


if __name__ == "__main__":
    print("=" * 60)
    print("Faster-Whisper STT Server")
    print("=" * 60)
    print("API 端点: http://localhost:10095/api/asr")
    print("健康检查: http://localhost:10095/api/health")
    print("=" * 60)
    print("提示: 启动时预加载模型 (~140MB)")
    print("=" * 60)

    # 启动时预加载模型
    try:
        print("[Faster-Whisper] 正在预加载模型...")
        load_model()
        print("[Faster-Whisper] [OK] Model preloaded!")
    except Exception as e:
        print(f"[Faster-Whisper] [WARN] Model preload failed: {e}")
        print("[Faster-Whisper] 将在首次请求时尝试加载")

    uvicorn.run(app, host="0.0.0.0", port=10095, log_level="info")