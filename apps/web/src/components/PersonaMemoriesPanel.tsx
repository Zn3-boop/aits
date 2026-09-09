type PersonaMemory = {
  id: string;
  content: string;
  tags: unknown;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

type PersonaMemoriesPanelProps = {
  open: boolean;
  personaName: string;
  memories: PersonaMemory[];
  loading: boolean;
  onClose: () => void;
};

export function PersonaMemoriesPanel({ open, personaName, memories, loading, onClose }: PersonaMemoriesPanelProps) {
  if (!open) return null;

  return (
    <div className="persona-drawer" style={{ zIndex: 90 }}>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-panel" style={{ right: 0, left: 'auto' }}>
        <div className="drawer-title">
          <span>🧠 {personaName} 的记忆</span>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        {loading ? (
          <div style={{ color: '#8b7262', fontSize: 13, textAlign: 'center', padding: 20 }}>
            加载中...
          </div>
        ) : memories.length === 0 ? (
          <div style={{ color: '#8b7262', fontSize: 13, textAlign: 'center', padding: 20 }}>
            暂无记忆。AI 会在聊天过程中自动记住关于你的事情。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {memories.map(m => (
              <div
                key={m.id}
                style={{
                  background: 'rgba(255,255,255,0.4)',
                  padding: '10px 12px',
                  borderRadius: 10,
                  fontSize: 13,
                  color: '#3e2c23',
                  lineHeight: 1.5
                }}
              >
                <div>{m.content}</div>
                <div style={{ fontSize: 11, color: '#8b7262', marginTop: 4 }}>
                  ⭐ {m.priority}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}