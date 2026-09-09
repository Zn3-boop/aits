import { useState, useRef, useContext } from 'react';
import { AuthContext } from '../main';
import { apiFetch, parseApiError, checkAuth } from '../utils/auth';
import { showToast } from '../utils/toast';
import './VoicePage.css';

type UploadMimeType = 'audio/wav' | 'audio/mpeg' | 'audio/mp4' | 'audio/x-m4a';

type Recording = {
  id: string;
  url: string;
  blob: Blob;
};

const detectMimeType = (blob: Blob): UploadMimeType => {
  if (blob.type === 'audio/mpeg') return 'audio/mpeg';
  if (blob.type === 'audio/mp4') return 'audio/mp4';
  if (blob.type === 'audio/x-m4a') return 'audio/x-m4a';
  return 'audio/wav';
};

export const VoicePage = () => {
  const { logout } = useContext(AuthContext)!;
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const ensureAuthenticated = () => {
    if (!checkAuth()) {
      setError('用户未登录，请先登录');
      return false;
    }
    return true;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunks, { type: mediaRecorderRef.current?.mimeType || 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const id = `rec-${Date.now()}`;
        setRecordings((prev) => [...prev, { id, url, blob }]);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法访问麦克风');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const deleteRecording = (id: string) => {
    setRecordings((prev) => prev.filter((r) => r.id !== id));
  };

  const submitVoiceJob = async () => {
    if (!ensureAuthenticated()) return;
    if (recordings.length === 0) {
      setError('请先录制至少一个音频样本');
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const sampleFiles = await Promise.all(
        recordings.map(async (rec) => {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(rec.blob);
          });
          return {
            filename: `${rec.id}.wav`,
            contentBase64: base64,
            mimeType: detectMimeType(rec.blob),
            size: rec.blob.size,
            durationSec: 4
          };
        })
      );

      const response = await apiFetch('/api/voice/clone', {
        method: 'POST',
        body: JSON.stringify({
          sampleCount: recordings.length,
          sampleFiles
        })
      });

      if (response.status === 404) {
        setError('语音克隆功能暂未部署');
        return;
      }

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      showToast('语音克隆任务已提交', 'success');
      setRecordings([]);
    } catch (err) {
      // 如果是认证错误，则登出用户并重定向到登录页
      if (err instanceof Error && err.message.includes('登录已过期')) {
        logout();
        window.location.href = '/login';
        return;
      }
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="voice-page">
      <div className="hero-panel">
        <p className="eyebrow">VOICE CLONE</p>
        <h1>语音克隆</h1>
        <p className="description">录制音频样本，提交语音克隆任务。</p>
      </div>

      <section className="voice-layout">
        <article className="status-card voice-panel">
          <div className="voice-panel-header">
            <div>
              <span className="badge">RECORD</span>
              <h3>录音</h3>
            </div>
            <div className="recording-status">
              {isRecording ? <span className="recording-indicator">● 录制中</span> : <span>空闲</span>}
            </div>
          </div>

          <div className="recording-controls">
            <button
              className={`record-button ${isRecording ? 'recording' : ''}`}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={loading}
            >
              {isRecording ? '停止录制' : '开始录制'}
            </button>
          </div>

          <div className="recordings-list">
            <h4>已录制的样本 ({recordings.length})</h4>
            {recordings.length ? (
              <div className="recordings-grid">
                {recordings.map((rec) => (
                  <div key={rec.id} className="recording-item">
                    <audio controls src={rec.url} />
                    <button className="delete-button" onClick={() => deleteRecording(rec.id)} disabled={loading}>
                      删除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="recordings-empty">尚未录制任何样本</div>
            )}
          </div>

          <div className="submit-section">
            <button className="primary-button" onClick={submitVoiceJob} disabled={loading || !recordings.length}>
              {loading ? '提交中...' : '提交克隆任务'}
            </button>
            {error ? <p className="error-text">{error}</p> : null}
          </div>
        </article>

        <aside className="status-card voice-side-panel">
          <span className="badge">INFO</span>
          <h3>说明</h3>
          <div className="voice-info">
            <p>语音克隆功能需要后端部署语音克隆服务。</p>
            <p>录制 3-5 个不同内容的音频样本效果更好。</p>
            <p>每个样本建议 3-10 秒。</p>
          </div>
        </aside>
      </section>
    </section>
  );
};