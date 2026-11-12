import type { FdmdataPatternDesignItemApi } from '#/api/fdmdata/pattern/design-item';
import type { UploadTaskRunner } from '#/store/upload-task';

import {
  getFdmdataPatternDesignImageUploadResult,
  uploadFdmdataPatternDesignItemDesignImage,
} from '#/api/fdmdata/pattern/design-item';

const RECOVERY_TIMEOUT = 2 * 60 * 1000;
const RECOVERY_INTERVAL = 3000;

function newUploadId() {
  // getRandomValues 在内网 HTTP 页面也可用，randomUUID 则要求安全上下文。
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
}

function httpStatus(error: unknown): number | undefined {
  const record = error as { httpStatus?: number; response?: { status?: number } };
  return record?.httpStatus ?? record?.response?.status;
}

function canRecover(error: unknown) {
  const status = httpStatus(error);
  if (status) return [408, 500, 502, 503, 504, 520, 522, 524].includes(status);
  const record = error as { code?: string; message?: string };
  return (
    ['ECONNABORTED', 'ERR_NETWORK', 'ETIMEDOUT'].includes(record?.code ?? '') ||
    /Network Error|timeout/i.test(record?.message ?? '')
  );
}

function waitForNextCheck(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, RECOVERY_INTERVAL);
    signal.addEventListener('abort', abort, { once: true });
  });
}

interface UploadAttempt {
  error?: unknown;
  file: File;
  id: string;
  unresolved: boolean;
}

/** 每个任务拥有独立编号；重试先找回上次结果，替换文件则创建新任务。 */
export function createUploadDesignImageTask(): UploadTaskRunner<FdmdataPatternDesignItemApi.UploadResp> {
  let attempt: undefined | UploadAttempt;

  async function recover(
    current: UploadAttempt,
    signal: AbortSignal,
    manualRetry = false,
    onWaiting?: () => void,
  ): Promise<FdmdataPatternDesignItemApi.UploadResp | undefined> {
    const deadline = Date.now() + RECOVERY_TIMEOUT;
    let firstCheck = true;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      let state: FdmdataPatternDesignItemApi.UploadState | null;
      try {
        state = await getFdmdataPatternDesignImageUploadResult(current.id, signal);
      } catch (error) {
        signal.throwIfAborted();
        // 旧后端没有恢复接口，兼容分步部署；保留原始上传错误。
        if (httpStatus(error) === 404) {
          if (manualRetry) return undefined;
          throw current.error ?? error;
        }
        if (!canRecover(error)) throw error;
        firstCheck = false;
        onWaiting?.();
        await waitForNextCheck(signal);
        continue;
      }
      signal.throwIfAborted();
      if (state?.status === 'SUCCESS' && state.result?.designImageUrl) {
        current.unresolved = false;
        return state.result;
      }
      if (state?.status === 'FAILED') {
        current.unresolved = false;
        if (manualRetry && firstCheck) return undefined;
        throw new Error(state.message || '服务器处理图片失败，请重试');
      }
      // 自动恢复时未找到并不等于失败：请求体可能仍在网关或后端解析。
      // 人工重试确认无记录时，才允许发送一次新的请求。
      if (!state && manualRetry && firstCheck) return undefined;
      firstCheck = false;
      onWaiting?.();
      await waitForNextCheck(signal);
    }
    const status = httpStatus(current.error);
    throw new Error(
      `暂未确认服务器上传结果${status ? `（HTTP ${status}）` : ''}，请稍后点击重试，系统会先查询已上传结果`,
      { cause: current.error },
    );
  }

  return async (file, { onProcessing, onProgress, signal }) => {
    signal.throwIfAborted();
    if (attempt?.file === file && attempt.unresolved) {
      const result = await recover(attempt, signal, true, () =>
        onProcessing?.('正在确认服务器上传结果'),
      );
      if (result) return result;
    }
    signal.throwIfAborted();
    const current: UploadAttempt = {
      file,
      id: newUploadId(),
      unresolved: true,
    };
    attempt = current;
    try {
      const result = await uploadFdmdataPatternDesignItemDesignImage(
        file,
        (event) => onProgress(event.loaded, event.total),
        { signal, silent: true, uploadId: current.id },
      );
      signal.throwIfAborted();
      current.unresolved = false;
      return result;
    } catch (error) {
      // 取消仅停止前端等待；后端可能已存好文件，重试仍先查询原编号。
      signal.throwIfAborted();
      current.error = error;
      if (!canRecover(error)) {
        current.unresolved = false;
        throw error;
      }
      onProcessing?.('正在确认服务器上传结果');
      return (await recover(current, signal))!;
    }
  };
}
