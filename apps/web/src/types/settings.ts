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

export const DEFAULT_SETTINGS: AppSettings = {
  voiceInput: true,
  voiceOutput: true,
  defaultVoice: 'zh-CN-XiaoxiaoNeural',
  live2dAnimation: true,
  breathingAnimation: true,
  autoBlink: true,
  conversationMemory: true,
};

export const AVAILABLE_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（温柔女声）' },
  { id: 'zh-CN-YunxiNeural', name: '云希（阳光男声）' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊（活泼女声）' },
];
