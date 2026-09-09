"""
Faster-Whisper 启动脚本
自动配置 HuggingFace 镜像源并启动语音识别服务
"""

import os
import sys
import subprocess

def main():
    print("=" * 60)
    print("  Faster-Whisper 语音识别服务启动器")
    print("=" * 60)
    print()
    
    # 1. 设置 HuggingFace 镜像源
    print("[1/4] 配置 HuggingFace 镜像源...")
    os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'
    print("  ✅ 已设置镜像源: https://hf-mirror.com")
    print()
    
    # 2. 验证 faster-whisper
    print("[2/4] 验证 faster-whisper 安装...")
    try:
        import faster_whisper
        print(f"  ✅ faster-whisper {faster_whisper.__version__} 已安装")
    except ImportError as e:
        print(f"  ❌ faster-whisper 未安装: {e}")
        print("  提示: 运行 install_faster_whisper.py 安装")
        return False
    print()
    
    # 3. 检查模型
    print("[3/4] 检查语音模型...")
    import tempfile
    model_dir = os.path.join(tempfile.gettempdir(), "faster-whisper-models")
    
    if os.path.exists(model_dir):
        # 统计已有模型
        models = [d for d in os.listdir(model_dir) 
                  if d.startswith("models--")]
        if models:
            print(f"  ✅ 找到 {len(models)} 个已下载的模型:")
            for model in models:
                model_name = model.replace("models--", "").replace("--", "/")
                print(f"     - {model_name}")
        else:
            print("  ⚠️  模型目录存在但没有模型文件")
    else:
        print("  ⚠️  未找到模型目录，将自动下载")
    print()
    
    # 4. 启动服务
    print("[4/4] 启动 Faster-Whisper 服务...")
    print()
    print("  🔧 提示: 如果是首次使用，将自动下载模型（约 140MB）")
    print("  📝 服务将在 http://localhost:10095 运行")
    print()
    
    # 启动服务脚本
    server_script = os.path.join(
        os.path.dirname(__file__),
        "tools",
        "faster-whisper-server.py"
    )
    
    if not os.path.exists(server_script):
        print(f"  ❌ 未找到服务脚本: {server_script}")
        return False
    
    print("=" * 60)
    print("  🚀 正在启动服务...")
    print("=" * 60)
    print()
    
    # 设置环境变量并启动
    env = os.environ.copy()
    env['HF_ENDPOINT'] = 'https://hf-mirror.com'
    
    try:
        subprocess.run(
            [sys.executable, server_script],
            env=env,
            check=True
        )
    except KeyboardInterrupt:
        print("\n\n  ✅ 服务已停止")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n  ❌ 服务启动失败: {e}")
        return False
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 启动器出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
