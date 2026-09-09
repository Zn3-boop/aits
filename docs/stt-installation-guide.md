# 语音识别模块安装指南

## 问题说明
在安装 `faster-whisper` 时可能会遇到网络超时问题，这是由于网络不稳定或官方PyPI源访问较慢导致的。

## 解决方案

### 方案一：使用国内镜像源（推荐）

```bash
cd apps/server
python -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install faster-whisper --default-timeout=300 -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 方案二：使用其他镜像源

如果清华源不可用，可以尝试其他源：

```bash
# 百度源
pip install faster-whisper --default-timeout=300 -i https://mirror.baidu.com/pypi/simple

# 阿里源
pip install faster-whisper --default-timeout=300 -i https://mirrors.aliyun.com/pypi/simple/

# 中科大源
pip install faster-whisper --default-timeout=300 -i https://pypi.mirrors.ustc.edu.cn/simple/
```

### 方案三：使用预配置脚本

我们提供了一个自动化的安装脚本：

```bash
cd apps/server/scripts
python stt-setup.py
```

该脚本会：
- 自动尝试多个镜像源
- 设置合适的超时时间
- 验证安装是否成功
- 预下载基础模型

## 环境变量配置

在 `.env` 文件中可以配置以下选项：

```env
# Python解释器路径（默认为 'python'）
PYTHON_PATH=python

# STT模型大小（可选：tiny, base, small, medium, large-v1, large-v2）
STT_MODEL_SIZE=base

# 服务器端口
PORT=8787
```

## 模型大小选择

不同模型大小对性能和准确性的权衡：

| 模型 | 大小 | 相对速度 | 内存使用 | 准确性 |
|------|------|----------|----------|--------|
| tiny | ~75MB | 32x | 低 | 较低 |
| base | ~150MB | 16x | 低 | 一般 |
| small | ~500MB | 6x | 中 | 高 |
| medium | ~1.5GB | 2x | 高 | 很高 |

对于大多数用途，推荐使用 `base` 模型，它在速度和准确性之间取得了良好平衡。

## 故障排除

### 常见问题

1. **权限错误**
   ```bash
   # Windows
   pip install faster-whisper --user
   
   # 或者使用虚拟环境
   python -m venv venv
   venv\Scripts\activate
   pip install faster-whisper
   ```

2. **依赖冲突**
   ```bash
   pip install faster-whisper --force-reinstall --no-deps
   pip install faster-whisper
   ```

3. **编译错误（Windows）**
   安装 Microsoft C++ Build Tools：
   ```bash
   # 下载并安装 Visual Studio Build Tools
   # 或者使用 conda
   conda install -c conda-forge faster-whisper
   ```

### 验证安装

安装完成后，可以通过以下命令验证：

```bash
python -c "import faster_whisper; print(faster_whisper.__version__)"
```

## 性能优化建议

1. **预加载模型**：第一次使用会下载模型，后续使用会快很多
2. **选择合适模型**：根据需求选择模型大小
3. **硬件加速**：如果有GPU支持，可以设置 `device="cuda"`

## API 使用说明

语音识别API端点：
- `POST /api/stt/transcribe` - 上传音频文件进行转录
- `GET /api/stt/health` - 检查STT服务状态

请求示例：
```javascript
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');

const response = await fetch('/api/stt/transcribe', {
  method: 'POST',
  body: formData
});
```

响应格式：
```json
{
  "text": "识别的文字内容",
  "language": "zh",
  "segments": [...],
  "duration": 12.34
}
```