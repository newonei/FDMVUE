/** 超过这个大小的图片不在浏览器里解码，避免一次选几十个大图时内存暴涨 */
const LOCAL_THUMBNAIL_MAX_SOURCE_BYTES = 50 * 1024 * 1024;

let renderQueue: Promise<unknown> = Promise.resolve();

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  );
}

async function renderThumbnail(file: File, maxSide: number) {
  if (file.type === 'image/svg+xml') return URL.createObjectURL(file);
  if (typeof createImageBitmap !== 'function') return undefined;
  const bitmap = await createImageBitmap(file, {
    resizeQuality: 'medium',
    resizeWidth: maxSide,
  });
  try {
    const scale = Math.min(1, maxSide / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    // 透明 PNG 转 JPEG 时默认是黑底
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas);
    return blob ? URL.createObjectURL(blob) : undefined;
  } finally {
    bitmap.close();
  }
}

/**
 * 在上传完成前先用本地文件生成小缩略图（object URL），方便边上传边核对文件。
 * 逐个解码；用完需调用 URL.revokeObjectURL 释放。
 */
export function createLocalThumbnail(file: File, maxSide = 160) {
  if (
    !file.type.startsWith('image/') ||
    file.size > LOCAL_THUMBNAIL_MAX_SOURCE_BYTES
  ) {
    return Promise.resolve(undefined);
  }
  const task = renderQueue
    .then(() => renderThumbnail(file, maxSide))
    .catch(() => undefined);
  renderQueue = task;
  return task;
}
