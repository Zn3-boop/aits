"""
服务端情绪推理服务
使用 MediaPipe FaceLandmarker 进行实时情绪检测
WebSocket 接收 JPEG 帧，返回情绪和 blendshapes
"""
import cv2
import numpy as np
import json
import asyncio
import logging
from typing import Optional, Dict, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 尝试导入 MediaPipe Task API
try:
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    from mediapipe.tasks.python.core import BaseOptions
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False
    logger.warning("MediaPipe not available, running in mock mode")

# ============================================================
# 情绪分类逻辑
# ============================================================

def classify_emotion_from_blendshapes(blendshapes: Dict[str, float]) -> Dict[str, Any]:
    """
    从 blendshapes 权重推断情绪
    MediaPipe FaceLandmarker 输出 52 个 blendshapes
    """
    # 提取关键 blendshapes
    brow_inner_up = blendshapes.get('browInnerUp', 0)
    brow_down_l = blendshapes.get('browDown_L', 0)
    brow_down_r = blendshapes.get('browDown_R', 0)
    eye_wide_l = blendshapes.get('eyeWide_L', 0)
    eye_wide_r = blendshapes.get('eyeWide_R', 0)
    jaw_open = blendshapes.get('jawOpen', 0)
    mouth_smile_l = blendshapes.get('mouthSmile_L', 0)
    mouth_smile_r = blendshapes.get('mouthSmile_R', 0)
    mouth_frown_l = blendshapes.get('mouthFrown_L', 0)
    mouth_frown_r = blendshapes.get('mouthFrown_R', 0)
    cheek_puff = blendshapes.get('cheekPuff', 0)
    eye_squint_l = blendshapes.get('eyeSquint_L', 0)
    eye_squint_r = blendshapes.get('eyeSquint_R', 0)
    
    # 计算综合指标
    smile_avg = (mouth_smile_l + mouth_smile_r) / 2
    frown_avg = (mouth_frown_l + mouth_frown_r) / 2
    brow_score = (brow_inner_up - brow_down_l - brow_down_r) / 3
    eye_score = (eye_wide_l + eye_wide_r) / 2 - (eye_squint_l + eye_squint_r) / 2
    
    # 情绪判定逻辑
    emotions = []
    scores = {}
    
    # 开心：嘴角上扬 + 脸颊鼓起
    happy_score = smile_avg * 2 + cheek_puff * 0.5 + eye_score * 0.3
    scores['happy'] = min(1.0, happy_score)
    if happy_score > 0.3:
        emotions.append('happy')
    
    # 悲伤：眉头下压 + 嘴角下垂
    sad_score = (brow_down_l + brow_down_r) / 2 * 2 + frown_avg * 2 - brow_inner_up
    scores['sad'] = min(1.0, max(0, sad_score))
    if sad_score > 0.4:
        emotions.append('sad')
    
    # 惊讶：眉毛上抬 + 眼睛睁大 + 嘴巴张开
    surprised_score = brow_inner_up * 2 + eye_wide_l + eye_wide_r + jaw_open * 1.5
    scores['surprised'] = min(1.0, surprised_score / 4)
    if surprised_score > 0.6:
        emotions.append('surprised')
    
    # 生气：眉毛下压 + 眼睛眯起
    angry_score = (brow_down_l + brow_down_r) / 2 * 2 + (eye_squint_l + eye_squint_r) / 2
    scores['angry'] = min(1.0, angry_score / 2)
    if angry_score > 0.5:
        emotions.append('angry')
    
    # 害羞：眉毛上扬 + 脸颊相关
    shy_score = brow_inner_up * 1.5 + cheek_puff * 0.5
    scores['shy'] = min(1.0, shy_score)
    if shy_score > 0.4:
        emotions.append('shy')
    
    # 中性
    neutral_score = 1.0 - max(scores.values()) if scores.values() else 1.0
    scores['neutral'] = neutral_score
    
    # 选择最高分的情绪
    if emotions:
        primary_emotion = max(emotions, key=lambda x: scores.get(x, 0))
    else:
        primary_emotion = 'neutral'
    
    return {
        'emotion': primary_emotion,
        'confidence': scores.get(primary_emotion, 0.5),
        'all_scores': {k: round(v, 3) for k, v in scores.items()},
        'blendshapes': {k: round(v, 3) for k, v in blendshapes.items() if v > 0.1}
    }


def extract_blendshapes(face_landmarker_result) -> Dict[str, float]:
    """从 MediaPipe 结果中提取 blendshapes"""
    blendshapes = {}
    
    if not face_landmarker_result.face_blendshapes:
        return blendshapes
    
    for blend in face_landmarker_result.face_blendshapes[0]:
        category_name = blend.category_name.lower()
        score = blend.score
        blendshapes[category_name] = score
    
    return blendshapes


# ============================================================
# FastAPI 应用
# ============================================================

app = FastAPI(title="Emotion Inference Service", version="1.0.0")

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局变量
face_landmarker = None
model_loaded = False


@app.on_event("startup")
async def load_model():
    """启动时加载模型"""
    global face_landmarker, model_loaded
    
    if not MEDIAPIPE_AVAILABLE:
        logger.warning("Running in MOCK mode - no MediaPipe")
        return
    
    try:
        # 模型路径 - 相对于当前文件
        import os
        model_path = os.path.join(os.path.dirname(__file__), 'models', 'face_landmarker.task')
        
        if not os.path.exists(model_path):
            logger.warning(f"Model not found at {model_path}, trying default download")
            # 使用 BaseOptions 让 MediaPipe 自动下载
            base_options = BaseOptions(model_asset_buffer=None)
        else:
            base_options = BaseOptions(model_asset_path=model_path)
        
        options = vision.FaceLandmarkerOptions(
            base_options=base_options,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=False,
            num_faces=1,
            running_mode=vision.RunningMode.IMAGE
        )
        
        face_landmarker = vision.FaceLandmarker.create_from_options(options)
        model_loaded = True
        logger.info("FaceLandmarker model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        face_landmarker = None
        model_loaded = False


@app.on_event("shutdown")
async def cleanup():
    """清理资源"""
    global face_landmarker
    if face_landmarker:
        face_landmarker.close()
        face_landmarker = None
        logger.info("FaceLandmarker closed")


@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "ok",
        "model_loaded": model_loaded,
        "mediapipe_available": MEDIAPIPE_AVAILABLE
    }


@app.websocket("/ws/emotion/{session_id}")
async def emotion_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket 端点：接收 JPEG 帧，返回情绪分析结果
    """
    await websocket.accept()
    logger.info(f"[{session_id}] Emotion WebSocket connected")
    
    frame_count = 0
    try:
        while True:
            # 接收 JPEG 二进制数据
            frame_bytes = await websocket.receive_bytes()
            frame_count += 1
            
            if not frame_bytes:
                continue
            
            # 解码图像
            nparr = np.frombuffer(frame_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                await websocket.send_json({
                    "type": "error",
                    "session_id": session_id,
                    "error": "Failed to decode image"
                })
                continue
            
            # 转换为 RGB (MediaPipe 需要 RGB)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # 创建 MediaPipe Image
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            
            # 推理
            if face_landmarker and model_loaded:
                result = face_landmarker.detect(mp_image)
                
                if result.face_blendshapes and len(result.face_blendshapes) > 0:
                    blendshapes = extract_blendshapes(result)
                    emotion_data = classify_emotion_from_blendshapes(blendshapes)
                    
                    response = {
                        "type": "emotion_update",
                        "session_id": session_id,
                        "frame_count": frame_count,
                        "has_face": True,
                        **emotion_data
                    }
                else:
                    response = {
                        "type": "emotion_update",
                        "session_id": session_id,
                        "frame_count": frame_count,
                        "has_face": False,
                        "emotion": "neutral",
                        "confidence": 0
                    }
            else:
                # Mock 模式 - 模拟一些数据
                response = {
                    "type": "emotion_update",
                    "session_id": session_id,
                    "frame_count": frame_count,
                    "has_face": True,
                    "emotion": "happy",
                    "confidence": 0.85,
                    "mock": True
                }
            
            # 发送结果
            await websocket.send_json(response)
            
    except WebSocketDisconnect:
        logger.info(f"[{session_id}] WebSocket disconnected (processed {frame_count} frames)")
    except Exception as e:
        logger.error(f"[{session_id}] Error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "session_id": session_id,
                "error": str(e)
            })
        except:
            pass


# ============================================================
# 启动服务
# ============================================================

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 10096))
    logger.info(f"Starting Emotion Inference Service on port {port}")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
