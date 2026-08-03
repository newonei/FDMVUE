import { describe, expect, it } from 'vitest';

import {
  CREATIVE_NODE_CATALOG,
  CREATIVE_NODE_MAP,
  getCreativeNodeVisual,
  getQuickConnectOptions,
} from './catalog';

describe('creative node catalog', () => {
  it('matches every node type supported by the creative backend', () => {
    expect(new Set(CREATIVE_NODE_CATALOG.map((node) => node.type))).toEqual(
      new Set([
        'artifact-collection',
        'asset-library-output',
        'brand-input',
        'content-planner',
        'creative-brief',
        'first-last-frame-to-video',
        'image-collection',
        'image-edit',
        'image-generate',
        'image-input',
        'image-plan-item',
        'image-resize',
        'image-to-image',
        'image-to-video',
        'output',
        'video-compose',
        'video-generate',
        'video-input',
        'video-plan-item',
        'video-timeline',
        'video-transition',
        'video-trim',
      ]),
    );
  });

  it('serializes reference-based generation as distinct backend node types', () => {
    const imageToImage = CREATIVE_NODE_MAP.get('image-to-image')!;
    const imageToVideo = CREATIVE_NODE_MAP.get('image-to-video')!;
    const firstLast = CREATIVE_NODE_MAP.get('first-last-frame-to-video')!;

    expect(imageToImage.ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'reference', required: true }),
      ]),
    );
    expect(imageToVideo.ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'first-frame', required: true }),
      ]),
    );
    expect(firstLast.ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'first-frame', required: true }),
        expect.objectContaining({ id: 'last-frame', required: true }),
      ]),
    );
  });

  it('uses the backend content-plan contract between planner and plan items', () => {
    expect(CREATIVE_NODE_MAP.get('content-planner')?.ports).toContainEqual(
      expect.objectContaining({ id: 'plan', type: 'content-plan' }),
    );
    expect(CREATIVE_NODE_MAP.get('image-plan-item')?.ports).toContainEqual(
      expect.objectContaining({
        direction: 'INPUT',
        id: 'plan',
        type: 'content-plan',
      }),
    );
  });

  it('offers only type-compatible targets for quick connection', () => {
    const contentPlanTargets = getQuickConnectOptions('content-plan');
    expect(contentPlanTargets.map((item) => item.template.type)).toEqual([
      'image-plan-item',
      'video-plan-item',
    ]);

    const imageTargets = getQuickConnectOptions('image-asset');
    expect(imageTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetPortId: 'reference',
          template: expect.objectContaining({ type: 'image-to-image' }),
        }),
        expect.objectContaining({
          targetPortId: 'first-frame',
          template: expect.objectContaining({ type: 'image-to-video' }),
        }),
        expect.objectContaining({
          targetPortId: 'image',
          template: expect.objectContaining({ type: 'artifact-collection' }),
        }),
        expect.objectContaining({
          targetPortId: 'images',
          template: expect.objectContaining({ type: 'image-collection' }),
        }),
      ]),
    );
    expect(
      imageTargets.some((item) => item.template.type === 'video-trim'),
    ).toBe(false);
  });

  it('keeps every visual variant within the compact workbench limits', () => {
    for (const node of CREATIVE_NODE_CATALOG) {
      const visual = getCreativeNodeVisual(node.type);
      expect(visual.width).toBeGreaterThanOrEqual(160);
      expect(visual.width).toBeLessThanOrEqual(224);
      expect(visual.height).toBeLessThanOrEqual(300);
    }
    expect(getCreativeNodeVisual('content-planner')).toMatchObject({
      height: 224,
      variant: 'planner',
    });
    expect(getCreativeNodeVisual('image-input')).toMatchObject({
      height: 206,
      variant: 'asset',
    });
  });
});
