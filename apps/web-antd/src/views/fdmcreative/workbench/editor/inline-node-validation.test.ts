import { describe, expect, it } from 'vitest';

import {
  inlineNodeConfigValidationError,
  MAX_VIDEO_NORMALIZE_PIXEL_RATE,
  MAX_VIDEO_NORMALIZE_PIXELS,
} from './inline-node-validation';

describe('inline node config validation', () => {
  it('blocks an empty static prompt', () => {
    expect(inlineNodeConfigValidationError('prompt-input', {})).toBe(
      '请填写提示词文本',
    );
    expect(
      inlineNodeConfigValidationError('prompt-input', { prompt: '   ' }),
    ).toBe('请填写提示词文本');
    expect(
      inlineNodeConfigValidationError('prompt-input', { prompt: '产品特写' }),
    ).toBeUndefined();
  });

  it('uses runnable defaults when video normalization config is absent', () => {
    expect(
      inlineNodeConfigValidationError('video-normalize', {}),
    ).toBeUndefined();
  });

  it('requires even integer video dimensions', () => {
    expect(
      inlineNodeConfigValidationError('video-normalize', {
        fps: 30,
        height: 720,
        width: 1279,
      }),
    ).toContain('偶整数');
    expect(
      inlineNodeConfigValidationError('video-normalize', {
        fps: 30,
        height: 720.5,
        width: 1280,
      }),
    ).toContain('偶整数');
  });

  it('enforces frame and per-second pixel budgets', () => {
    expect(
      inlineNodeConfigValidationError('video-normalize', {
        fps: 30,
        height: 2160,
        width: 4096,
      }),
    ).toBeUndefined();
    expect(
      inlineNodeConfigValidationError('video-normalize', {
        fps: 30,
        height: 2160,
        width: 4098,
      }),
    ).toBe(
      `视频画面像素不能超过 ${MAX_VIDEO_NORMALIZE_PIXELS.toLocaleString('en-US')}`,
    );
    expect(
      inlineNodeConfigValidationError('video-normalize', {
        fps: 60,
        height: 2160,
        width: 3840,
      }),
    ).toBe(
      `视频每秒像素量不能超过 ${MAX_VIDEO_NORMALIZE_PIXEL_RATE.toLocaleString('en-US')}`,
    );
  });

  it('validates normalized crop coordinates and bounded image splitting', () => {
    expect(
      inlineNodeConfigValidationError('image-crop', {
        coordinateMode: 'NORMALIZED',
        cropHeight: 0.6,
        cropWidth: 0.5,
        cropX: 0.2,
        cropY: 0.1,
      }),
    ).toBeUndefined();
    expect(
      inlineNodeConfigValidationError('image-crop', {
        cropHeight: 1,
        cropWidth: 0.3,
        cropX: 0.8,
        cropY: 0,
      }),
    ).toContain('归一化边界');
    expect(
      inlineNodeConfigValidationError('image-crop', {
        coordinateMode: 'PIXEL',
      }),
    ).toContain('归一化坐标');
    expect(
      inlineNodeConfigValidationError('image-split', { columns: 8, rows: 8 }),
    ).toBeUndefined();
    expect(
      inlineNodeConfigValidationError('image-split', { columns: 9, rows: 1 }),
    ).toContain('不能超过 64');
  });
});
