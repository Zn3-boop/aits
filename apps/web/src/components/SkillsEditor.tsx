/**
 * Skills 配置组件
 * 
 * 用于角色编辑器中配置内置技能
 */

import React from 'react';

// Skill 类型
type SkillName = 'MemoryRetriever' | 'EmotionAdapter' | 'Validator' | 'Decider';

interface Skill {
  id: SkillName;
  name: string;
  description: string;
  icon: string;
  enabledByDefault: boolean;
}

const SKILLS: Skill[] = [
  {
    id: 'MemoryRetriever',
    name: '记忆检索者',
    description: 'AI 回答前自动查数据库历史记忆，提取关键上下文',
    icon: '🧠',
    enabledByDefault: true,
  },
  {
    id: 'EmotionAdapter',
    name: '情绪适配者',
    description: '读取摄像头用户情绪，调整语气、语速、用词温柔度',
    icon: '😊',
    enabledByDefault: true,
  },
  {
    id: 'Validator',
    name: '内容校验者',
    description: '过滤敏感内容、保证人设统一、不跑偏、不越界',
    icon: '🛡️',
    enabledByDefault: true,
  },
  {
    id: 'Decider',
    name: '对话决策者',
    description: '控制：要不要继续聊、要不要反问、要不要共情、要不要结束话题',
    icon: '🎯',
    enabledByDefault: true,
  },
];

interface SkillsEditorProps {
  enabledSkills: SkillName[];
  onChange: (skills: SkillName[]) => void;
  disabled?: boolean;
}

export const SkillsEditor: React.FC<SkillsEditorProps> = ({
  enabledSkills,
  onChange,
  disabled = false,
}) => {
  const toggleSkill = (skillId: SkillName) => {
    if (disabled) return;
    
    if (enabledSkills.includes(skillId)) {
      // 至少保留一个技能
      if (enabledSkills.length > 1) {
        onChange(enabledSkills.filter(id => id !== skillId));
      }
    } else {
      onChange([...enabledSkills, skillId]);
    }
  };

  return (
    <div className="skills-editor">
      <div className="skills-header">
        <h4>🎛️ 内置技能配置</h4>
        <p className="skills-hint">
          勾选角色需要启用的内置技能。这些技能会在 AI 生成回复前自动执行。
        </p>
      </div>

      <div className="skills-list">
        {SKILLS.map((skill) => (
          <div
            key={skill.id}
            className={`skill-item ${enabledSkills.includes(skill.id) ? 'enabled' : 'disabled'}`}
            onClick={() => toggleSkill(skill.id)}
          >
            <div className="skill-checkbox">
              <input
                type="checkbox"
                checked={enabledSkills.includes(skill.id)}
                onChange={() => toggleSkill(skill.id)}
                disabled={disabled}
              />
            </div>
            <div className="skill-icon">{skill.icon}</div>
            <div className="skill-info">
              <div className="skill-name">{skill.name}</div>
              <div className="skill-desc">{skill.description}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="skills-footer">
        <span className="skills-count">
          已启用 {enabledSkills.length} / {SKILLS.length} 项技能
        </span>
      </div>

      <style>{`
        .skills-editor {
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 12px;
          padding: 16px;
        }

        .skills-header h4 {
          margin: 0 0 8px 0;
          font-size: 16px;
          color: var(--text-primary, #333);
        }

        .skills-hint {
          margin: 0 0 16px 0;
          font-size: 13px;
          color: var(--text-secondary, #666);
          line-height: 1.5;
        }

        .skills-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .skill-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: white;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          border: 2px solid transparent;
        }

        .skill-item:hover:not(.disabled) {
          background: var(--bg-hover, #f0f0f0);
        }

        .skill-item.enabled {
          border-color: var(--primary-color, #4a90d9);
          background: var(--bg-enabled, #e8f4fd);
        }

        .skill-item.disabled {
          opacity: 0.6;
        }

        .skill-checkbox input {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .skill-icon {
          font-size: 24px;
          width: 32px;
          text-align: center;
        }

        .skill-info {
          flex: 1;
        }

        .skill-name {
          font-weight: 600;
          font-size: 14px;
          color: var(--text-primary, #333);
          margin-bottom: 4px;
        }

        .skill-desc {
          font-size: 12px;
          color: var(--text-secondary, #666);
          line-height: 1.4;
        }

        .skills-footer {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--border-color, #e0e0e0);
        }

        .skills-count {
          font-size: 12px;
          color: var(--text-secondary, #666);
        }
      `}</style>
    </div>
  );
};

export default SkillsEditor;
