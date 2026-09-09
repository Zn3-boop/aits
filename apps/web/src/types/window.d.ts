// 全局窗口类型扩展
export {};

declare global {
  interface Window {
    __AI_IS_SPEAKING__?: boolean;
  }
}
