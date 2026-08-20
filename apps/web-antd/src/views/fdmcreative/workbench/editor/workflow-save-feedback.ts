import type { WorkflowAutosaveStatus } from './use-workflow-autosave';

export interface WorkflowSaveBlockedFeedback {
  level: 'error' | 'warning';
  message: string;
}

/**
 * Turns the autosave state that blocks an action into a concrete next step.
 * Publishing normally saves first, so a generic “handle save state” warning
 * leaves users without knowing whether they should wait, reconnect, retry, or
 * resolve a conflict.
 */
export function workflowSaveBlockedFeedback(
  status: WorkflowAutosaveStatus,
  action: string,
  error?: unknown,
): WorkflowSaveBlockedFeedback | undefined {
  switch (status) {
    case 'CONFLICT': {
      // The conflict modal already explains the two safe choices and must not
      // compete with a second toast.
      return undefined;
    }
    case 'ERROR': {
      const errorCode = readWorkflowErrorCode(error);
      if (errorCode === WORKFLOW_INVALID) {
        if (readWorkflowErrorMessage(error) === HASH_MISMATCH_MESSAGE) {
          return {
            level: 'error',
            message:
              `画布自动保存失败：当前页面的画布格式与服务端不兼容，暂时无法${action}。` +
              '请刷新页面以加载最新版本后重试。',
          };
        }
        return {
          level: 'error',
          message: `画布自动保存失败：画布定义无效，暂时无法${action}。请检查节点和连线后重试。`,
        };
      }
      return {
        level: 'error',
        message: `画布自动保存失败，暂时无法${action}。请点击“保存草稿”重试。`,
      };
    }
    case 'OFFLINE': {
      return {
        level: 'warning',
        message: `当前网络不可用，画布自动保存未完成，暂时无法${action}。请恢复网络后重试。`,
      };
    }
    case 'RETRYING': {
      return {
        level: 'warning',
        message: `画布正在重试保存，请稍候再${action}。`,
      };
    }
    case 'SAVING': {
      return {
        level: 'warning',
        message: `画布正在保存，请稍候再${action}。`,
      };
    }
    case 'DIRTY': {
      return {
        level: 'warning',
        message: `画布正在自动保存，请稍候再${action}。`,
      };
    }
    default: {
      return {
        level: 'warning',
        message: `画布尚未完成保存，暂时无法${action}。请点击“保存草稿”后重试。`,
      };
    }
  }
}

const HASH_MISMATCH_MESSAGE =
  '画布定义无效：definitionHash 与规范化后的画布定义不一致';
const WORKFLOW_INVALID = 1_013_000_010;

function readWorkflowErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    code?: unknown;
    data?: { code?: unknown };
    response?: { data?: { code?: unknown } };
  };
  for (const raw of [
    candidate.code,
    candidate.data?.code,
    candidate.response?.data?.code,
  ]) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function readWorkflowErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    data?: { message?: unknown; msg?: unknown };
    message?: unknown;
    msg?: unknown;
    response?: { data?: { message?: unknown; msg?: unknown } };
  };
  const value =
    candidate.msg ??
    candidate.data?.msg ??
    candidate.data?.message ??
    candidate.response?.data?.msg ??
    candidate.response?.data?.message ??
    candidate.message;
  return typeof value === 'string' ? value : undefined;
}
