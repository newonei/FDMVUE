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
  if (['image-loop', 'video-loop'].includes(nodeType)) {
    const count = config.count ?? 4;
    const startIndex = config.startIndex ?? 1;
    const batchSize = config.batchSize ?? 1;
    if (
      typeof count !== 'number' ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 20
    ) {
      return '循环次数必须是 1 到 20 之间的整数';
    }
    if (
      typeof startIndex !== 'number' ||
      !Number.isInteger(startIndex) ||
      startIndex < 1
    ) {
      return '循环起始序号必须是正整数';
    }
    if (
      typeof batchSize !== 'number' ||
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > 20
    ) {
      return '每轮素材数必须是 1 到 20 之间的整数';
    }
  }
  if (
    ['image-select', 'video-select'].includes(nodeType) &&
    config.mode === 'INDEX' &&
    (typeof config.index !== 'number' ||
      !Number.isInteger(config.index) ||
      config.index < 1)
  ) {
    return '素材选择序号必须是正整数';
  }
  if (nodeType === 'image-crop') {
    const values = [
      ['cropX', config.cropX ?? 0],
      ['cropY', config.cropY ?? 0],
      ['cropWidth', config.cropWidth ?? 1],
      ['cropHeight', config.cropHeight ?? 1],
    ] as const;
    const invalid = values.some(
      ([, value]) => typeof value !== 'number' || !Number.isFinite(value),
    );
    if (invalid) return '裁剪坐标必须是有限数字';
    const cropX = values[0][1] as number;
    const cropY = values[1][1] as number;
    const cropWidth = values[2][1] as number;
    const cropHeight = values[3][1] as number;
    if (
      cropX < 0 ||
      cropY < 0 ||
      cropWidth <= 0 ||
      cropHeight <= 0 ||
      cropX + cropWidth > 1 ||
      cropY + cropHeight > 1
    ) {
      return '裁剪矩形必须在原图的归一化边界内';
    }
    if (
      config.coordinateMode !== undefined &&
      String(config.coordinateMode).toUpperCase() !== 'NORMALIZED'
    ) {
      return '图片裁剪仅支持归一化坐标';
    }
  }
  if (nodeType === 'image-split') {
    const columns = config.columns ?? 2;
    const rows = config.rows ?? 2;
    if (
      typeof columns !== 'number' ||
      typeof rows !== 'number' ||
      !Number.isInteger(columns) ||
      !Number.isInteger(rows) ||
      columns < 1 ||
      rows < 1 ||
      columns > 8 ||
      rows > 8 ||
      columns * rows > 64
    ) {
      return '图片分割行列必须是 1 到 8 的整数，输出总数不能超过 64';
    }
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
