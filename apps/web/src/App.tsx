import { Link } from 'react-router-dom';
import './App.css';

type FeatureLink = {
  title: string;
  description: string;
  href: string;
  category: string;
};

const featureLinks: FeatureLink[] = [
  {
    title: 'Chat',
    category: '对话',
    description: '进入对话页面，测试本地 LLM 聊天与上下文能力。',
    href: '/chat'
  },
  {
    title: 'Persona',
    category: '角色',
    description: '管理角色设定、提示词与 Live2D 绑定信息。',
    href: '/personas'
  },
  {
    title: 'Live2D',
    category: '模型',
    description: '预览模型驱动、表情动作和画面展示效果。',
    href: '/live2d'
  },
  {
    title: 'Voice',
    category: '语音',
    description: '配置语音输入输出、TTS 与口型同步能力。',
    href: '/voice'
  },
  {
    title: 'AI Providers',
    category: '模型',
    description: '管理多个 AI 模型提供商，为不同角色分配不同的模型。',
    href: '/ai-providers'
  },
  {
    title: 'Memory',
    category: '记忆',
    description: '查看和维护长期记忆、用户数据与偏好信息。',
    href: '/memory'
  },
  {
    title: 'Settings',
    category: '系统',
    description: '调整运行时、模型服务、安全与隐私相关配置。',
    href: '/settings'
  }
];

function App() {
  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="app-title">
        <p className="eyebrow">Local AI Companion</p>
        <h1 id="app-title">AITS Web Console</h1>
        <p className="hero-description">
          面向本地 AI 伴侣系统的 Web 控制台，用于访问聊天、角色、语音、Live2D
          和记忆管理等核心模块。
        </p>

        <div className="hero-actions" aria-label="主要操作">
          <Link className="button button-primary" to="/chat">
            开始聊天
          </Link>
          <Link className="button button-secondary" to="/personas">
            管理角色
          </Link>
        </div>
      </section>

      <section className="feature-grid" aria-label="功能入口">
        {featureLinks.map((item) => (
          <Link className="feature-card" to={item.href} key={item.href}>
            <span className="feature-category">{item.category}</span>
            <span className="feature-title">{item.title}</span>
            <span className="feature-description">{item.description}</span>
            <span className="feature-link-text">进入模块 →</span>
          </Link>
        ))}
      </section>
    </main>
  );
}

export default App;