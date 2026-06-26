import type { AxiosProgressEvent } from '#/api/infra/file';

import { message } from 'ant-design-vue';

import { useUpload } from '#/components/upload/use-upload';

export interface UploadSuccessPayload {
  previewUrl?: string;
  response?: unknown;
  url?: string;
}

export interface PatternDesignImageUrls {
  designImageUrl: string;
  previewImageUrl?: string;
}

export const SOURCE_IMAGE_MAX_SIZE_MB = 256;

const PREVIEW_IMAGE_MAX_SIDE = 720;
const PREVIEW_IMAGE_QUALITY = 0.76;

export function extractUploadUrl(res: unknown): string {
  if (typeof res === 'string') return res;
  if (!res || typeof res !== 'object') return '';
  const record = res as Record<string, any>;
  if (typeof record.url === 'string') return record.url;
  if (typeof record.data === 'string') return record.data;
  if (record.data && typeof record.data === 'object') {
    return typeof record.data.url === 'string' ? record.data.url : '';
  }
  return '';
}

export function extractUploadPreviewUrl(res: unknown): string {
  if (!res || typeof res !== 'object') return '';
  const record = res as Record<string, any>;
  if (typeof record.previewUrl === 'string') return record.previewUrl;
  if (record.data && typeof record.data === 'object') {
    return typeof record.data.previewUrl === 'string'
      ? record.data.previewUrl
      : '';
  }
  return '';
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('图片生成失败'));
      },
      type,
      quality,
    );
  });
}

async function buildResizedImageFile(
  file: File,
  maxSide: number,
  quality: number,
  suffixName: string,
) {
  if (!file.type.startsWith('image/')) return undefined;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('图片生成失败');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    const basename = file.name.replace(/\.[^.]+$/, '') || 'design-image';
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new File([blob], `${basename}-${suffix}-${suffixName}.jpg`, {
      lastModified: Date.now(),
      type: 'image/jpeg',
    });
  } finally {
    bitmap.close();
  }
}

export function extractPatternDesignImageUrls(
  payload: unknown | UploadSuccessPayload,
): PatternDesignImageUrls {
  const record = (payload ?? {}) as UploadSuccessPayload;
  const response = record.response;
  return {
    designImageUrl: extractUploadUrl(payload) || extractUploadUrl(response),
    previewImageUrl:
      extractUploadPreviewUrl(payload) || extractUploadPreviewUrl(response),
  };
}

export function usePatternDesignImageUpload() {
  const { httpRequest: uploadDesignImage } = useUpload(
    'fdmdata/pattern/design-item',
  );
  const { httpRequest: uploadDesignPreviewImage } = useUpload(
    'fdmdata/pattern/design-item/preview',
  );

  async function uploadDesignImageWithPreview(
    file: File,
    onUploadProgress?: AxiosProgressEvent,
  ) {
    const originalRes = await uploadDesignImage(file, onUploadProgress);
    const designUrl = extractUploadUrl(originalRes);
    let previewUrl = extractUploadPreviewUrl(originalRes);

    if (designUrl && !previewUrl) {
      try {
        const previewFile = await buildResizedImageFile(
          file,
          PREVIEW_IMAGE_MAX_SIDE,
          PREVIEW_IMAGE_QUALITY,
          'preview',
        );
        if (previewFile) {
          previewUrl = extractUploadUrl(
            await uploadDesignPreviewImage(previewFile),
          );
        }
      } catch (error) {
        console.error('Create pattern design preview image failed', error);
        message.warning('预览图生成失败，请重新上传或检查图片格式');
      }
    }

    return {
      previewUrl,
      response: originalRes,
      url: designUrl,
    };
  }

  return { uploadDesignImageWithPreview };
}
