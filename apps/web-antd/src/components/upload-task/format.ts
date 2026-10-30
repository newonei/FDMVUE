import type { UploadTask } from '#/store/upload-task';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const digits = unitIndex >= 2 && value < 100 ? 1 : 0;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unitIndex]}`;
}

export function formatSpeed(bytesPerSecond: number) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分${seconds % 60}秒`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分`;
}

/** 任务状态说明，now 用于计算处理耗时 */
export function describeUploadTask(task: UploadTask, now: number) {
  switch (task.status) {
    case 'canceled': {
      return '已取消';
    }
    case 'error': {
      return task.error || '上传失败';
    }
    case 'processing': {
      const waited = (now - (task.processingAt ?? now)) / 1000;
      return `服务器处理中（转存、生成预览）· 已等待 ${formatDuration(waited)}`;
    }
    case 'queued': {
      return '排队中';
    }
    case 'success': {
      const cost = ((task.finishedAt ?? now) - (task.startedAt ?? now)) / 1000;
      return `已完成 · 用时 ${formatDuration(cost)}`;
    }
    case 'uploading': {
      const percent = Math.floor(task.progress * 100);
      if (task.speed <= 0) return `${percent}% · 正在连接…`;
      const remaining = (task.size * (1 - task.progress)) / task.speed;
      return `${percent}% · ${formatSpeed(task.speed)} · 剩余约 ${formatDuration(remaining)}`;
    }
  }
}
