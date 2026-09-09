# TTS 语音输出 + Live2D 口型联动功能

## 功能概述

本功能实现了文本转语音（TTS）输出，并与 Live2D 模型的口型进行实时联动，提供更自然的交互体验。

## 实现的功能

### 后端部分

1. **新增 `/api/tts/stream` 路由**
   - 直接返回音频流（MP3 格式）
   - 在响应头中返回词边界信息（`X-Word-Boundaries`）
   - 支持文本长度限制（500 字符）
   - 完善的错误处理

2. **词边界格式标准化**
   - 统一了不同 TTS 提供者的词边界格式
   - 支持从 Edge TTS 获取词边界信息
   - 格式：`{ offset_ms: number, duration_ms: number, text: string }`

3. **TTS 服务优化**
   - 使用 `adapters/tts/` 中的 `TtsService` 类
   - 支持 LRU 缓存（最多 50 条，30 分钟过期）
   - 自动清理临时文件

### 前端部分

1. **LipSyncController 控制器**
   - 实时分析音频频谱
   - 支持词边界增强口型精度
   - 平滑处理口型变化
   - 自动处理播放结束和错误

2. **useVoiceOutput Hook**
   - 集成 TTS 缓存管理
   - 支持自定义声线选择
   - 完善的错误处理
   - 自动清理资源

3. **声线选择系统**
   - 根据角色属性（性别、年龄）自动选择声线
   - 根据情绪调整声线
   - 支持手动指定声线
   - 内置多种中文声线（晓晓、云希等）

4. **错误处理系统**
   - 统一的错误处理工具
   - 区分不同错误类型（网络错误、超时、服务不可用等）
   - 提供用户友好的错误提示

5. **TTS 缓存管理**
   - 前端 LRU 缓存（最多 50 条）
   - 30 分钟自动过期
   - 自动清理过期条目
   - 组件卸载时自动清理

## 使用方法

### 1. 在聊天页面中使用

```tsx
import { useVoiceOutput } from '../hooks/useVoiceOutput';

function ChatPage() {
  const { playingMessageId, synthesizingId, play } = useVoiceOutput();

  // 播放语音
  const handlePlay = (text: string, messageId: string, voiceId?: string) => {
    play(text, messageId, voiceId);
  };

  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>
          <p>{message.content}</p>
          {message.role === 'assistant' && (
            <button
              onClick={() => handlePlay(message.content, message.id, message.voiceId)}
            >
              {playingMessageId === message.id ? '🔊' : '🔇'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 2. 自定义声线选择

```tsx
import { getVoiceForPersona, adjustVoiceByEmotion } from '../services/tts/voiceSelector';

// 根据角色选择声线
const persona = {
  id: 'hibiki',
  name: 'Hibiki',
  gender: 'female',
  age: 'young'
};
const voiceId = getVoiceForPersona(persona);

// 根据情绪调整声线
const adjustedVoiceId = adjustVoiceByEmotion(voiceId, 'happy');
```

### 3. 错误处理

```tsx
import { handleTtsError, showTtsErrorToast } from '../services/tts/errorHandler';

try {
  await play(text, messageId, voiceId);
} catch (err) {
  const error = handleTtsError(err);
  console.error(error.message);
  showTtsErrorToast(err, showToast);
}
```

## API 接口

### POST /api/tts/stream

合成语音并直接返回音频流。

**请求体：**
```json
{
  "text": "要合成的文本",
  "voiceId": "zh-CN-XiaoxiaoNeural"
}
```

**响应头：**
- `Content-Type`: audio/mpeg
- `X-Word-Boundaries`: JSON 字符串，包含词边界信息
- `Access-Control-Expose-Headers`: X-Word-Boundaries

**响应体：**
- 音频流（MP3 格式）

**词边界格式：**
```json
[
  {
    "offset_ms": 0,
    "duration_ms": 150,
    "text": "你好"
  }
]
```

## 可用的声线

### 女声
- `zh-CN-XiaoxiaoNeural` - 晓晓（年轻女性，默认）
- `zh-CN-XiaoyiNeural` - 晓伊（儿童）
- `zh-CN-XiaohanNeural` - 晓涵（年轻女性）
- `zh-CN-XiaomengNeural` - 晓梦（年轻女性）
- `zh-CN-XiaoxuanNeural` - 晓萱（年轻女性）
- `zh-CN-XiaoruiNeural` - 晓睿（年轻女性）
- `zh-CN-XiaoyouNeural` - 晓悠（年轻女性）
- `zh-CN-XiaoshuangNeural` - 晓双（年轻女性）

### 男声
- `zh-CN-YunxiNeural` - 云希（年轻男性）
- `zh-CN-YunyangNeural` - 云扬（成年男性）
- `zh-CN-YunjianNeural` - 云健（成年男性）
- `zh-CN-YunxiaNeural` - 云夏（年轻男性）
- `zh-CN-YunzeNeural` - 云泽（年轻男性）

### 中性
- `zh-CN-XiaochenNeural` - 晓辰（中性）
- `zh-CN-XiaoyanNeural` - 晓颜（中性）

## 技术细节

### 口型联动原理

1. **音频分析**：使用 Web Audio API 的 `AnalyserNode` 分析音频频谱
2. **人声频段提取**：提取 80-400Hz 频段（人声主要频段）
3. **平滑处理**：使用指数平滑算法处理口型变化
4. **词边界增强**：根据词边界信息增强口型精度

### 缓存策略

- **后端缓存**：LRU 缓存，最多 50 条，30 分钟过期
- **前端缓存**：LRU 缓存，最多 50 条，30 分钟过期
- **缓存键**：基于文本内容和声线 ID 生成

### 错误处理

- **网络错误**：提示用户检查网络连接
- **超时错误**：提示文本可能过长
- **服务不可用**：提示服务暂时不可用
- **其他错误**：提示用户稍后再试

## 注意事项

1. **文本长度限制**：单次合成最多 500 字符
2. **并发限制**：同一时刻只能合成一条语音
3. **浏览器兼容性**：需要支持 Web Audio API
4. **音频格式**：使用 MP3 格式，兼容性最好
5. **词边界**：Edge TTS 提供词边界，Python TTS 不提供

## 未来改进方向

1. 支持更多 TTS 提供者（如 Coqui TTS）
2. 支持自定义语速和音调
3. 支持语音克隆功能
4. 优化缓存策略
5. 添加语音播放进度条
6. 支持语音暂停/继续
7. 支持批量语音合成

## 相关文件

### 后端
- `apps/server/src/index.ts` - TTS 路由
- `apps/server/src/adapters/tts/index.ts` - TTS 服务
- `apps/server/src/adapters/tts/edge-tts-provider.ts` - Edge TTS 提供者
- `apps/server/src/adapters/tts/utils.ts` - 工具函数
- `apps/server/src/adapters/tts/types.ts` - 类型定义

### 前端
- `apps/web/src/hooks/useVoiceOutput.ts` - 语音输出 Hook
- `apps/web/src/services/live2d/LipSyncController.ts` - 口型同步控制器
- `apps/web/src/services/tts/TtsCache.ts` - TTS 缓存管理
- `apps/web/src/services/tts/errorHandler.ts` - 错误处理
- `apps/web/src/services/tts/voiceSelector.ts` - 声线选择
- `apps/web/src/pages/ChatPage.tsx` - 聊天页面示例
