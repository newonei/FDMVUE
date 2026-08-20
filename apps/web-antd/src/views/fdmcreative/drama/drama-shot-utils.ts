import type { FdmCreativeApi } from '#/api/fdmcreative';

export const DRAMA_SHOT_STATUS_META: Record<
  FdmCreativeApi.DramaShotStatus,
  { color: string; label: string }
> = {
  DRAFT: { color: 'default', label: '待制作' },
  GENERATING_IMAGE: { color: 'processing', label: '生成分镜图中' },
  GENERATING_VIDEO: { color: 'processing', label: '生成视频中' },
  IMAGE_READY: { color: 'blue', label: '分镜图已采用' },
  REMOVED: { color: 'default', label: '已移除' },
  STALE: { color: 'orange', label: '需要更新' },
  VIDEO_READY: { color: 'green', label: '视频已采用' },
};

export const DRAMA_SHOT_TASK_STATUS_META: Record<
  FdmCreativeApi.DramaShotTaskStatus,
  { color: string; label: string }
> = {
  CANCELED: { color: 'default', label: '已取消' },
  CANCEL_REQUESTED: { color: 'warning', label: '取消中' },
  CREATED: { color: 'blue', label: '待提交' },
  FAILED: { color: 'error', label: '失败' },
  LAUNCHING: { color: 'processing', label: '提交中' },
  RUNNING: { color: 'processing', label: '生成中' },
  STALE: { color: 'orange', label: '已过期' },
  SUCCEEDED: { color: 'success', label: '已完成' },
};

export function isCancelableDramaShotTask(
  status: FdmCreativeApi.DramaShotTaskStatus,
) {
  return ['CREATED', 'LAUNCHING', 'RUNNING'].includes(status);
}

export function isRetryableDramaShotTask(
  status: FdmCreativeApi.DramaShotTaskStatus,
) {
  return ['CANCELED', 'FAILED', 'STALE'].includes(status);
}

/** P3 returns large ids as strings while P5B task rows use normal numeric ids. */
export function taskResultVersions(
  task: FdmCreativeApi.DramaShotTask | undefined,
  versions: FdmCreativeApi.NodeResultVersion[],
) {
  if (!task?.nodeRunId) return [];
  return versions.filter(
    (version) => String(version.nodeRunId) === String(task.nodeRunId),
  );
}

/** Swap exactly two displayed rows; the server owns CAS and rejects stale versions atomically. */
export function buildSwapSortRequest(
  projectId: number,
  first: FdmCreativeApi.DramaShot,
  second: FdmCreativeApi.DramaShot,
) {
  return {
    projectId,
    items: [
      {
        expectedVersion: first.version,
        shotId: first.id,
        sortOrder: second.sortOrder,
      },
      {
        expectedVersion: second.version,
        shotId: second.id,
        sortOrder: first.sortOrder,
      },
    ],
  };
}

export function shotDisplayName(shot: FdmCreativeApi.DramaShot) {
  return `第 ${shot.sceneNo} 场 · ${String(shot.shotNo).padStart(2, '0')} 镜`;
}
