# 面试准备速查表

> 本文件是面试前必看的核心内容整理，2026-06-22 更新

---

## 📁 新增/修改的文件

### 🆕 新增文件
| 文件 | 用途 |
|------|------|
| `apps/web/src/__tests__/auth.test.ts` | 前端认证测试示例 |
| `apps/web/vitest.config.ts` | Vitest 测试配置 |

### 📝 修改文件
| 文件 | 修改内容 |
|------|---------|
| `README.md` | 更新了功能清单，移除了"占位"描述 |
| `apps/web/src/features/live2d-driver/driver.ts` | 清理了调试代码 |

### 📚 已有文档
| 文件 | 用途 |
|------|------|
| `INTERVIEW_PREP.md` | 详细的面试准备文档 |
| `CODE_REVIEW_GUIDE.md` | 代码审查清单和核心文件说明 |
| `TEST_CHECKLIST.md` | 功能测试清单 |

---

## 🎯 面试必背内容

### 1. 项目亮点（30秒自我介绍用）

```
这是一个 AI 陪伴系统，包含：
- Live2D 虚拟形象（情绪驱动）
- 语音对话（Edge TTS + Faster-Whisper）
- AI 对话（Ollama 流式响应）
- 记忆系统（Prisma 持久化）
- 多角色管理

技术栈：
- 前端：React 18 + TypeScript + Vite + PIXI.js
- 后端：Fastify + Prisma
- AI：Ollama + Edge TTS
- 工程化：pnpm + Turbo + Vitest
```

### 2. 技术问题答案

#### Q: 为什么从 localStorage 迁移到 HttpOnly Cookie？

```
localStorage 问题：
1. XSS 攻击可以读取 token
2. 任何 JS 都能访问

HttpOnly Cookie 优势：
1. JS 无法读取（防 XSS）
2. 自动随请求发送
3. 可设置过期时间
```

#### Q: React useEffect 依赖项问题？

```
问题：把 defaultExpression 放在依赖项里
原因：每次情绪变化 → setState → useEffect 重新执行 → Live2D 重建

解决：移除 defaultExpression，情绪变化时只调用 driveEmotion()
```

#### Q: 事件驱动架构？

```
ai-emotion-change 自定义事件
流程：AI 回复 → 解析情绪 → 发送事件 → Live2D 监听 → 驱动表情

好处：模块解耦，易于扩展新的情绪消费者
```

#### Q: SSE 流式响应？

```
前端：EventSource 或 fetch + ReadableStream
后端：Fastify + 流式响应

优势：实时返回，无需等待完整响应
```

#### Q: Monorepo 优势？

```
1. 代码共享（packages/shared）
2. 统一版本管理
3. 增量构建（Turbo）
4. 统一 CI/CD
```

### 3. 核心文件速查

| 文件 | 面试问题 |
|------|---------|
| `apps/server/src/auth.ts` | JWT + Cookie 实现 |
| `apps/web/src/pages/Live2DPage.tsx` | React Hooks 问题 |
| `apps/web/src/features/live2d-driver/driver.ts` | PIXI + 情绪系统 |
| `apps/server/src/index.ts` | Fastify 中间件 |
| `apps/server/prisma/schema.prisma` | 数据库设计 |

### 4. 情绪系统（13种情绪）

```
neutral, happy, sad, angry, surprised, fearful
disgusted, shy, warm, tsundere, concerned, sleepy, tired
```

### 5. 预设动画（14种）

```
nod, shake, tiltHead, lookAround, wave, bow
stretch, bounce, doubleBlink, wink, lookUp
pout, giggle, sigh
```

---

## 💬 面试话术模板

### 关于 Live2D bug
```
"我遇到过一个问题：用户发消息后 Live2D 模型会消失。
原因是我把 defaultExpression 放在 useEffect 依赖项里，
每次情绪变化都会触发重新初始化。

解决方案是移除这个依赖，情绪变化时只调用 driveEmotion()
更新表情参数，而不是重新加载整个模型。

这个经历让我深刻理解了 React 依赖项的作用域问题。"
```

### 关于 HttpOnly Cookie
```
"我们从 localStorage 迁移到了 HttpOnly Cookie。
localStorage 的问题是 XSS 可以读取 token。
HttpOnly Cookie 的优势是 JS 无法读取，有效防止 XSS 攻击。

实现方式是后端在登录时通过 Set-Cookie 设置，
前端使用 credentials: 'include' 自动发送。"
```

### 关于事件驱动
```
"Live2D 组件和其他模块是通过自定义事件解耦的。
AI 回复情绪变化时，发送 ai-emotion-change 事件，
Live2D 组件监听这个事件并驱动表情。

这种设计的好处是：
1. 模块间解耦，不需要直接引用
2. 易于扩展新的情绪消费者
3. 符合发布订阅模式"
```

---

## ⚠️ 面试前检查清单

- [ ] 能说出项目的 5 个核心功能
- [ ] 能解释 HttpOnly Cookie vs localStorage
- [ ] 能解释 useEffect 依赖项问题
- [ ] 能画出简单的架构图
- [ ] 能说出情绪驱动的流程
- [ ] 知道 driver.ts 的主要功能
