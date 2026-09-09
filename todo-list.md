# 待完成任务清单

## 紧急修复 - 构建错误

### 1. 创建缺失的 espeak-tts-provider.js 文件
- [ ] 创建 `apps/server/src/adapters/tts/espeak-tts-provider.ts`
- [ ] 实现 EspeakTtsProvider 类

### 2. 修复 Zod 类型问题
- [ ] 修复 `apps/server/src/middleware/validation.ts` 中的 `error.errors` 问题
- [ ] 修复 `apps/server/src/services/error-handler.ts` 中的类型问题
- [ ] 修复 `apps/server/src/adapters/tts/index.ts` 中的 spread 类型问题

### 3. 验证构建通过
- [ ] 运行 `pnpm build` 确保无错误

## 测试清单 (来自 TEST_CHECKLIST.md)

### 测试1: 聊天语音输入与识别
- [ ] 语音输入按钮可用
- [ ] STT (语音转文字) 识别正常
- [ ] 识别结果正确显示
- [ ] 支持持续语音输入

### 测试2: Live2D 动作/表情对应
- [ ] 说话时口型同步 (唇语)
- [ ] AI情绪变化触发表情变化
- [ ] 动作组切换正常 (Idle, Tap, Flick)
- [ ] 模型缩放居中正确

### 测试3: 语音输出 (TTS)
- [ ] Edge-TTS 语音输出正常
- [ ] 本地 TTS (eSpeak) 降级可用
- [ ] 语音速度/音调设置生效
- [ ] 音频播放无延迟

### 测试4: 摄像头用户动作检测
- [ ] 摄像头权限获取正常
- [ ] face-api.js 情绪检测工作
- [ ] 检测到用户情绪后 Live2D 响应
- [ ] 眼部追踪 (可选)

### 测试5: 记忆模块与人设回复
- [ ] 记忆提取自动执行
- [ ] 记忆存储到数据库
- [ ] LLM回复包含记忆上下文
- [ ] 人设 (Persona) 设置正确应用

### 测试6: 语音克隆上传功能
- [ ] 语音克隆上传接口存在
- [ ] 支持上传克隆音频文件
- [ ] 克隆语音可被使用

### 测试7: 整体对话流程
- [ ] 发送消息后 LLM 生成回复
- [ ] 回复触发 TTS 语音输出
- [ ] Live2D 显示对应表情动作
- [ ] 对话历史正确保存
