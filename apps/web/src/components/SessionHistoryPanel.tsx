type SessionSummary = {
  id: string;
  sessionId?: string;
  personaId: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  messageCount: number;
};

type SessionHistoryPanelProps = {
  open: boolean;
  sessions: SessionSummary[];
  currentSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onClose: () => void;
};

export function SessionHistoryPanel({ open, sessions, currentSessionId, onSelect, onClose }: SessionHistoryPanelProps) {
  if (!open) return null;

  return (
    <div className="history-sheet">
      <div className="history-header">
        <span>📋 对话历史</span>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      {sessions.length === 0 ? (
        <div className="empty-hint" style={{ marginTop: 20 }}>
          暂无对话记录
        </div>
      ) : (
        sessions.map(session => {
          const sid = session.sessionId || session.id;
          const isActive = currentSessionId === sid;
          return (
            <div
              key={sid}
              className={`history-item${isActive ? ' active' : ''}`}
              onClick={() => {
                onSelect(sid);
                onClose();
              }}
            >
              <div className="history-title">{session.title}</div>
              <div className="history-preview">{session.lastMessage}</div>
              <div className="history-meta">
                {new Date(session.updatedAt).toLocaleString('zh-CN')} · {session.messageCount} 条消息
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}