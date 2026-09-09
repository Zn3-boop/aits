"""
测试 Faster-Whisper 语音识别功能
"""

import requests
import wave
import struct
import tempfile
import os

def create_test_audio():
    """创建一个简单的测试音频文件（包含正弦波）"""
    # 采样参数
    sample_rate = 16000
    duration = 3  # 3秒
    frequency = 440  # A4音符
    
    # 创建临时文件
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
    
    with wave.open(temp_file.name, 'w') as wav_file:
        wav_file.setnchannels(1)  # 单声道
        wav_file.setsampwidth(2)  # 2字节（16位）
        wav_file.setframerate(sample_rate)
        
        # 生成简单的音频数据
        import math
        for i in range(sample_rate * duration):
            value = int(32767.0 * 0.3 * math.sin(2.0 * math.pi * frequency * i / sample_rate))
            data = struct.pack('<h', value)
            wav_file.writeframesraw(data)
    
    print(f"✓ 测试音频已创建: {temp_file.name}")
    return temp_file.name


def test_stt():
    """测试语音识别"""
    print("\n" + "="*60)
    print("Faster-Whisper 语音识别测试")
    print("="*60 + "\n")
    
    # 1. 健康检查
    print("[1/3] 检查服务状态...")
    try:
        response = requests.get('http://localhost:10095/api/health', timeout=5)
        health = response.json()
        print(f"    状态: {health}")
        if health['status'] != 'ok':
            print("    ❌ 服务状态异常")
            return False
        print("    ✓ 服务正常")
    except Exception as e:
        print(f"    ❌ 无法连接服务: {e}")
        return False
    
    # 2. 创建测试音频
    print("\n[2/3] 创建测试音频...")
    test_file = create_test_audio()
    
    # 3. 语音识别
    print("\n[3/3] 进行语音识别...")
    print("    提示: 首次调用会自动下载模型（约140MB），请稍候...")
    
    try:
        with open(test_file, 'rb') as f:
            files = {'file': ('test.wav', f, 'audio/wav')}
            response = requests.post('http://localhost:10095/api/asr', files=files, timeout=120)
        
        result = response.json()
        
        print("\n" + "="*60)
        print("🎉 识别结果：")
        print("="*60)
        print(f"识别的文字: {result.get('text', '无')}")
        print(f"语言: {result.get('language', 'unknown')}")
        print(f"时长: {result.get('duration', 0):.2f} 秒")
        print(f"片段数: {len(result.get('segments', []))}")
        
        if result.get('segments'):
            print("\n详细片段:")
            for i, seg in enumerate(result['segments'], 1):
                print(f"  {i}. [{seg['start']:.2f}s - {seg['end']:.2f}s]: {seg['text']}")
        
        print("\n" + "="*60)
        print("✅ 测试成功！Faster-Whisper 服务工作正常！")
        print("="*60)
        
    except Exception as e:
        print(f"\n❌ 识别失败: {e}")
        if "model" in str(e).lower() or "download" in str(e).lower():
            print("\n提示: 模型可能正在下载中，请稍后重试")
    
    finally:
        # 清理
        try:
            os.unlink(test_file)
        except:
            pass


if __name__ == "__main__":
    test_stt()
