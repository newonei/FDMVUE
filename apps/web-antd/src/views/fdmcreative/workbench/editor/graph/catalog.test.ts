import { describe, expect, it } from 'vitest';

import {
  CREATIVE_NODE_CATALOG,
  CREATIVE_NODE_MAP,
  getCreativeNodeVisual,
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
