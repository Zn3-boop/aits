/**
 * TTS 错误处理工具
 * 统一处理 TTS 相关的错误场景
 */

export interface TtsError {
  code: string;
  message: string;
  userMessage: string;
}

type ErrorLike = {
  code?: string;
  name?: string;
  message?: string;
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
};

const toErrorLike = (err: unknown): ErrorLike => {
  if (err && typeof err === 'object') {
    return err as ErrorLike;
  }
  return {};
};

/**
 * 处理 TTS 错误
 * @param err 错误对象
 * @returns 标准化的错误信息
 */
export function handleTtsError(err: unknown): TtsError {
  if (!err) {
    return {
      code: 'UNKNOWN_ERROR',
      message: '未知错误',
      userMessage: '语音生成失败，请稍后再试'
    };
  }

  const error = toErrorLike(err);

  // 网络错误
  if (error.code === 'NETWORK_ERROR' || error.name === 'NetworkError') {
    return {
      code: 'NETWORK_ERROR',
      message: error.message || '网络错误',
      userMessage: '网络错误，请检查连接'
    };
  }

  // 超时错误
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return {
      code: 'TIMEOUT',
      message: error.message || '请求超时',
      userMessage: '语音合成超时，文本可能过长'
    };
  }

  // HTTP 错误
  if (error.response) {
    const status = error.response.status;

    switch (status) {
      case 400:
        return {
          code: 'BAD_REQUEST',
          message: '请求参数错误',
          userMessage: '请求参数错误'
        };
      case 401:
        return {
          code: 'UNAUTHORIZED',
          message: '未授权',
          userMessage: '请先登录'
        };
      case 403:
        return {
          code: 'FORBIDDEN',
          message: '无权限',
          userMessage: '无权限访问'
        };
      case 404:
        return {
          code: 'NOT_FOUND',
          message: '资源不存在',
          userMessage: '语音服务不可用'
        };
      case 503:
        return {
          code: 'SERVICE_UNAVAILABLE',
          message: '服务不可用',
          userMessage: '语音服务暂时不可用'
        };
      case 504:
        return {
          code: 'GATEWAY_TIMEOUT',
          message: '网关超时',
          userMessage: '语音合成超时，文本可能过长'
        };
      default:
        return {
          code: `HTTP_ERROR_${status}`,
          message: error.response.data?.message || '服务器错误',
          userMessage: '语音生成失败，请稍后再试'
        };
    }
  }

  // 其他错误
  return {
    code: 'UNKNOWN_ERROR',
    message: error.message || '未知错误',
    userMessage: '语音生成失败，请稍后再试'
  };
}

/**
 * 根据错误代码显示 Toast 提示
 * @param err 错误对象
 * @param showToast Toast 显示函数
 */
export function showTtsErrorToast(err: unknown, showToast: (message: string, type: 'error' | 'warning' | 'info') => void): void {
  const error = handleTtsError(err);

  switch (error.code) {
    case 'TIMEOUT':
    case 'GATEWAY_TIMEOUT':
      showToast(error.userMessage, 'warning');
      break;
    case 'NETWORK_ERROR':
      showToast(error.userMessage, 'error');
      break;
    case 'SERVICE_UNAVAILABLE':
      showToast(error.userMessage, 'error');
      break;
    default:
      showToast(error.userMessage, 'error');
  }
}
