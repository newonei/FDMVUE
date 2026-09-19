import type { FdmAiApi } from '#/api/fdmai';

const GROK_VIDEO_15_MODELS = new Set([
  'grok-imagine-video-1.5',
  'grok-imagine-video-1.5-preview',
  'grok-imagine-video-1.5-2026-05-30',
]);

export function modelTestReferenceUrls(
  capability: FdmAiApi.Capability,
  references: string,
  lastFrame: string,
) {
  const urls = references.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
  const tail = lastFrame.trim();
  if (capability === 'TEXT_TO_VIDEO' || capability === 'TEXT_TO_IMAGE') return [];
  if (capability === 'FIRST_LAST_FRAME_TO_VIDEO') {
    if (urls.length !== 1 || !tail) throw new Error('首尾帧生视频需要分别填写一张首帧和一张尾帧图片');
    return [urls[0]!, tail];
  }
  if (capability === 'FIRST_FRAME_TO_VIDEO') {
    if (urls.length !== 1) throw new Error('首帧生视频需要填写一张首帧图片');
    return [urls[0]!];
  }
  if (['IMAGE_EDIT', 'IMAGE_TO_IMAGE'].includes(capability) && !urls.length) {
    throw new Error('图片编辑或参考图生图需要填写参考图片');
  }
  if (capability === 'MULTI_REFERENCE' && urls.length < 2) {
    throw new Error('多参考图生成至少需要两张参考图片，每行填写一个 URL');
  }
  return urls;
}

export function modelTestVideoParameters(
  parameters: Record<string, unknown>,
  fields: {
    aspectRatio?: string;
    duration?: null | number;
    resolution?: string;
  },
  grok = false,
) {
  const result = { ...parameters };
  if (grok) {
    if (fields.duration != null) delete result.durationSeconds;
    if (fields.aspectRatio) delete result.aspect_ratio;
    if (fields.resolution) delete result.quality;
  }
  return {
    ...result,
    ...(fields.duration == null ? {} : { duration: fields.duration }),
    ...(fields.aspectRatio ? { aspectRatio: fields.aspectRatio } : {}),
    ...(fields.resolution ? { resolution: fields.resolution } : {}),
  };
}

export function modelTestVideoResolutions(
  grok: boolean,
  upstreamModels: string[],
  capability?: FdmAiApi.Capability,
) {
  const supports1080 = !grok || (
    capability !== 'FIRST_LAST_FRAME_TO_VIDEO' &&
    upstreamModels.length > 0 &&
    upstreamModels.every((model) => GROK_VIDEO_15_MODELS.has(model.trim().toLowerCase().split('/').at(-1) || ''))
  );
  return supports1080 ? ['480p', '720p', '1080p'] : ['480p', '720p'];
}
