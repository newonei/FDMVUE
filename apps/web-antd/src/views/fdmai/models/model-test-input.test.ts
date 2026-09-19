import { describe, expect, it } from 'vitest';

import { modelTestReferenceUrls, modelTestVideoParameters, modelTestVideoResolutions } from './model-test-input';

describe('model test media inputs', () => {
  it('sends first and last frames in the documented order', () => {
    expect(modelTestReferenceUrls('FIRST_LAST_FRAME_TO_VIDEO', ' https://img.test/first.png ', ' https://img.test/last.png '))
      .toEqual(['https://img.test/first.png', 'https://img.test/last.png']);
  });

  it('does not leak hidden frame inputs after changing to text-to-video', () => {
    expect(modelTestReferenceUrls('TEXT_TO_VIDEO', 'https://img.test/first.png', 'https://img.test/last.png')).toEqual([]);
    expect(modelTestReferenceUrls('FIRST_FRAME_TO_VIDEO', 'https://img.test/first.png', 'https://img.test/last.png'))
      .toEqual(['https://img.test/first.png']);
  });

  it('rejects missing or ambiguous video frame inputs before submitting a paid request', () => {
    expect(() => modelTestReferenceUrls('FIRST_FRAME_TO_VIDEO', '', '')).toThrow('首帧');
    expect(() => modelTestReferenceUrls('FIRST_LAST_FRAME_TO_VIDEO', 'https://img.test/first.png', '')).toThrow('尾帧');
    expect(() => modelTestReferenceUrls('FIRST_FRAME_TO_VIDEO', 'https://img.test/1.png\nhttps://img.test/2.png', '')).toThrow('一张');
  });

  it('accepts multiple image references without dropping any URL', () => {
    expect(modelTestReferenceUrls('MULTI_REFERENCE', ' https://img.test/1.png\n\nhttps://img.test/2.png ', ''))
      .toEqual(['https://img.test/1.png', 'https://img.test/2.png']);
    expect(() => modelTestReferenceUrls('MULTI_REFERENCE', 'https://img.test/1.png', '')).toThrow('至少需要两张');
  });

  it('requires an image for editing while keeping optional chat images', () => {
    expect(() => modelTestReferenceUrls('IMAGE_EDIT', '', '')).toThrow('参考图片');
    expect(() => modelTestReferenceUrls('IMAGE_TO_IMAGE', '', '')).toThrow('参考图片');
    expect(modelTestReferenceUrls('CHAT', '', '')).toEqual([]);
    expect(modelTestReferenceUrls('CHAT', 'https://img.test/1.png', '')).toEqual(['https://img.test/1.png']);
  });

  it('keeps advanced parameters unless visible video fields explicitly override them', () => {
    const advanced = { seed: 5, duration: 8, resolution: '480p' };
    expect(modelTestVideoParameters(advanced, { duration: null })).toEqual(advanced);
    expect(modelTestVideoParameters(advanced, { duration: 6, aspectRatio: '16:9', resolution: '720p' }))
      .toEqual({ seed: 5, duration: 6, aspectRatio: '16:9', resolution: '720p' });
    expect(advanced).toEqual({ seed: 5, duration: 8, resolution: '480p' });
  });

  it('clears conflicting Grok parameter aliases when visible fields override JSON', () => {
    const parameters = { durationSeconds: 12, aspect_ratio: '9:16', quality: '1080p', seed: 1 };
    expect(modelTestVideoParameters(parameters, { duration: 6, aspectRatio: '16:9', resolution: '720p' }, true))
      .toEqual({ duration: 6, aspectRatio: '16:9', resolution: '720p', seed: 1 });
    expect(modelTestVideoParameters(parameters, {}, true)).toEqual(parameters);
    expect(modelTestVideoParameters(parameters, { duration: 6 })).toEqual({ ...parameters, duration: 6 });
  });

  it('only allows 1080p for Grok 1.5 text or first-frame generation', () => {
    expect(modelTestVideoResolutions(true, ['grok-imagine-video'], 'TEXT_TO_VIDEO')).toEqual(['480p', '720p']);
    expect(modelTestVideoResolutions(true, ['grok-imagine-video-1.5'], 'TEXT_TO_VIDEO')).toContain('1080p');
    expect(modelTestVideoResolutions(true, ['grok-imagine-video-1.5-preview'], 'FIRST_FRAME_TO_VIDEO')).toContain('1080p');
    expect(modelTestVideoResolutions(true, ['xai/grok-imagine-video-1.5-preview'], 'FIRST_FRAME_TO_VIDEO')).toContain('1080p');
    expect(modelTestVideoResolutions(true, ['grok-imagine-video-1.5-2026-05-30'], 'FIRST_FRAME_TO_VIDEO')).toContain('1080p');
    expect(modelTestVideoResolutions(true, ['grok-imagine-video-1.5-unknown'], 'FIRST_FRAME_TO_VIDEO')).not.toContain('1080p');
    expect(modelTestVideoResolutions(true, ['grok-imagine-video-1.5'], 'FIRST_LAST_FRAME_TO_VIDEO')).not.toContain('1080p');
    expect(modelTestVideoResolutions(true, ['grok-imagine-video', 'grok-imagine-video-1.5'], 'TEXT_TO_VIDEO')).not.toContain('1080p');
    expect(modelTestVideoResolutions(false, ['other-video-model'], 'TEXT_TO_VIDEO')).toContain('1080p');
  });
});
