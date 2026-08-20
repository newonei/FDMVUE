import type { FdmCreativeApi } from '#/api/fdmcreative';

export const DRAMA_TIMELINE_TRACK_META: Record<
  FdmCreativeApi.DramaTimelineTrackType,
  { color: string; label: string }
> = {
  DIALOGUE: { color: '#2563eb', label: '角色对白' },
  MUSIC: { color: '#7c3aed', label: '音乐' },
  NARRATION: { color: '#0891b2', label: '旁白' },
  SOUND_EFFECT: { color: '#ea580c', label: '音效' },
  SUBTITLE: { color: '#475569', label: '字幕' },
  VIDEO: { color: '#16a34a', label: '视频' },
};

export const DRAMA_AUDIO_STATUS_META: Record<
  FdmCreativeApi.DramaAudioTaskStatus,
  { color: string; label: string }
> = {
  CANCELED: { color: 'default', label: '已取消' },
  CANCEL_REQUESTED: { color: 'orange', label: '取消中' },
  CREATED: { color: 'blue', label: '待启动' },
  FAILED: { color: 'error', label: '失败' },
  LAUNCHING: { color: 'processing', label: '启动中' },
  RUNNING: { color: 'processing', label: '生成中' },
  STALE: { color: 'warning', label: '已过期' },
  SUCCEEDED: { color: 'success', label: '可采用' },
};

export const DRAMA_COMPOSITION_STATUS_META: Record<
  FdmCreativeApi.DramaCompositionStatus,
  { color: string; label: string }
> = {
  CANCELED: { color: 'default', label: '已取消' },
  CANCEL_REQUESTED: { color: 'orange', label: '取消中' },
  CREATED: { color: 'blue', label: '待启动' },
  FAILED: { color: 'error', label: '失败' },
  LAUNCHING: { color: 'processing', label: '启动中' },
  RUNNING: { color: 'processing', label: '合成中' },
  SUCCEEDED: { color: 'success', label: '已完成' },
};

export interface TimelineMediaIssue {
  clipId: string;
  expectedKind: 'AUDIO' | 'VIDEO';
  message: string;
  trackType: FdmCreativeApi.DramaTimelineTrackType;
}

export function cloneDramaTimeline(
  timeline: FdmCreativeApi.DramaTimeline,
): FdmCreativeApi.DramaTimeline {
  return JSON.parse(JSON.stringify(timeline)) as FdmCreativeApi.DramaTimeline;
}

export function timelineDurationSeconds(
  timeline?: FdmCreativeApi.DramaTimeline,
) {
  if (!timeline?.fps || timeline.fps <= 0) return 0;
  return timeline.durationFrames / timeline.fps;
}

export function frameToTimecode(frame: number, fps: number) {
  const safeFrame = Math.max(0, Math.round(frame || 0));
  const safeFps = Math.max(1, Math.round(fps || 1));
  const totalSeconds = Math.floor(safeFrame / safeFps);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const remainder = safeFrame % safeFps;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(remainder)}`
    : `${pad(minutes)}:${pad(seconds)}:${pad(remainder)}`;
}

export function clampClipStart(
  clip: FdmCreativeApi.DramaTimelineClip,
  requestedStartFrame: number,
  timelineDurationFrames: number,
) {
  const duration = Math.max(1, Math.round(clip.durationFrames || 1));
  return Math.max(
    0,
    Math.min(
      Math.max(0, timelineDurationFrames - duration),
      Math.round(
        Number.isFinite(requestedStartFrame) ? requestedStartFrame : 0,
      ),
    ),
  );
}

/**
 * A video track is a contiguous programme: a clip move means an explicit reorder followed by a
 * complete frame reflow. It deliberately does not infer timing from DOM position or canvas layout.
 */
export function reorderAndReflowVideoTrack(
  clips: FdmCreativeApi.DramaTimelineClip[],
  movingClipId: string,
  requestedStartFrame: number,
) {
  const ordered = [...clips].toSorted(
    (left, right) =>
      left.startFrame - right.startFrame ||
      left.clipId.localeCompare(right.clipId),
  );
  const movingIndex = ordered.findIndex((clip) => clip.clipId === movingClipId);
  if (movingIndex === -1) return ordered;
  const [moving] = ordered.splice(movingIndex, 1);
  if (!moving) return ordered;
  const insertAt = ordered.findIndex(
    (candidate) =>
      requestedStartFrame <
      candidate.startFrame + Math.max(1, candidate.durationFrames) / 2,
  );
  ordered.splice(insertAt === -1 ? ordered.length : insertAt, 0, moving);

  let previousEnd = 0;
  return ordered.map((clip, index) => {
    const transitionFrames =
      index === 0 ? 0 : Math.max(0, clip.transitionFrames || 0);
    const startFrame =
      index === 0 ? 0 : Math.max(0, previousEnd - transitionFrames);
    previousEnd = startFrame + Math.max(1, clip.durationFrames);
    return {
      ...clip,
      startFrame,
      transition: index === 0 ? 'NONE' : clip.transition || 'NONE',
      transitionFrames,
    };
  });
}

export function getTimelineMediaIssues(
  timeline: FdmCreativeApi.DramaTimeline | undefined,
  assets: FdmCreativeApi.CreativeAsset[],
) {
  if (!timeline) return [];
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const issues: TimelineMediaIssue[] = [];
  for (const track of timeline.tracks) {
    if (track.type === 'SUBTITLE') continue;
    const expectedKind = track.type === 'VIDEO' ? 'VIDEO' : 'AUDIO';
    for (const clip of track.clips) {
      if (!clip.assetId) {
        issues.push({
          clipId: clip.clipId,
          expectedKind,
          message: '尚未采用素材',
          trackType: track.type,
        });
        continue;
      }
      const asset = assetsById.get(clip.assetId);
      if (!asset) {
        issues.push({
          clipId: clip.clipId,
          expectedKind,
          message: `素材 #${clip.assetId} 未出现在当前已加载的项目资产中`,
          trackType: track.type,
        });
      } else if (asset.kind !== expectedKind) {
        issues.push({
          clipId: clip.clipId,
          expectedKind,
          message: `素材 #${clip.assetId} 类型为 ${asset.kind}，需要 ${expectedKind}`,
          trackType: track.type,
        });
      }
    }
  }
  return issues;
}

export function isCancelableDramaPostTask(status: string) {
  return ['CREATED', 'LAUNCHING', 'RUNNING'].includes(status);
}

export function isRetryableDramaAudioTask(status: string) {
  return ['CANCELED', 'FAILED', 'STALE'].includes(status);
}

export function isRetryableDramaComposition(status: string) {
  return status === 'FAILED';
}
