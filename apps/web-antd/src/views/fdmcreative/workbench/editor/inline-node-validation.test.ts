import { describe, expect, it } from 'vitest';

import {
  inlineNodeConfigValidationError,
  MAX_VIDEO_NORMALIZE_PIXELS,
  MAX_VIDEO_NORMALIZE_PIXEL_RATE,
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
});
