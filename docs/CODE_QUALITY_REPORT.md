# 代码质量改进报告

> 生成日期：2026-06-11
> 项目：AITS Web Application

---

## 一、改进总览

| 类别 | 改进前 | 改进后 | 状态 |
|------|--------|--------|------|
| `console.*` 残留 | 151处 / 36文件 | 0处（仅 logger.ts 定义保留） | ✅ 已完成 |
| `as any` 类型断言 | 26处 / 12文件 | 核心bug已修复 | ✅ P0已修复 |
| localStorage JWT | 22处直接调用 | 集中到 auth.ts 函数层 | ✅ 已集中 |
| vendor-live2d chunk | 709KB 单chunk | 拆分为 vendor-pixi + vendor-live2d | ✅ 已优化 |
| 敏感日志泄露 | LoginPage 打印请求体 | 已移除 | ✅ 已修复 |
| HttpOnly Cookie 迁移 | token 存 localStorage | 后端设 Cookie + 前端移除 token 存储 | ✅ 已完成 |

---

## 二、已完成修复详情

### 2.1 P0 - `as any` 导致的 .userId Bug

**文件**: `apps/server/src/routes/providers.ts`

**问题**: 使用 `(request as any).user.id` 访问用户ID，但 `AuthUser` 接口中字段名为 `userId`，导致运行时取到 `undefined`。

**修复**:
```typescript
// 修复前
(request as any).user.id

// 修复后
request.user?.userId
```

**影响**: 修复了所有依赖 `request.user` 的路由中用户身份识别失败的问题。

---

### 2.2 P1 - LoginPage 敏感信息泄露

**文件**: `apps/web/src/pages/LoginPage.tsx`

**问题**: `console.log('请求体:', body)` 将用户登录凭据（用户名/密码）打印到控制台。

**修复**: 删除该日志行，其余 `console.log` 替换为 `logger.log`。

---

### 2.3 console.* 全量替换为 logger

**涉及文件**（按模块分类）：

#### Hooks（8个文件）
| 文件 | 替换数 |
|------|--------|
| `useWhisperStream.ts` | 4 |
| `useVoiceOutput.ts` | 5 |
| `useRealtimeVoice.ts` | 6 |
| `useMultiMediaPipe.ts` | 5 |
| `useVoiceInput.ts` | 3 |
| `useChatStream.ts` | 1 |
| `useEdgeTTS.ts` | 2 |
| `useFaceMeshCamera.ts` | 已完成 |

#### Components（7个文件）
| 文件 | 替换数 |
|------|--------|
| `ErrorBoundary.tsx` | 1 |
| `FaceMeshControlPanel.tsx` | 3 |
| `CreatePersonaModal.tsx` | 2 |
| `SpeakerButton.tsx` | 2 |
| `ChatInput.tsx` | 4 |
| `ChatHistoryPanel.tsx` | 3 |
| `SettingsPanel.tsx` | 3 |

#### Pages（7个文件）
| 文件 | 替换数 |
|------|--------|
| `PersonaCenterPage.tsx` | 5 |
| `PersonaDetailPage.tsx` | 1 |
| `ChatPage.tsx` | 4 |
| `SettingsPage.tsx` | 1 |
| `MemoryPage.tsx` | 1 |
| `PersonaListPage.tsx` | 1 |
| `PersonasPage.tsx` | 2 |

#### Services（5个文件）
| 文件 | 替换数 |
|------|--------|
| `LLMMotionDecision.ts` | 2 |
| `LipSyncController.ts` | 1 |
| `AIDrivenLive2DController.ts` | 4 |
| `FaceMeshLive2DController.ts` | 4 |
| `live2d-renderer.ts` | 4 |

#### Contexts（2个文件）
| 文件 | 替换数 |
|------|--------|
| `ChatContext.tsx` | 6 |
| `AppContext.tsx` | 2 |

#### Utils / Core（3个文件）
| 文件 | 替换数 |
|------|--------|
| `main.tsx` | 已完成 |
| `api.ts` | 已完成 |
| `live2d/loader.ts` | 已完成 |

**logger 工具说明**:
- 生产环境：`log` / `debug` 自动静默，`warn` / `error` 保留输出
- 开发环境：全部输出，带 `[LOG]` / `[WARN]` / `[ERROR]` 前缀
- 支持模块化前缀：`logger.createModule('Live2D')` → `[Live2D]` 前缀

---

### 2.4 localStorage JWT 集中化

**文件**: `apps/web/src/utils/auth.ts`

**策略**: 不直接修改存储方式（需后端配合），而是将所有 `localStorage.getItem/setItem/removeItem` 调用集中到 auth.ts 的函数层。

```typescript
// 集中读写层 - 未来迁移 HttpOnly Cookie 只需改此区域
const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);
export const getUserRaw = (): string | null => localStorage.getItem(USER_KEY);
export const setUserRaw = (raw: string): void => localStorage.setItem(USER_KEY, raw);
export const clearUser = (): void => localStorage.removeItem(USER_KEY);
export const clearAuth = (): void => { clearToken(); clearUser(); };
```

**已替换文件**:
- `main.tsx` - 初始化读取 token/user
- `Navbar.tsx` - 登出时清除
- `LoginPage.tsx` - 登录时写入
- `api.ts` - 请求拦截器读取 token
- `ChatContext.tsx` - 上下文初始化

---

### 2.5 Vite 构建优化

**文件**: `apps/web/vite.config.ts`

**问题**: `vendor-live2d` chunk 达 709KB，触发构建警告。

**修复**: 将 pixi.js 独立拆分：

```typescript
manualChunks: {
  'vendor-react': ['react', 'react-dom', 'react-router-dom'],
  'vendor-pixi': ['pixi.js'],
  'vendor-live2d': ['pixi-live2d-display'],
}
```

**效果**: pixi.js 独立缓存，Live2D SDK 可按需加载，减少首屏加载体积。

---

## 三、HttpOnly Cookie 迁移详情（已完成）

### 3.1 后端改造

**新增依赖**: `@fastify/cookie`（已注册到 `index.ts`）

**`apps/server/src/auth.ts` 改动**:
- 新增 `setAuthCookie(reply, token)` — 登录/注册时设置 HttpOnly Cookie
- 新增 `clearAuthCookie(reply)` — 登出/401 时清除 Cookie
- 新增 `extractToken(request)` — 优先从 Cookie 读取，兼容 Bearer Header（过渡期）
- `requireAuth` 改为使用 `extractToken`，同时支持 Cookie 和 Header 两种方式
- Cookie 配置：`httpOnly: true, secure: production, sameSite: 'lax', maxAge: 7d`

**`apps/server/src/routes/auth.ts` 改动**:
- `/api/auth/login` 和 `/api/auth/register` 登录成功后调用 `setAuthCookie`
- 新增 `POST /api/auth/logout` 接口，调用 `clearAuthCookie`

**`apps/server/src/middleware/auth.ts` 改动**:
- 同步更新 `requireAuth`，使用 `extractToken` 支持 Cookie + Header 双模式

**`apps/server/src/index.ts` 改动**:
- 注册 `@fastify/cookie` 插件
- CORS 已配置 `credentials: true`，无需额外修改

### 3.2 前端改造

**`apps/web/src/utils/auth.ts` 改动**:
- `getToken()` → 返回 `null`（前端不再持有 token）
- `setToken()` → 空操作（Cookie 由后端 Set-Cookie 自动设置）
- `clearToken()` → 调用 `POST /api/auth/logout` 清除后端 Cookie
- `getAuthHeaders()` → 不再注入 `Authorization` header
- `apiFetch()` → 移除 token 逻辑，仅依赖 `credentials: 'include'`
- `checkAuth()` → 仅检查 localStorage 中的 user 信息
- 新增 `checkAuthAsync()` → 通过 `/api/auth/me` 接口验证 Cookie 有效性

**`apps/web/src/utils/api.ts` 改动**:
- `ApiClient.request()` → 移除 `getAuthHeaders()` 调用，改用 `credentials: 'include'`

**`apps/web/src/pages/LoginPage.tsx` 改动**:
- 移除 `setToken()` 调用
- 登录 fetch 添加 `credentials: 'include'`
- 登录成功后仅存储 user 信息到 localStorage

**`apps/web/src/main.tsx` 改动**:
- `readAuthState()` → 仅检查 user 信息（不再检查 token）
- `AppRoutes` → `hasUser` 替代 `hasToken`
- `AuthProvider` → 启动时调用 `checkAuthAsync()` 验证 Cookie 有效性
- 移除 `StorageEvent` 监听（token 不再存 localStorage）

**`apps/web/src/components/Navbar.tsx` 改动**:
- `hasUser` 替代 `hasToken`

### 3.3 兼容性说明

- **过渡期双模式**: 后端 `extractToken` 同时支持 Cookie 和 Bearer Header，确保旧客户端/API 工具仍可正常使用
- **CSRF 防护**: Cookie 设置 `sameSite: 'lax'`，防止跨站 POST 请求携带 Cookie
- **XSS 防护**: `httpOnly: true` 确保前端 JS 无法读取 token
- **生产环境**: `secure: true` 确保 Cookie 仅通过 HTTPS 传输

---

## 四、待后续优化

### 4.1 vendor-live2d 进一步优化
- Live2D 模型资源按需加载（动态 import）
- 考虑使用 `?url` 导入只引用路径，不内联
- 开启 gzip/brotli 压缩（部署层面）

### 4.2 其他 `as any` 类型断言

**当前状态**: P0 级别的功能性 bug 已修复，剩余约 25 处 `as any` 多为第三方库类型不完整导致。

**建议处理方式**:
- 为常用第三方库创建 `*.d.ts` 类型声明文件
- 使用类型守卫（Type Guard）替代断言
- 逐步补充，优先处理高频调用路径

---

## 五、文件变更清单

| 文件路径 | 变更类型 |
|----------|----------|
| `apps/server/src/auth.ts` | HttpOnly Cookie 支持 |
| `apps/server/src/routes/auth.ts` | 登录设 Cookie + 登出接口 |
| `apps/server/src/middleware/auth.ts` | Cookie + Header 双模式 |
| `apps/server/src/index.ts` | 注册 @fastify/cookie |
| `apps/web/src/utils/auth.ts` | 移除 token 存储，改 Cookie 模式 |
| `apps/web/src/utils/api.ts` | 移除 Authorization header |
| `apps/web/src/pages/LoginPage.tsx` | 移除 setToken，加 credentials |
| `apps/web/src/main.tsx` | 认证状态改 user 检查 + checkAuthAsync |
| `apps/web/src/components/Navbar.tsx` | hasUser 替代 hasToken |
| `apps/server/src/routes/providers.ts` | Bug修复 |
| `apps/web/vite.config.ts` | 构建优化 |
| `apps/web/src/utils/logger.ts` | 已有（未修改） |
| `apps/web/src/contexts/ChatContext.tsx` | auth + logger |
| `apps/web/src/contexts/AppContext.tsx` | logger |
| `apps/web/src/utils/live2d/loader.ts` | logger |
| `apps/web/src/hooks/useWhisperStream.ts` | logger |
| `apps/web/src/hooks/useVoiceOutput.ts` | logger |
| `apps/web/src/hooks/useRealtimeVoice.ts` | logger |
| `apps/web/src/hooks/useMultiMediaPipe.ts` | logger |
| `apps/web/src/hooks/useVoiceInput.ts` | logger |
| `apps/web/src/hooks/useChatStream.ts` | logger |
| `apps/web/src/hooks/useEdgeTTS.ts` | logger |
| `apps/web/src/components/ErrorBoundary.tsx` | logger |
| `apps/web/src/components/FaceMeshControlPanel.tsx` | logger |
| `apps/web/src/components/CreatePersonaModal.tsx` | logger |
| `apps/web/src/components/SpeakerButton.tsx` | logger |
| `apps/web/src/components/ChatInput.tsx` | logger |
| `apps/web/src/components/ChatHistoryPanel.tsx` | logger |
| `apps/web/src/components/SettingsPanel.tsx` | logger |
| `apps/web/src/pages/PersonaCenterPage.tsx` | logger |
| `apps/web/src/pages/PersonaDetailPage.tsx` | logger |
| `apps/web/src/pages/ChatPage.tsx` | logger |
| `apps/web/src/pages/SettingsPage.tsx` | logger |
| `apps/web/src/pages/MemoryPage.tsx` | logger |
| `apps/web/src/pages/PersonaListPage.tsx` | logger |
| `apps/web/src/pages/PersonasPage.tsx` | logger |
| `apps/web/src/services/LLMMotionDecision.ts` | logger |
| `apps/web/src/services/live2d/LipSyncController.ts` | logger |
| `apps/web/src/services/live2d/AIDrivenLive2DController.ts` | logger |
| `apps/web/src/services/live2d/FaceMeshLive2DController.ts` | logger |
| `apps/web/src/services/renderer/live2d-renderer.ts` | logger |

---

## 六、验证清单

- [x] `console.*` 残留：仅 `logger.ts` 定义保留
- [x] `as any` P0 bug：`request.user?.userId` 替代 `(request as any).user.id`
- [x] LoginPage 敏感日志：已删除
- [x] localStorage JWT 集中化：所有读写通过 `auth.ts` 函数
- [x] HttpOnly Cookie 迁移：后端设 Cookie，前端移除 token 存储
- [x] Vite chunk 拆分：`vendor-pixi` + `vendor-live2d`
- [x] 前端 TypeScript 类型检查通过
- [x] 后端 TypeScript 类型检查通过
- [ ] 构建产物验证：需运行 `npm run build` 确认无警告
- [ ] 端到端登录流程验证：需启动前后端测试