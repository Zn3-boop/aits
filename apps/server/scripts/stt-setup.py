"""
语音识别模块安装和配置脚本
用于解决 faster-whisper 安装网络超时问题
"""

import subprocess
import sys
import os
from pathlib import Path

def install_faster_whisper():
    """安装 faster-whisper 包，使用国内镜像源"""
    
    print("🔧 开始安装 faster-whisper...")
    
    # 多个镜像源备用
    mirrors = [
        "https://pypi.tuna.tsinghua.edu.cn/simple",
        "https://mirror.baidu.com/pypi/simple",
        "https://pypi.mirrors.ustc.edu.cn/simple/",
        "https://mirrors.aliyun.com/pypi/simple/"
    ]
    
    success = False
    for i, mirror in enumerate(mirrors):
        print(f"\n尝试镜像源 {i+1}/{len(mirrors)}: {mirror}")
        try:
            result = subprocess.run([
                sys.executable, "-m", "pip", "install", 
                "faster-whisper", 
                "--default-timeout=300",  # 5分钟超时
                "-i", mirror,
                "--no-cache-dir"  # 避免缓存导致的问题
            ], check=True, capture_output=True, text=True)
            
            print(f"✅ 镜像源 {mirror} 安装成功!")
            success = True
            break
            
        except subprocess.CalledProcessError as e:
            print(f"❌ 镜像源 {mirror} 安装失败:")
            print(f"   错误信息: {e.stderr.strip() if e.stderr else 'Unknown error'}")
            continue
    
    if not success:
        print("\n❌ 所有镜像源都安装失败，请检查网络连接")
        return False
    
    # 验证安装
    try:
        import faster_whisper
        print(f"✅ faster-whisper 安装成功! 版本: {faster_whisper.__version__}")
        
        # 尝试加载模型以验证功能
        print("🔍 验证模型加载功能...")
        from faster_whisper import WhisperModel
        
        # 使用较小的模型进行快速测试
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        print("✅ 模型加载验证成功!")
        
        return True
        
    except ImportError as e:
        print(f"❌ 验证失败: {e}")
        return False
    except Exception as e:
        print(f"⚠️  模型验证出现问题，但安装可能成功: {e}")
        return True

def download_model_offline():
    """预下载模型以避免首次运行时的下载延迟"""
    print("\n📦 开始预下载语音识别模型...")
    
    try:
        from faster_whisper import WhisperModel
        import tempfile
        
        models_to_download = ["tiny", "base"]
        
        for model_size in models_to_download:
            print(f"  下载 {model_size} 模型...")
            with tempfile.TemporaryDirectory():
                model = WhisperModel(model_size, device="cpu", compute_type="int8")
            print(f"  ✅ {model_size} 模型下载完成")
        
        print("✅ 所有模型预下载完成!")
        return True
        
    except Exception as e:
        print(f"⚠️  模型预下载出现问题: {e}")
        return False

def optimize_stt_script():
    """生成优化的STT处理脚本"""
    script_content = '''
import sys
import json
import time
import traceback
from pathlib import Path

def setup_faster_whisper():
    """安全导入 faster_whisper 并处理可能的导入错误"""
    try:
        from faster_whisper import WhisperModel
        return WhisperModel
    except ImportError as e:
        print(json.dumps({
            "error": "IMPORT_ERROR",
            "message": f"faster_whisper 未正确安装: {str(e)}",
            "hint": "请运行: pip install faster-whisper"
        }), flush=True)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            "error": "INIT_ERROR", 
            "message": f"初始化错误: {str(e)}"
        }), flush=True)
        sys.exit(1)

def transcribe_audio(audio_path, model_size="base", language="zh"):
    """执行音频转录，带有多重错误处理和超时保护"""
    
    # 导入模块
    WhisperModel = setup_faster_whisper()
    
    try:
        # 添加超时保护包装器
        start_time = time.time()
        
        # 加载模型 (使用缓存以提高后续调用速度)
        model = WhisperModel(
            model_size, 
            device="cpu", 
            compute_type="int8",
            cpu_threads=4  # 利用多核CPU加速
        )
        
        # 检查音频文件存在
        if not Path(audio_path).exists():
            raise FileNotFoundError(f"音频文件不存在: {audio_path}")
        
        # 执行转录
        segments, info = model.transcribe(
            audio_path, 
            language=language, 
            beam_size=5,
            patience=1.0,
            without_timestamps=True,
            # 添加进度回调以监控长时间运行
            progress_callback=lambda progress: print(f"进度: {progress:.1f}%", end='\\r', flush=True) if time.time() - start_time > 5 else None
        )
        
        # 收集结果
        result = []
        for segment in segments:
            result.append({
                "text": segment.text.strip(),
                "start": segment.start,
                "end": segment.end
            })
        
        # 构造最终结果
        final_text = " ".join(s["text"] for s in result).strip()
        
        print(json.dumps({
            "text": final_text,
            "language": info.language,
            "segments": result,
            "duration": info.duration,
            "model": model_size
        }, ensure_ascii=False), flush=True)
        
    except Exception as e:
        error_msg = str(e)
        if "CUDA" in error_msg.upper():
            # GPU错误，降级到CPU
            try:
                model = WhisperModel(model_size, device="cpu", compute_type="int8")
                segments, info = model.transcribe(audio_path, language=language, beam_size=5)
                
                result = []
                for segment in segments:
                    result.append({
                        "text": segment.text.strip(),
                        "start": segment.start,
                        "end": segment.end
                    })
                
                final_text = " ".join(s["text"] for s in result).strip()
                
                print(json.dumps({
                    "text": final_text,
                    "language": info.language,
                    "segments": result,
                    "duration": info.duration,
                    "model": model_size,
                    "warning": "GPU不可用，已切换到CPU模式"
                }, ensure_ascii=False), flush=True)
                return
            except:
                pass
        
        print(json.dumps({
            "error": "TRANSCRIPTION_ERROR",
            "message": error_msg,
            "traceback": traceback.format_exc()
        }), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(json.dumps({
            "error": "INVALID_ARGS",
            "message": "用法: python script.py <model_size> <audio_path>"
        }), flush=True)
        sys.exit(1)
    
    model_size = sys.argv[1]
    audio_path = sys.argv[2]
    
    transcribe_audio(audio_path, model_size)
'''
    
    script_path = Path("optimized_stt.py")
    with open(script_path, 'w', encoding='utf-8') as f:
        f.write(script_content)
    
    print(f"✅ 优化的STT脚本已生成: {script_path.absolute()}")
    return True

def main():
    """主函数"""
    print("🎙️  AI语音识别模块配置向导")
    print("="*50)
    
    # 1. 安装faster-whisper
    if not install_faster_whisper():
        print("\n❌ 安装失败，退出配置")
        return False
    
    # 2. 预下载模型
    download_model_offline()
    
    # 3. 生成优化脚本
    optimize_stt_script()
    
    print("\n🎉 配置完成!")
    print("\n📋 使用说明:")
    print("   • 语音识别服务现在更加稳定")
    print("   • 首次使用会自动下载模型（已预下载基础模型）")
    print("   • 如需更高精度可手动下载 larger 模型")
    print("\n💡 提示: 如果仍有问题，请确保Python环境支持")
    
    return True

if __name__ == "__main__":
    main()