import { useEffect, useState, useContext } from "react";
import { AuthContext } from "../main";
import { apiFetch, parseApiError } from "../utils/auth";
import { logger } from "../utils/logger";
import "./CreatePersonaModal.css";

interface CreatePersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ModelOption {
  id?: string;
  key?: string;
  code?: string;
  name: string;
  path: string;
  available?: boolean;
  isSystem?: boolean;
  isActive?: boolean;
  category?: "builtin" | "custom";
}

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error ? error.message : fallback;
};

export const CreatePersonaModal = ({ isOpen, onClose, onSuccess }: CreatePersonaModalProps) => {
  const { logout } = useContext(AuthContext)!;
  const [isCreating, setIsCreating] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [showToast, setShowToast] = useState<{ message: string; type: "success" | "error" } | null>(
    null
  );

  const [formData, setFormData] = useState({
    name: "",
    subtitle: "",
    description: "",
    speakingStyle: "",
    systemPrompt: "",
    modelKey: "",
    modelPath: "",
    aiModel: "default",
    voiceId: "zh-CN-XiaoxiaoNeural",
  });

  const [aiModels, setAiModels] = useState<{ id: string; name: string; provider?: string }[]>([]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoadingModels(true);
      try {
        // 加载 Live2D 模型列表（新接口）
        const res = await apiFetch("/api/models/installed");
        const data = await res.json();
        if (!cancelled) {
          setModels(data.models || []);
        }
      } catch (error) {
        logger.error("加载模型列表失败:", error);
        // 如果是认证错误，则登出用户并重定向到登录页
        if (error instanceof Error && error.message.includes('登录已过期')) {
          logout();
          window.location.href = '/login';
        }
      } finally {
        if (!cancelled) {
          setLoadingModels(false);
        }
      }

      // 加载 AI 语言模型列表
      try {
        const res = await apiFetch("/api/ai-models");
        const data = await res.json();
        if (!cancelled) {
          setAiModels(data.models || []);
        }
      } catch (error) {
        logger.error("加载AI模型列表失败:", error);
        // 如果是认证错误，则登出用户并重定向到登录页
        if (error instanceof Error && error.message.includes('登录已过期')) {
          logout();
          window.location.href = '/login';
        }
      }
    };

    setTimeout(() => {
      void run();
    }, 0);

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setShowToast({ message: "请输入角色名称", type: "error" });
      return;
    }
    if (!formData.systemPrompt.trim()) {
      setShowToast({ message: "请输入系统提示词", type: "error" });
      return;
    }
    if (!formData.modelKey) {
      setShowToast({ message: "请选择模型", type: "error" });
      return;
    }

    setIsCreating(true);
    try {
      const res = await apiFetch("/api/personas", {
        method: "POST",
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      setShowToast({ message: "角色创建成功", type: "success" });
      onSuccess();
      handleClose();
    } catch (error: unknown) {
      // 如果是认证错误，则登出用户并重定向到登录页
      if (error instanceof Error && error.message.includes('登录已过期')) {
        logout();
        window.location.href = '/login';
        return;
      }
      setShowToast({ message: getErrorMessage(error, "创建失败"), type: "error" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
      setFormData({
        name: "",
        subtitle: "",
        description: "",
        speakingStyle: "",
        systemPrompt: "",
        modelKey: "",
        modelPath: "",
        aiModel: "default",
        voiceId: "zh-CN-XiaoxiaoNeural",
      });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>新增角色</h2>
          <button className="close-button" onClick={handleClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>
              角色名称 <span className="required">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="输入角色名称"
              required
            />
          </div>

          <div className="form-group">
            <label>一句话定位</label>
            <input
              type="text"
              value={formData.subtitle}
              onChange={(e) => setFormData((prev) => ({ ...prev, subtitle: e.target.value }))}
              placeholder="简短描述角色的定位"
            />
          </div>

          <div className="form-group">
            <label>性格描述</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="详细描述角色的性格特点"
              rows={4}
            />
          </div>

          <div className="form-group">
            <label>说话风格</label>
            <textarea
              value={formData.speakingStyle}
              onChange={(e) => setFormData((prev) => ({ ...prev, speakingStyle: e.target.value }))}
              placeholder="描述角色的说话方式和特点"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>
              系统提示词 <span className="required">*</span>
            </label>
            <textarea
              value={formData.systemPrompt}
              onChange={(e) => setFormData((prev) => ({ ...prev, systemPrompt: e.target.value }))}
              placeholder="输入角色的系统提示词"
              rows={8}
              maxLength={4000}
              required
            />
            <div className="char-count">{formData.systemPrompt.length}/4000</div>
          </div>

          <div className="form-group">
            <label>
              Live2D 形象 <span className="required">*</span>
            </label>
            {loadingModels ? (
              <select disabled>
                <option>加载中...</option>
              </select>
            ) : (
              <>
                <select
                  value={formData.modelKey}
                  onChange={(e) => {
                    const selected = models.find((m) => (m.code || m.key || m.id) === e.target.value);
                    setFormData((prev) => ({
                      ...prev,
                      modelKey: e.target.value,
                      modelPath: selected?.path || "",
                    }));
                  }}
                  required
                >
                  <option value="">选择形象...</option>
                  {models
                    .filter((m) => m.available !== false)
                    .map((m) => (
                      <option key={m.code || m.key || m.id} value={m.code || m.key || m.id}>
                        {m.isSystem ? "【系统】" : "【自定义】"} {m.name} ({m.id || m.key})
                      </option>
                    ))}
                </select>
                {models.filter((m) => m.available !== false).length === 0 && (
                  <div className="warning">没有可用形象，请先上传 Live2D 模型</div>
                )}
              </>
            )}
          </div>

          <div className="form-group">
            <label>AI 推理引擎</label>
            <select
              value={formData.aiModel}
              onChange={(e) => setFormData((prev) => ({ ...prev, aiModel: e.target.value }))}
            >
              <option value="default">默认模型</option>
              {aiModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="modal-footer">
            <button type="button" className="cancel-button" onClick={handleClose}>
              取消
            </button>
            <button type="submit" className="submit-button" disabled={isCreating}>
              {isCreating ? "创建中..." : "创建角色"}
            </button>
          </div>
        </form>

        {showToast && <div className={`toast ${showToast.type}`}>{showToast.message}</div>}
      </div>
    </div>
  );
};