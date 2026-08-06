const DEFAULT_VIDEO_NORMALIZE_WIDTH = 1280;
const DEFAULT_VIDEO_NORMALIZE_HEIGHT = 720;
const DEFAULT_VIDEO_NORMALIZE_FPS = 30;

export const MAX_VIDEO_NORMALIZE_PIXELS = 8_847_360;
export const MAX_VIDEO_NORMALIZE_PIXEL_RATE = 265_420_800;

function configuredNumber(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const value = config[key];
  return value === undefined || value === null ? fallback : value;
}

function isValidVideoDimension(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 16 &&
    value <= 8192 &&
    value % 2 === 0
  );
}

export function inlineNodeConfigValidationError(
  nodeType: string,
  config: Record<string, unknown>,
): string | undefined {
  if (
    nodeType === 'prompt-input' &&
    (typeof config.prompt !== 'string' || !config.prompt.trim())
  ) {
    return '请填写提示词文本';
  }
  if (nodeType !== 'video-normalize') return undefined;

  const width = configuredNumber(
    config,
    'width',
    DEFAULT_VIDEO_NORMALIZE_WIDTH,
  );
  const height = configuredNumber(
    config,
    'height',
    DEFAULT_VIDEO_NORMALIZE_HEIGHT,
  );
  const fps = configuredNumber(config, 'fps', DEFAULT_VIDEO_NORMALIZE_FPS);
  if (!isValidVideoDimension(width) || !isValidVideoDimension(height)) {
    return '视频宽高必须是 16 到 8192 之间的偶整数';
  }
  const pixels = width * height;
  if (pixels > MAX_VIDEO_NORMALIZE_PIXELS) {
    return `视频画面像素不能超过 ${MAX_VIDEO_NORMALIZE_PIXELS.toLocaleString('en-US')}`;
  }
  if (
    typeof fps !== 'number' ||
    !Number.isFinite(fps) ||
    fps < 1 ||
    fps > 120
  ) {
    return '视频帧率必须是 1 到 120 之间的数字';
  }
  if (pixels * fps > MAX_VIDEO_NORMALIZE_PIXEL_RATE) {
    return `视频每秒像素量不能超过 ${MAX_VIDEO_NORMALIZE_PIXEL_RATE.toLocaleString('en-US')}`;
  }
  return undefined;
}
