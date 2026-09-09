import { useState, useCallback, useEffect } from 'react';
import { AVAILABLE_VOICES } from '../types/settings';
import type { AppSettings } from '../types/settings';
import { logger } from '../utils/logger';
import './SettingsPanel.css';

interface SettingsPanelProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
  onClose: () => void;
  // Live2D 控制函数
  stopCurrentAudio?: () => void;
  stopLive2DAnimation?: () => void;
  resumeLive2DAnimation?: () => void;
  stopBreathing?: () => void;
  startBreathing?: () => void;
  stopBlinking?: () => void;
  startBlinking?: () => void;
  // 清除数据函数
  onClearAllChats?: () => Promise<void>;
  onClearAllMemories?: () => Promise<void>;
  // 用户信息
  nickname?: string;
  onUpdateNickname?: (nickname: string) => Promise<void>;
  onChangePassword?: (oldPassword: string, newPassword: string) => Promise<void>;
}

// 通用开关组件
const SettingSwitch = ({ 
  label, 
  description, 
  checked, 
  onChange, 
  disabled 
}: { 
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) => (
  <div className={`flex items-center justify-between ${disabled ? 'opacity-30' : ''}`}>
    <div>
      <span className="text-white/80">{label}</span>
      {description && <p className="text-white/40 text-xs">{description}</p>}
    </div>
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`
        w-10 h-5 rounded-full transition-colors relative
        ${checked ? 'bg-emerald-500/80' : 'bg-white/20'}
        ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span className={`
        absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform
        ${checked ? 'translate-x-5' : 'translate-x-0.5'}
      `} />
    </button>
  </div>
);

export const SettingsPanel = ({ 
  settings, 
  updateSetting, 
  resetSettings,
  stopCurrentAudio,
  stopLive2DAnimation,
  resumeLive2DAnimation,
  stopBreathing,
  startBreathing,
  stopBlinking,
  startBlinking,
  onClearAllChats,
  onClearAllMemories,
  nickname = '',
  onUpdateNickname,
  onChangePassword
}: SettingsPanelProps) => {
  const [showClearChatsConfirm, setShowClearChatsConfirm] = useState(false);
  const [showClearMemoriesConfirm, setShowClearMemoriesConfirm] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [tempNickname, setTempNickname] = useState(nickname);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleClearAllChats = useCallback(async () => {
    try {
      await onClearAllChats?.();
      setShowClearChatsConfirm(false);
    } catch (error) {
      logger.error('清除对话失败:', error);
    }
  }, [onClearAllChats]);

  const handleClearAllMemories = useCallback(async () => {
    try {
      await onClearAllMemories?.();
      setShowClearMemoriesConfirm(false);
    } catch (error) {
      logger.error('清除记忆失败:', error);
    }
  }, [onClearAllMemories]);

  const handleUpdateNickname = useCallback(async () => {
    try {
      await onUpdateNickname?.(tempNickname);
    } catch (error) {
      logger.error('更新昵称失败:', error);
    }
  }, [tempNickname, onUpdateNickname]);

  const handleChangePassword = useCallback(async () => {
    setPasswordError('');
    if (!oldPassword || !newPassword) {
      setPasswordError('旧密码和新密码不能为空');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('新密码至少6位');
      return;
    }
    try {
      await onChangePassword?.(oldPassword, newPassword);
      setShowChangePassword(false);
      setOldPassword('');
      setNewPassword('');
    } catch (err) {
      logger.error('修改密码失败:', err);
      setPasswordError('修改密码失败');
    }
  }, [oldPassword, newPassword, onChangePassword]);

  // 自动隐藏确认按钮
  useEffect(() => {
    if (showClearChatsConfirm) {
      const timer = setTimeout(() => setShowClearChatsConfirm(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showClearChatsConfirm]);

  useEffect(() => {
    if (showClearMemoriesConfirm) {
      const timer = setTimeout(() => setShowClearMemoriesConfirm(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showClearMemoriesConfirm]);

  return (
    <div className="settings-panel">
      <div className="settings-content">
        {/* 语音 */}
        <section>
          <h3 className="settings-section-title">语音</h3>
          <div className="settings-section-content">
            <SettingSwitch
              label="语音输入"
              checked={settings.voiceInput}
              onChange={v => updateSetting('voiceInput', v)}
            />
            <SettingSwitch
              label="语音输出"
              checked={settings.voiceOutput}
              onChange={v => {
                updateSetting('voiceOutput', v);
                if (!v) stopCurrentAudio?.();
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-white/80">默认声线</span>
              <select
                value={settings.defaultVoice}
                onChange={e => updateSetting('defaultVoice', e.target.value)}
                className="bg-white/10 text-white/80 rounded px-2 py-1 text-xs"
              >
                {AVAILABLE_VOICES.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* 动画 */}
        <section>
          <h3 className="settings-section-title">动画</h3>
          <div className="settings-section-content">
            <SettingSwitch
              label="Live2D 动画"
              checked={settings.live2dAnimation}
              onChange={v => {
                updateSetting('live2dAnimation', v);
                if (!v) stopLive2DAnimation?.();
                else resumeLive2DAnimation?.();
              }}
            />
            <SettingSwitch
              label="呼吸动画"
              checked={settings.breathingAnimation}
              onChange={v => {
                updateSetting('breathingAnimation', v);
                if (!v) stopBreathing?.();
                else startBreathing?.();
              }}
              disabled={!settings.live2dAnimation}
            />
            <SettingSwitch
              label="自动眨眼"
              checked={settings.autoBlink}
              onChange={v => {
                updateSetting('autoBlink', v);
                if (!v) stopBlinking?.();
                else startBlinking?.();
              }}
              disabled={!settings.live2dAnimation}
            />
          </div>
        </section>

        {/* 隐私 */}
        <section>
          <h3 className="settings-section-title">隐私</h3>
          <div className="settings-section-content">
            <SettingSwitch
              label="对话记忆"
              description="关闭后不会保存新对话"
              checked={settings.conversationMemory}
              onChange={v => updateSetting('conversationMemory', v)}
            />
            <div className="flex items-center justify-between">
              <span className="text-white/80">清除所有对话</span>
              {showClearChatsConfirm ? (
                <div className="flex gap-1">
                  <button
                    onClick={handleClearAllChats}
                    className="text-xs bg-red-500/80 text-white px-2 py-1 rounded"
                  >确认</button>
                  <button
                    onClick={() => setShowClearChatsConfirm(false)}
                    className="text-xs text-white/50 px-2 py-1"
                  >取消</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearChatsConfirm(true)}
                  className="text-xs text-red-400/60 hover:text-red-400"
                >清除</button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/80">清除所有记忆</span>
              {showClearMemoriesConfirm ? (
                <div className="flex gap-1">
                  <button
                    onClick={handleClearAllMemories}
                    className="text-xs bg-red-500/80 text-white px-2 py-1 rounded"
                  >确认</button>
                  <button
                    onClick={() => setShowClearMemoriesConfirm(false)}
                    className="text-xs text-white/50 px-2 py-1"
                  >取消</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearMemoriesConfirm(true)}
                  className="text-xs text-red-400/60 hover:text-red-400"
                >清除</button>
              )}
            </div>
          </div>
        </section>

        {/* 账号 */}
        <section>
          <h3 className="settings-section-title">账号</h3>
          <div className="settings-section-content">
            <div className="flex items-center justify-between">
              <span className="text-white/80">修改昵称</span>
              <div className="flex gap-1">
                <input
                  value={tempNickname}
                  onChange={e => setTempNickname(e.target.value)}
                  className="bg-white/10 text-white/80 rounded px-2 py-1 text-xs w-24"
                />
                <button
                  onClick={handleUpdateNickname}
                  className="text-xs text-white/60 hover:text-white"
                >保存</button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/80">修改密码</span>
              <button
                onClick={() => setShowChangePassword(true)}
                className="text-xs text-white/60 hover:text-white"
              >修改</button>
            </div>
          </div>
        </section>

        {/* 恢复默认 */}
        <button
          onClick={resetSettings}
          className="w-full text-center text-xs text-white/30 hover:text-white/60 py-2"
        >
          恢复默认设置
        </button>
      </div>

      {/* 修改密码弹窗 */}
      {showChangePassword && (
        <div className="settings-modal-overlay" onClick={() => setShowChangePassword(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <h3 className="settings-modal-title">修改密码</h3>
            <input
              type="password"
              placeholder="旧密码"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              className="settings-modal-input"
            />
            <input
              type="password"
              placeholder="新密码（至少6位）"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="settings-modal-input"
            />
            {passwordError && (
              <p className="settings-modal-error">{passwordError}</p>
            )}
            <div className="settings-modal-actions">
              <button
                onClick={() => setShowChangePassword(false)}
                className="settings-modal-btn cancel"
              >取消</button>
              <button
                onClick={handleChangePassword}
                className="settings-modal-btn confirm"
              >确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};