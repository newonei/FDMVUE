import type { FdmAiApi } from '#/api/fdmai';

import { describe, expect, it } from 'vitest';

import {
  getVideoFrameConfigSlots,
  supportsNodeModel,
} from './node-model-filter';

function model(
  capabilities: FdmAiApi.Capability[],
  modality: FdmAiApi.Modality = 'IMAGE',
): Pick<FdmAiApi.ModelOption, 'capabilities' | 'modality'> {
  return { capabilities, modality };
}

describe('supportsNodeModel', () => {
  it('requires IMAGE_TO_IMAGE for an image-to-image node', () => {
    expect(
      supportsNodeModel(model(['TEXT_TO_IMAGE']), 'image-to-image', [1]),
    ).toBe(false);
    expect(
      supportsNodeModel(model(['IMAGE_TO_IMAGE']), 'image-to-image', [1]),
    ).toBe(true);
  });

  it('requires MULTI_REFERENCE when more than one reference is selected', () => {
    expect(
      supportsNodeModel(model(['IMAGE_TO_IMAGE']), 'image-to-image', [1, 2]),
    ).toBe(false);
    expect(
      supportsNodeModel(
        model(['IMAGE_TO_IMAGE', 'MULTI_REFERENCE']),
        'image-to-image',
        [1, 2],
      ),
    ).toBe(true);
  });

  it('switches image generation capability when references are present', () => {
    expect(
      supportsNodeModel(model(['TEXT_TO_IMAGE']), 'image-generate', []),
    ).toBe(true);
    expect(
      supportsNodeModel(model(['TEXT_TO_IMAGE']), 'image-generate', [1]),
    ).toBe(false);
    expect(
      supportsNodeModel(model(['IMAGE_TO_IMAGE']), 'image-generate', [1]),
    ).toBe(true);
  });

  it('requires the capability owned by each image and video node', () => {
    expect(supportsNodeModel(model([]), 'image-edit', [1])).toBe(false);
    expect(supportsNodeModel(model(['IMAGE_EDIT']), 'image-edit', [1])).toBe(
      true,
    );
    expect(
      supportsNodeModel(
        model(['TEXT_TO_VIDEO'], 'VIDEO'),
        'video-generate',
        [],
      ),
    ).toBe(true);
    expect(
      supportsNodeModel(
        model(['TEXT_TO_VIDEO'], 'VIDEO'),
        'video-generate',
        [1],
      ),
    ).toBe(false);
    expect(
      supportsNodeModel(
        model(['FIRST_FRAME_TO_VIDEO'], 'VIDEO'),
        'image-to-video',
        [1],
      ),
    ).toBe(true);
    expect(
      supportsNodeModel(
        model(['FIRST_FRAME_TO_VIDEO'], 'VIDEO'),
        'first-last-frame-to-video',
        [1, 2],
      ),
    ).toBe(false);
    expect(
      supportsNodeModel(
        model(['FIRST_LAST_FRAME_TO_VIDEO'], 'VIDEO'),
        'first-last-frame-to-video',
        [1, 2],
      ),
    ).toBe(true);
  });

  it('keeps tail-frame configuration exclusive to the dedicated node', () => {
    expect(
      getVideoFrameConfigSlots('video-generate', [
        'TEXT_TO_VIDEO',
        'FIRST_LAST_FRAME_TO_VIDEO',
      ]),
    ).toEqual([]);
    expect(
      getVideoFrameConfigSlots('video-generate', [
        'TEXT_TO_VIDEO',
        'FIRST_FRAME_TO_VIDEO',
      ]),
    ).toEqual([{ key: 'firstFrameAssetId', label: '首帧' }]);
    expect(
      getVideoFrameConfigSlots('first-last-frame-to-video', [
        'FIRST_LAST_FRAME_TO_VIDEO',
      ]),
    ).toEqual([
      { key: 'firstFrameAssetId', label: '首帧' },
      { key: 'lastFrameAssetId', label: '尾帧' },
    ]);
    expect(
      supportsNodeModel(
        model(['FIRST_LAST_FRAME_TO_VIDEO'], 'VIDEO'),
        'video-generate',
        [1],
      ),
    ).toBe(false);
  });

  it('requires a TEXT chat model for prompt generation', () => {
    expect(
      supportsNodeModel(model(['CHAT'], 'TEXT'), 'prompt-generator', []),
    ).toBe(true);
    expect(
      supportsNodeModel(
        model(['STRUCTURED_OUTPUT'], 'TEXT'),
        'prompt-generator',
        [],
      ),
    ).toBe(false);
    expect(
      supportsNodeModel(model(['CHAT'], 'IMAGE'), 'prompt-generator', []),
    ).toBe(false);
  });

  it('requires IMAGE_INPUT when a prompt generator receives references', () => {
    expect(
      supportsNodeModel(model(['CHAT'], 'TEXT'), 'prompt-generator', [1]),
    ).toBe(false);
    expect(
      supportsNodeModel(
        model(['CHAT', 'IMAGE_INPUT'], 'TEXT'),
        'prompt-generator',
        [1, 2],
      ),
    ).toBe(true);
  });

  it('keeps voice and music routes on their distinct modalities and capabilities', () => {
    expect(
      supportsNodeModel(
        model(['TEXT_TO_AUDIO'], 'AUDIO'),
        'audio-generate',
        [],
      ),
    ).toBe(true);
    expect(
      supportsNodeModel(
        model(['TEXT_TO_AUDIO'], 'MUSIC'),
        'audio-generate',
        [],
      ),
    ).toBe(false);
    expect(
      supportsNodeModel(
        model(['TEXT_TO_MUSIC'], 'MUSIC'),
        'music-generate',
        [],
      ),
    ).toBe(true);
    expect(
      supportsNodeModel(
        model(['TEXT_TO_AUDIO'], 'AUDIO'),
        'music-generate',
        [],
      ),
    ).toBe(false);
  });
});
