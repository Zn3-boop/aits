# 语音输入 + 系统设置功能实现文档

## 概述

本文档描述了第6轮实现的语音输入和系统设置功能，包括前端和后端的完整实现。

## 一、语音输入功能

### 1.1 TypeScript 类型声明

**文件**: `apps/web/src/types/speech-recognition.d.ts`

定义了 Web Speech API 的完整类型声明，包括：
- `SpeechRecognitionEvent` - 语音识别事件
- `SpeechRecognitionErrorEvent` - 语音识别错误事件
- `SpeechRecognitionResultList` - 识别结果列表
- `SpeechRecognitionResult` - 单个识别结果
- `SpeechRecognitionAlternative` - 识别备选
- `SpeechRecognition` - 语音识别接口
- `SpeechRecognitionConstructor` - 语音识别构造函数

### 1.2 useVoiceInput Hook

**文件**: `apps/web/src/hooks/useVoiceInput.ts`

功能特性：
- ✅ 检测浏览器是否支持语音识别（包括安全上下文检查）
- ✅ 支持实时识别结果显示（interimTranscript）
- ✅ 支持最终识别结果回调（onFinalResult）
- ✅ 完善的错误处理（权限拒绝、无语音、网络错误等）
- ✅ 自动处理重复启动问题
- ✅ 中文语音识别（zh-CN）

使用示例：
```tsx
const { isListening, interimTranscript, isSupported, error, startListening, stopListening } = useVoiceInput(
  useCallback((text: string) => {
    setInputValue(prev => prev + text);
  }, [])
);
```

### 1.3 ChatInput 组件集成

**文件**: `apps/web/src/components/ChatInput.tsx`

功能特性：
- ✅ 根据设置显示/隐藏麦克风按钮
- ✅ 麦克风按钮状态指示（录音中/停止）
- ✅ 实时显示识别结果
- ✅ 错误提示显示
- ✅ 不支持时显示禁用状态和提示

**样式文件**: `apps/web/src/components/ChatInput.css`

样式特性：
- ✅ 麦克风按钮动画效果（录音时脉冲动画）
- ✅ 实时识别结果浮动显示
- ✅ 错误提示样式
- ✅ 输入框录音状态样式

## 二、系统设置功能

### 2.1 设置类型定义

**文件**: `apps/web/src/types/settings.ts`

定义的设置项：
```typescript
export interface AppSettings {
  // 语音
  voiceInput: boolean;       // 语音输入开关，默认 true
  voiceOutput: boolean;      // 语音输出开关，默认 true
  defaultVoice: string;      // 全局默认声线，默认 'zh-CN-XiaoxiaoNeural'
  // 动画
  live2dAnimation: boolean;  // Live2D 总开关，默认 true
  breathingAnimation: boolean; // 呼吸动画，默认 true
  autoBlink: boolean;        // 自动眨眼，默认 true
  // 隐私
  conversationMemory: boolean; // 对话记忆开关，默认 true
}
```

可用的声线：
- 晓晓（温柔女声）
- 云希（阳光男声）
- 晓伊（活泼女声）

### 2.2 useSettings Hook

**文件**: `apps/web/src/hooks/useSettings.ts`

功能特性：
- ✅ 自动从 localStorage 加载设置
- ✅ 设置变更自动保存到 localStorage
- ✅ 支持单个设置项更新
- ✅ 支持重置为默认设置
- ✅ 错误处理（解析失败时使用默认设置）

使用示例：
```tsx
const { settings, updateSetting, resetSettings } = useSettings();

// 更新单个设置
updateSetting('voiceInput', false);

// 重置所有设置
resetSettings();
```

### 2.3 SettingsPanel 组件

**文件**: `apps/web/src/components/SettingsPanel.tsx`

功能特性：
- ✅ 语音设置（语音输入/输出开关、默认声线选择）
- ✅ 动画设置（Live2D、呼吸、眨眼开关）
- ✅ 隐私设置（对话记忆开关、清除对话/记忆）
- ✅ 账号设置（修改昵称、修改密码）
- ✅ 恢复默认设置
- ✅ 二次确认（清除对话/记忆前）
- ✅ 自动隐藏确认按钮（3秒后）
- ✅ 修改密码弹窗

**样式文件**: `apps/web/src/components/SettingsPanel.css`

样式特性：
- ✅ 半透明毛玻璃背景
- ✅ 滑动动画效果
- ✅ 开关组件样式
- ✅ 模态框样式
- ✅ 自定义滚动条

### 2.4 ChatPage 集成

**文件**: `apps/web/src/pages/ChatPage.tsx`

功能集成：
- ✅ 设置按钮显示
- ✅ 设置面板集成
- ✅ 语音输入控制
- ✅ 语音输出控制
- ✅ Live2D 动画控制
- ✅ 清除对话/记忆功能
- ✅ 修改密码功能
- ✅ 设置与功能实时联动

**样式文件**: `apps/web/src/pages/ChatPage.css`

样式特性：
- ✅ 设置按钮样式
- ✅ 语音播放按钮样式
- ✅ 语音输入按钮样式
- ✅ 实时识别结果样式
- ✅ 动画效果（脉冲、旋转、声波）

## 三、后端接口

### 3.1 清除所有对话

**路由**: `DELETE /api/chats/all`

**功能**: 清除当前用户所有对话（级联删除消息）

**实现**:
- 使用事务确保数据一致性
- 先删除所有消息
- 再删除所有对话
- 硬删除（非软删除）

### 3.2 清除所有记忆

**路由**: `DELETE /api/memories/all`

**功能**: 清除当前用户所有角色记忆

**实现**:
- 删除 scope 为 'memory' 的所有记录
- 使用 Prisma 的 deleteMany 方法

### 3.3 修改密码

**路由**: `PUT /api/auth/password`

**功能**: 修改当前用户密码

**验证**:
- 旧密码和新密码不能为空
- 新密码至少6位
- 旧密码必须正确

**实现**:
- 使用 SHA256 哈希密码
- 使用 timing-safe-compare 防止时序攻击

## 四、功能联动规则

### 4.1 语音设置

1. `voiceInput = false`
   - ChatInput 不渲染麦克风按钮
   - 语音输入功能禁用

2. `voiceOutput = false`
   - AI 回复气泡不渲染喇叭按钮
   - 立即停止当前播放的 TTS 音频
   - 断开 LipSync

3. `defaultVoice` 改变
   - 新建角色时默认使用此声线
   - 已有角色的 voiceId 不受影响

### 4.2 动画设置

1. `live2dAnimation = false`
   - 停止 Live2D 渲染
   - 显示静态头像
   - 禁用呼吸和眨眼开关

2. `breathingAnimation = false`
   - 停止 ParamBodyAngleY 的呼吸循环动画
   - 保持默认姿态

3. `autoBlink = false`
   - 停止 ParamEyeLOpen / ParamEyeROpen 的随机眨眼循环

### 4.3 隐私设置

1. `conversationMemory = false`
   - 发消息后不保存到数据库
   - 仅内存中保留当前会话
   - 刷新后丢失

2. 清除所有对话
   - 二次确认（3秒后自动消失）
   - 使用事务确保数据一致性
   - 级联删除消息

3. 清除所有记忆
   - 二次确认（3秒后自动消失）
   - 删除所有 scope 为 'memory' 的记录

## 五、关键规则实现

✅ 所有设置项存 localStorage key='lpm_settings'，自动序列化/反序列化
✅ 首次访问无存储时使用 DEFAULT_SETTINGS
✅ 开关切换立即生效，不需要刷新页面
✅ 清除对话/记忆前必须二次确认（确认按钮显示后3秒自动消失）
✅ 修改密码成功后提示"密码修改成功"
✅ 语音输入不支持时（非Chrome/Edge或非HTTPS），麦克风按钮灰色 + tooltip，不隐藏
✅ Live2D动画关闭时，呼吸和眨眼开关自动disabled
✅ 设置面板保持 github airi 极简风格，半透明毛玻璃背景

## 六、文件清单

### 前端文件

1. **类型定义**
   - `apps/web/src/types/speech-recognition.d.ts` - 语音识别类型
   - `apps/web/src/types/settings.ts` - 设置类型

2. **Hooks**
   - `apps/web/src/hooks/useVoiceInput.ts` - 语音输入 Hook
   - `apps/web/src/hooks/useSettings.ts` - 设置管理 Hook

3. **组件**
   - `apps/web/src/components/ChatInput.tsx` - 聊天输入组件
   - `apps/web/src/components/ChatInput.css` - 聊天输入样式
   - `apps/web/src/components/SettingsPanel.tsx` - 设置面板组件
   - `apps/web/src/components/SettingsPanel.css` - 设置面板样式

4. **页面**
   - `apps/web/src/pages/ChatPage.tsx` - 聊天页面
   - `apps/web/src/pages/ChatPage.css` - 聊天页面样式

### 后端文件

1. **路由**
   - `apps/server/src/routes/chats.ts` - 对话路由（添加清除所有对话）
   - `apps/server/src/index.ts` - 主路由文件（添加清除记忆、修改密码）

## 七、使用说明

### 7.1 语音输入

1. 点击输入框左侧的麦克风按钮
2. 允许浏览器访问麦克风
3. 开始说话，实时识别结果会显示在输入框上方
4. 说话结束后，识别结果自动填入输入框
5. 再次点击麦克风按钮可停止录音

### 7.2 系统设置

1. 点击聊天页面右上角的设置按钮（⚙️）
2. 在设置面板中调整各项设置
3. 设置会自动保存到浏览器本地存储
4. 点击面板外部或关闭按钮可关闭设置面板

### 7.3 清除数据

1. 在设置面板的"隐私"部分
2. 点击"清除所有对话"或"清除所有记忆"
3. 在3秒内点击"确认"按钮
4. 数据将被清除

### 7.4 修改密码

1. 在设置面板的"账号"部分
2. 点击"修改密码"按钮
3. 输入旧密码和新密码（至少6位）
4. 点击"确认"按钮
5. 密码修改成功

## 八、注意事项

1. 语音输入需要浏览器支持 Web Speech API（推荐 Chrome 或 Edge）
2. 语音输入需要 HTTPS 或 localhost 环境
3. 清除对话和记忆是不可逆操作，请谨慎操作
4. 修改密码需要旧密码验证
5. 所有设置保存在浏览器本地存储，清除浏览器数据会丢失设置
6. Live2D 动画关闭后，呼吸和眨眼开关会自动禁用

## 九、未来改进方向

1. 添加更多语音识别语言支持
2. 支持自定义语音识别参数（语速、音量等）
3. 添加设置导入/导出功能
4. 支持云端同步设置
5. 添加更多动画效果选项
6. 支持自定义主题颜色
7. 添加键盘快捷键支持
8. 优化移动端适配
