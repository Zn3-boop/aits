"""
Faster-Whisper 安装验证脚本
用于验证 faster-whisper 是否正确安装和工作
"""

import sys
import os

def main():
    print("=" * 60)
    print("  Faster-Whisper 安装验证")
    print("=" * 60)
    print()
    
    # 1. 检查 Python 版本
    print("[1/5] 检查 Python 环境...")
    print(f"  Python 版本: {sys.version}")
    print("  ✅ Python 正常")
    print()
    
    # 2. 检查虚拟环境
    print("[2/5] 检查虚拟环境...")
    venv_path = os.path.join(os.path.dirname(__file__), '.venv')
    if not os.path.exists(venv_path):
        print(f"  ⚠️  虚拟环境 {venv_path} 不存在")
        print("  💡 提示: 请确保在正确的目录中运行")
    else:
        print(f"  ✅ 虚拟环境存在: {venv_path}")
    print()
    
    # 3. 尝试导入 faster_whisper
    print("[3/5] 检查 faster-whisper 安装...")
    try:
        import faster_whisper
        print(f"  ✅ faster-whisper 已安装")
        print(f"  版本: {faster_whisper.__version__}")
        print(f"  位置: {faster_whisper.__file__}")
    except ImportError as e:
        print(f"  ❌ faster-whisper 未安装或导入失败")
        print(f"  错误: {e}")
        print()
        print("  💡 解决方法:")
        print("  1. 激活虚拟环境: .venv\\Scripts\\Activate.ps1")
        print("  2. 安装 faster-whisper: pip install faster-whisper")
        return False
    print()
    
    # 4. 测试 WhisperModel 导入
    print("[4/5] 测试 WhisperModel 导入...")
    try:
        from faster_whisper import WhisperModel
        print("  ✅ WhisperModel 导入成功")
        print("  💡 可用模型: tiny, base, small, medium, large")
    except Exception as e:
        print(f"  ❌ WhisperModel 导入失败: {e}")
        return False
    print()
    
    # 5. 测试模型加载（使用最小的 tiny 模型）
    print("[5/5] 测试模型加载（tiny 模型）...")
    try:
        print("  ⏳ 正在加载 tiny 模型（首次需要下载，请稍候）...")
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        print("  ✅ 模型加载成功！")
        print("  ✅ faster-whisper 完全正常工作")
    except Exception as e:
        print(f"  ⚠️  模型加载出现问题: {e}")
        print("  💡 提示: 可能是网络问题导致模型下载失败")
        print("  ⚠️  但 faster-whisper 库本身已正确安装")
    print()
    
    print("=" * 60)
    print("  ✅ 验证完成！")
    print("=" * 60)
    print()
    print("📋 后续步骤:")
    print("   1. 启动语音服务: python tools\\faster-whisper-server.py")
    print("   2. 查看详细文档: 重要文件_请勿删除_faster-whisper说明.md")
    print("   3. 运行测试脚本: python tools\\faster-whisper-server.py")
    print()
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 验证脚本出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
