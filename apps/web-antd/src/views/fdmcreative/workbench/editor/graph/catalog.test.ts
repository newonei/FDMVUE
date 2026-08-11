import { describe, expect, it } from 'vitest';

import {
  CREATIVE_NODE_CATALOG,
  CREATIVE_NODE_MAP,
  getCreativeNodeVisual,
  getQuickConnectOptions,
  NODE_GROUPS,
  normalizeCreativeNodeConfig,
  normalizeCreativeNodePorts,
  normalizeCreativeWorkflowEdges,
} from './catalog';

describe('creative node catalog', () => {
  it('uses unique port ids within every node', () => {
    for (const node of CREATIVE_NODE_CATALOG) {
      expect(
        new Set(node.ports.map((port) => port.id)).size,
        `${node.type} contains duplicate port ids`,
      ).toBe(node.ports.length);
    }
  });

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
        'image-loop',
        'image-plan-item',
        'image-resize',
        'image-select',
        'image-to-image',
        'image-to-video',
        'output',
        'prompt-input',
        'prompt-generator',
        'prompt-template',
        'random-prompt',
        'video-compose',
        'video-frame-extract',
        'video-generate',
        'video-input',
        'video-loop',
        'video-normalize',
        'video-plan-item',
        'video-select',
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
        expect.objectContaining({
          id: 'reference',
          required: true,
          type: 'image-list',
        }),
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
    for (const type of [
      'first-last-frame-to-video',
      'image-generate',
      'image-to-image',
      'image-to-video',
      'video-generate',
    ]) {
      expect(CREATIVE_NODE_MAP.get(type)?.ports).toContainEqual(
        expect.objectContaining({ id: 'item', required: false }),
      );
    }
  });

  it('normalizes legacy required plan-item inputs when a draft is restored', () => {
    const normalized = normalizeCreativeNodePorts('image-to-image', [
      {
        direction: 'INPUT',
        id: 'item',
        required: true,
        type: 'image-plan-item',
      },
      {
        direction: 'INPUT',
        id: 'reference',
        required: true,
        type: 'image-asset',
      },
    ]);

    expect(normalized).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'item', required: false }),
        expect.objectContaining({
          id: 'reference',
          required: true,
          type: 'image-list',
        }),
        expect.objectContaining({
          direction: 'INPUT',
          id: 'prompt',
          required: false,
          type: 'prompt-text',
        }),
        expect.objectContaining({
          direction: 'OUTPUT',
          id: 'asset',
          type: 'image-asset',
        }),
      ]),
    );
  });

  it('fills missing catalog defaults when a legacy draft is restored', () => {
    expect(
      normalizeCreativeNodeConfig('video-normalize', { width: 1920 }),
    ).toEqual({
      fps: 30,
      height: 720,
      resizeMode: 'FIT',
      width: 1920,
    });
    expect(
      normalizeCreativeNodeConfig('provider-node', { custom: true }),
    ).toEqual({ custom: true });
  });

  it('upgrades timeline and terminal ports while preserving unknown ports', () => {
    expect(
      normalizeCreativeNodePorts('video-timeline', [
        {
          direction: 'INPUT',
          id: 'videos',
          required: true,
          type: 'video-list',
        },
        { direction: 'OUTPUT', id: 'timeline', type: 'timeline' },
        { direction: 'OUTPUT', id: 'provider-extra', type: 'creative-brief' },
      ]),
    ).toEqual([
      expect.objectContaining({ id: 'videos', required: true }),
      expect.objectContaining({
        direction: 'OUTPUT',
        id: 'ordered-videos',
        type: 'video-list',
      }),
      expect.objectContaining({ id: 'timeline', type: 'timeline' }),
      expect.objectContaining({ id: 'provider-extra', type: 'creative-brief' }),
    ]);

    for (const type of ['asset-library-output', 'output']) {
      const normalized = normalizeCreativeNodePorts(type, [
        {
          direction: 'INPUT',
          id: 'artifacts',
          required: true,
          type: 'artifact-set',
        },
        { direction: 'INPUT', id: 'provider-extra', type: 'prompt-text' },
      ]);
      expect(normalized).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'artifacts', required: false }),
          expect.objectContaining({ id: 'image', type: 'image-asset' }),
          expect.objectContaining({ id: 'images', type: 'image-list' }),
          expect.objectContaining({ id: 'video', type: 'video-asset' }),
          expect.objectContaining({ id: 'videos', type: 'video-list' }),
          expect.objectContaining({
            id: 'provider-extra',
            type: 'prompt-text',
          }),
        ]),
      );
    }
  });

  it('declares typed static and generated prompt nodes plus prompt inputs on generators', () => {
    expect(CREATIVE_NODE_MAP.get('prompt-input')?.ports).toEqual([
      expect.objectContaining({
        direction: 'OUTPUT',
        id: 'prompt',
        type: 'prompt-text',
      }),
    ]);
    const promptGenerator = CREATIVE_NODE_MAP.get('prompt-generator');
    expect(promptGenerator?.defaultConfig).toMatchObject({
      language: 'ZH_CN',
      targetType: 'GENERAL',
    });
    expect(promptGenerator?.ports).toEqual([
      expect.objectContaining({
        direction: 'INPUT',
        id: 'brief',
        type: 'creative-brief',
      }),
      expect.objectContaining({
        direction: 'INPUT',
        id: 'context',
        type: 'prompt-text',
      }),
      expect.objectContaining({
        direction: 'INPUT',
        id: 'reference',
        type: 'image-list',
      }),
      expect.objectContaining({
        direction: 'OUTPUT',
        id: 'prompt',
        type: 'prompt-text',
      }),
    ]);
    for (const type of [
      'first-last-frame-to-video',
      'image-edit',
      'image-generate',
      'image-to-image',
      'image-to-video',
      'video-generate',
    ]) {
      expect(CREATIVE_NODE_MAP.get(type)?.ports).toContainEqual(
        expect.objectContaining({
          direction: 'INPUT',
          id: 'prompt',
          required: false,
          type: 'prompt-text',
        }),
      );
    }
  });

  it('exposes prompt generation in its own LLM library group', () => {
    expect(NODE_GROUPS).toContainEqual({
      key: 'llm',
      label: '提示词与 LLM',
      types: [
        'prompt-input',
        'random-prompt',
        'prompt-template',
        'prompt-generator',
      ],
    });
  });

  it('declares random prompt candidates as a multi-input local node', () => {
    expect(CREATIVE_NODE_MAP.get('random-prompt')).toMatchObject({
      defaultConfig: {
        language: 'ZH_CN',
        prompts: '',
        targetType: 'GENERAL',
      },
      ports: [
        expect.objectContaining({
          direction: 'INPUT',
          id: 'prompts',
          type: 'prompt-text',
        }),
        expect.objectContaining({
          direction: 'OUTPUT',
          id: 'prompt',
          type: 'prompt-text',
        }),
      ],
    });
  });

  it('exposes executable loop and media-routing nodes', () => {
    expect(NODE_GROUPS).toContainEqual({
      key: 'flow',
      label: '流程控制与批处理',
      types: ['image-loop', 'video-loop', 'image-select', 'video-select'],
    });
    expect(CREATIVE_NODE_MAP.get('image-loop')).toMatchObject({
      defaultConfig: { batchSize: 1, count: 4, startIndex: 1 },
      ports: expect.arrayContaining([
        expect.objectContaining({ id: 'selected-images', type: 'image-list' }),
        expect.objectContaining({ id: 'result-prompt', type: 'prompt-text' }),
      ]),
    });
    expect(CREATIVE_NODE_MAP.get('image-select')?.ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: 'INPUT',
          id: 'images',
          type: 'image-list',
        }),
        expect.objectContaining({
          direction: 'OUTPUT',
          id: 'image',
          type: 'image-asset',
        }),
      ]),
    );
  });

  it('uses distinct input and output ids on the image collection', () => {
    expect(CREATIVE_NODE_MAP.get('image-collection')?.ports).toEqual([
      expect.objectContaining({
        direction: 'INPUT',
        id: 'images',
        type: 'image-list',
      }),
      expect.objectContaining({
        direction: 'OUTPUT',
        id: 'ordered-images',
        type: 'image-list',
      }),
    ]);
  });

  it('migrates legacy image-collection output edges on restore', () => {
    expect(
      normalizeCreativeWorkflowEdges(
        [
          {
            config: {},
            height: 100,
            id: 'collection',
            name: '图片集合',
            ports: [],
            type: 'image-collection',
            width: 100,
            x: 0,
            y: 0,
          },
        ],
        [
          {
            id: 'edge',
            sourceNodeId: 'collection',
            sourcePortId: 'images',
            targetNodeId: 'target',
            targetPortId: 'reference',
          },
        ],
      ),
    ).toEqual([expect.objectContaining({ sourcePortId: 'ordered-images' })]);
  });

  it('declares executable video preprocessing and an ordered timeline output', () => {
    expect(CREATIVE_NODE_MAP.get('video-frame-extract')).toMatchObject({
      defaultConfig: { frameMode: 'FIRST', timeSeconds: 0 },
      ports: [
        expect.objectContaining({
          direction: 'INPUT',
          id: 'video',
          required: true,
          type: 'video-asset',
        }),
        expect.objectContaining({
          direction: 'OUTPUT',
          id: 'asset',
          type: 'image-asset',
        }),
      ],
    });
    expect(CREATIVE_NODE_MAP.get('video-normalize')).toMatchObject({
      defaultConfig: {
        fps: 30,
        height: 720,
        resizeMode: 'FIT',
        width: 1280,
      },
    });
    expect(CREATIVE_NODE_MAP.get('video-timeline')?.ports).toContainEqual(
      expect.objectContaining({
        direction: 'OUTPUT',
        id: 'ordered-videos',
        type: 'video-list',
      }),
    );
  });

  it('allows direct media results to connect to both output nodes', () => {
    for (const type of ['asset-library-output', 'output']) {
      expect(CREATIVE_NODE_MAP.get(type)?.ports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'image', type: 'image-asset' }),
          expect.objectContaining({ id: 'images', type: 'image-list' }),
          expect.objectContaining({ id: 'video', type: 'video-asset' }),
          expect.objectContaining({ id: 'videos', type: 'video-list' }),
        ]),
      );
    }
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

    const imageListTargets = getQuickConnectOptions('image-list');
    expect(
      imageListTargets.map((item) => [item.template.type, item.targetPortId]),
    ).toEqual(
      expect.arrayContaining([
        ['image-generate', 'reference'],
        ['image-to-image', 'reference'],
        ['prompt-generator', 'reference'],
      ]),
    );

    const videoTargets = getQuickConnectOptions('video-asset');
    expect(videoTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetPortId: 'video',
          template: expect.objectContaining({ type: 'video-frame-extract' }),
        }),
        expect.objectContaining({
          targetPortId: 'video',
          template: expect.objectContaining({ type: 'video-normalize' }),
        }),
        expect.objectContaining({
          targetPortId: 'video',
          template: expect.objectContaining({ type: 'output' }),
        }),
      ]),
    );

    expect(
      getQuickConnectOptions('video-list').map((item) => [
        item.template.type,
        item.targetPortId,
      ]),
    ).toEqual(expect.arrayContaining([['video-compose', 'videos']]));

    const promptTargets = getQuickConnectOptions('prompt-text');
    expect(
      promptTargets.map((item) => [item.template.type, item.targetPortId]),
    ).toEqual(
      expect.arrayContaining([
        ['first-last-frame-to-video', 'prompt'],
        ['image-edit', 'prompt'],
        ['image-generate', 'prompt'],
        ['image-to-image', 'prompt'],
        ['image-to-video', 'prompt'],
        ['prompt-generator', 'context'],
        ['video-generate', 'prompt'],
      ]),
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
    expect(getCreativeNodeVisual('prompt-generator')).toMatchObject({
      height: 176,
      variant: 'llm',
      width: 202,
    });
  });
});
