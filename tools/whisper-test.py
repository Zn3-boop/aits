"""测试 Whisper 识别速度"""
import time
import numpy as np
from faster_whisper import WhisperModel

print("加载 Whisper tiny 模型...")
start = time.time()
model = WhisperModel("tiny", device="cpu", compute_type="int8")
load_time = time.time() - start
print(f"模型加载耗时: {load_time:.2f}秒")

# 生成测试音频 (3秒中文音频)
print("\n生成测试音频...")
sample_rate = 16000
duration = 3  # 3秒
samples = int(sample_rate * duration)
audio = np.random.randn(samples).astype(np.float32) * 0.1  # 随机噪音作为测试

print(f"测试音频: {duration}秒, {sample_rate}Hz, {samples}采样点")

# 测试识别速度
print("\n开始识别测试...")
for i in range(3):
    start = time.time()
    segments, _ = model.transcribe(audio, language="zh", vad_filter=True)
    text = " ".join([s.text for s in segments])
    elapsed = time.time() - start
    print(f"第{i+1}次识别耗时: {elapsed:.3f}秒, 结果: '{text}'")

print("\n总结:")
print("- tiny 模型 < 0.5秒: 实时体验良好")
print("- tiny 模型 0.5-1秒: 可接受，稍有延迟")
print("- tiny 模型 > 1秒: 体验较差，考虑降级方案")
