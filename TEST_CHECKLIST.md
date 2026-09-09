# 功能测试清单

## 测试1: 聊天语音输入与识别
- [ ] 语音输入按钮可用
- [ ] STT (语音转文字) 识别正常
- [ ] 识别结果正确显示
- [ ] 支持持续语音输入

**文件**: `apps/web/src/hooks/useVoiceInput.ts`, `apps/web/src/hooks/useEdgeTTS.ts`

---

## 测试2: Live2D 动作/表情对应
- [ ] 说话时口型同步 (唇语)
- [ ] AI情绪变化触发表情变化
- [ ] 动作组切换正常 (Idle, Tap, Flick)
- [ ] 模型缩放居中正确

**文件**: `apps/web/src/features/live2d-driver/driver.ts`, `packages/live2d-mapper/src/index.ts`

---

## 测试3: 语音输出 (TTS)
- [ ] Edge-TTS 语音输出正常
- [ ] 本地 TTS (eSpeak) 降级可用
- [ ] 语音速度/音调设置生效
- [ ] 音频播放无延迟

**文件**: `apps/server/src/adapters/tts/edge-tts-provider.ts`, `apps/web/src/hooks/useVoiceOutput.ts`

---

## 测试4: 摄像头用户动作检测
- [ ] 摄像头权限获取正常
- [ ] face-api.js 情绪检测工作
- [ ] 检测到用户情绪后 Live2D 响应
- [ ] 眼部追踪 (可选)

**文件**: `apps/web/src/features/face-tracking/index.ts`, `apps/web/src/hooks/useFaceEmotion.ts`

---

## 测试5: 记忆模块与人设回复
- [ ] 记忆提取自动执行
- [ ] 记忆存储到数据库
- [ ] LLM回复包含记忆上下文
- [ ] 人设 (Persona) 设置正确应用

**文件**: `apps/server/src/services/memory-extractor.ts`, `apps/server/src/routes/memories.ts`

---

## 测试6: 语音克隆上传功能
- [ ] 语音克隆上传接口存在
- [ ] 支持上传克隆音频文件
- [ ] 克隆语音可被使用

**文件**: `apps/server/src/routes/tts.ts`, `apps/web/src/pages/VoicePage.tsx`

---

## 测试7: 整体对话流程
- [ ] 发送消息后 LLM 生成回复
- [ ] 回复触发 TTS 语音输出
- [ ] Live2D 显示对应表情动作
- [ ] 对话历史正确保存

---

## 已实现的功能模块

### 前端 (apps/web)
| 模块 | 状态 | 说明 |
|------|------|------|
| ChatPage | ✅ | 集成情绪检测、TTS、Live2D |
| Live2DPage | ✅ | Live2D 模型展示+驱动 |
| VoicePage | ✅ | 语音克隆录制 |
| MemoryPage | ✅ | 记忆管理界面 |
| useFaceEmotion | ✅ | face-api.js 情绪检测 |
| useNativeTTS | ✅ | 浏览器原生TTS |
| live2d-mapper | ✅ | 情绪→Live2D参数映射 |

### 后端 (apps/server)
| 模块 | 状态 | 说明 |
|------|------|------|
| memory-extractor | ✅ | 自动提取对话记忆 |
| memories API | ✅ | 记忆 CRUD |
| tts API | ✅ | Edge-TTS 合成 |
| stt API | ✅ | 语音识别 |
| persona API | ✅ | 人设管理 |
| chat API | ✅ | 对话管理 |

---

## 已修复的问题
1. ✅ TTS POST 路由修复
2. ✅ 记忆管理 API 添加
3. ✅ live2d-mapper 完整实现
4. ✅ TTS 全局开关 isVoiceEnabled 检查
5. ✅ 构建验证通过
