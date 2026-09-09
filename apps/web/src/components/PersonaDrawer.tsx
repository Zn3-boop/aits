import type { ReactNode } from 'react';

type Persona = {
  id: string;
  name: string;
  subtitle: string;
  avatar?: string;
  accent?: string;
  description?: string;
  systemPrompt?: string;
  modelPath?: string;
  modelKey?: string;
};

type PersonaDrawerProps = {
  open: boolean;
  personas: Persona[];
  currentPersona: Persona | null;
  onSelect: (persona: Persona) => void;
  onClose: () => void;
};

function getInitial(name: string) {
  return name.charAt(0) || '?';
}

export function PersonaDrawer({ open, personas, currentPersona, onSelect, onClose }: PersonaDrawerProps) {
  if (!open) return null;

  return (
    <div className="persona-drawer">
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-panel">
        <div className="drawer-title">
          <span>切换角色</span>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        {personas.map(persona => (
          <div
            key={persona.id}
            className={`persona-card-item${currentPersona?.id === persona.id ? ' active' : ''}`}
            onClick={() => onSelect(persona)}
          >
            <span
              className="card-avatar"
              style={{ background: persona.accent || '#c9956b' }}
            >
              {getInitial(persona.name)}
            </span>
            <div className="card-info">
              <div className="card-name">{persona.name}</div>
              <div className="card-sub">{persona.subtitle || persona.description || ''}</div>
            </div>
          </div>
        ))}
        {personas.length === 0 && (
          <div style={{ color: '#8b7262', fontSize: 13, textAlign: 'center', padding: 20 }}>
            暂无角色，请先创建角色
          </div>
        )}
      </div>
    </div>
  );
}