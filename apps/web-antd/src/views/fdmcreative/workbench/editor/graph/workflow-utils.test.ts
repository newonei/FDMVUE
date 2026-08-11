import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import {
  createsCycle,
  findAutoConnectTargetPort,
  isPortTypeCompatible,
  planSummary,
  validateWorkflowConnection,
} from './workflow-utils';

const definition: FdmCreativeApi.WorkflowDefinition = {
  edges: [
    {
      id: 'e1',
      sourceNodeId: 'a',
      sourcePortId: 'out',
      targetNodeId: 'b',
      targetPortId: 'in',
    },
  ],
  nodes: [
    {
      config: {},
      height: 100,
      id: 'a',
      name: '图片生成',
      ports: [{ direction: 'OUTPUT', id: 'out', type: 'image-asset' }],
      type: 'image-generate',
      width: 240,
      x: 0,
      y: 0,
    },
    {
      config: {},
      height: 100,
      id: 'b',
      name: '图片集合',
      ports: [{ direction: 'INPUT', id: 'in', type: 'image-list' }],
      type: 'artifact-collection',
      width: 240,
      x: 300,
      y: 0,
    },
  ],
  schemaVersion: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
};

function node(
  id: string,
  type: string,
  ports: FdmCreativeApi.WorkflowPort[],
): FdmCreativeApi.WorkflowNode {
  return {
    config: {},
    height: 120,
    id,
    name: id,
    ports,
    type,
    width: 180,
    x: 0,
    y: 0,
  };
}

function promptWorkflow(
  target: FdmCreativeApi.WorkflowNode,
  edges: FdmCreativeApi.WorkflowEdge[] = [],
): FdmCreativeApi.WorkflowDefinition {
  return {
    edges,
    nodes: [
      node('prompt-a', 'prompt-generator', [
        { direction: 'OUTPUT', id: 'prompt', type: 'prompt-text' },
      ]),
      node('prompt-b', 'prompt-generator', [
        { direction: 'OUTPUT', id: 'prompt', type: 'prompt-text' },
      ]),
      target,
    ],
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function mediaWorkflow(
  targetType: string,
  targetPortId: string,
  targetPortType: FdmCreativeApi.PortType,
): FdmCreativeApi.WorkflowDefinition {
  const sourcePortType =
    targetPortType === 'video-list' ? 'video-asset' : targetPortType;
  return {
    edges: [
      {
        id: 'media-edge-a',
        sourceNodeId: 'media-a',
        sourcePortId: 'asset',
        targetNodeId: 'target',
        targetPortId,
      },
    ],
    nodes: [
      node('media-a', 'media-input', [
        { direction: 'OUTPUT', id: 'asset', type: sourcePortType },
      ]),
      node('media-b', 'media-input', [
        { direction: 'OUTPUT', id: 'asset', type: sourcePortType },
      ]),
      node('target', targetType, [
        { direction: 'INPUT', id: targetPortId, type: targetPortType },
      ]),
    ],
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

describe('workflow graph rules', () => {
  it('supports single media flowing into a typed list input', () => {
    expect(isPortTypeCompatible('image-asset', 'image-list')).toBe(true);
    expect(isPortTypeCompatible('video-asset', 'image-list')).toBe(false);
  });

  it('rejects duplicate edges and cycles', () => {
    expect(
      validateWorkflowConnection({
        definition,
        sourceNodeId: 'a',
        sourcePortId: 'out',
        targetNodeId: 'b',
        targetPortId: 'in',
      }),
    ).toBe(false);
    expect(createsCycle(definition, 'b', 'a')).toBe(true);
  });

  it('accepts only one prompt-text edge on a generation prompt input', () => {
    const target = node('image', 'image-generate', [
      { direction: 'INPUT', id: 'prompt', type: 'prompt-text' },
    ]);
    const firstEdge: FdmCreativeApi.WorkflowEdge = {
      id: 'prompt-edge-a',
      sourceNodeId: 'prompt-a',
      sourcePortId: 'prompt',
      targetNodeId: 'image',
      targetPortId: 'prompt',
    };
    const firstDefinition = promptWorkflow(target);
    expect(
      validateWorkflowConnection({ ...firstEdge, definition: firstDefinition }),
    ).toBe(true);

    const secondDefinition = promptWorkflow(target, [firstEdge]);
    expect(
      validateWorkflowConnection({
        definition: secondDefinition,
        sourceNodeId: 'prompt-b',
        sourcePortId: 'prompt',
        targetNodeId: 'image',
        targetPortId: 'prompt',
      }),
    ).toBe(false);
  });

  it('resolves a node-body drop to the nearest compatible input port', () => {
    const autoConnectDefinition: FdmCreativeApi.WorkflowDefinition = {
      edges: [],
      nodes: [
        node('image-source', 'image-input', [
          { direction: 'OUTPUT', id: 'asset', type: 'image-asset' },
        ]),
        node('video-target', 'first-last-frame-to-video', [
          { direction: 'INPUT', id: 'first-frame', type: 'image-asset' },
          { direction: 'INPUT', id: 'last-frame', type: 'image-asset' },
          { direction: 'INPUT', id: 'prompt', type: 'prompt-text' },
        ]),
      ],
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    expect(
      findAutoConnectTargetPort({
        definition: autoConnectDefinition,
        preferredTargetPortIds: ['last-frame', 'first-frame'],
        sourceNodeId: 'image-source',
        sourcePortId: 'asset',
        targetNodeId: 'video-target',
      }),
    ).toBe('last-frame');
  });

  it('skips an occupied scalar port when auto-connecting to a node body', () => {
    const autoConnectDefinition: FdmCreativeApi.WorkflowDefinition = {
      edges: [
        {
          id: 'first-frame-edge',
          sourceNodeId: 'image-a',
          sourcePortId: 'asset',
          targetNodeId: 'video-target',
          targetPortId: 'first-frame',
        },
      ],
      nodes: [
        node('image-a', 'image-input', [
          { direction: 'OUTPUT', id: 'asset', type: 'image-asset' },
        ]),
        node('image-b', 'image-input', [
          { direction: 'OUTPUT', id: 'asset', type: 'image-asset' },
        ]),
        node('video-target', 'first-last-frame-to-video', [
          { direction: 'INPUT', id: 'first-frame', type: 'image-asset' },
          { direction: 'INPUT', id: 'last-frame', type: 'image-asset' },
        ]),
      ],
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    expect(
      findAutoConnectTargetPort({
        definition: autoConnectDefinition,
        sourceNodeId: 'image-b',
        sourcePortId: 'asset',
        targetNodeId: 'video-target',
      }),
    ).toBe('last-frame');
  });

  it('allows multiple prompt contexts and image references on a prompt generator', () => {
    const target = node('generator', 'prompt-generator', [
      { direction: 'INPUT', id: 'context', type: 'prompt-text' },
      { direction: 'INPUT', id: 'reference', type: 'image-list' },
    ]);
    const contextEdge: FdmCreativeApi.WorkflowEdge = {
      id: 'context-edge-a',
      sourceNodeId: 'prompt-a',
      sourcePortId: 'prompt',
      targetNodeId: 'generator',
      targetPortId: 'context',
    };
    const contextDefinition = promptWorkflow(target, [contextEdge]);
    expect(
      validateWorkflowConnection({
        definition: contextDefinition,
        sourceNodeId: 'prompt-b',
        sourcePortId: 'prompt',
        targetNodeId: 'generator',
        targetPortId: 'context',
      }),
    ).toBe(true);

    const referenceDefinition: FdmCreativeApi.WorkflowDefinition = {
      ...contextDefinition,
      edges: [
        {
          id: 'reference-edge-a',
          sourceNodeId: 'image-a',
          sourcePortId: 'asset',
          targetNodeId: 'generator',
          targetPortId: 'reference',
        },
      ],
      nodes: [
        node('image-a', 'image-input', [
          { direction: 'OUTPUT', id: 'asset', type: 'image-asset' },
        ]),
        node('image-b', 'image-input', [
          { direction: 'OUTPUT', id: 'asset', type: 'image-asset' },
        ]),
        target,
      ],
    };
    expect(
      validateWorkflowConnection({
        definition: referenceDefinition,
        sourceNodeId: 'image-b',
        sourcePortId: 'asset',
        targetNodeId: 'generator',
        targetPortId: 'reference',
      }),
    ).toBe(true);
  });

  it('allows multiple upstream candidates on a random prompt node', () => {
    const target = node('random', 'random-prompt', [
      { direction: 'INPUT', id: 'prompts', type: 'prompt-text' },
      { direction: 'OUTPUT', id: 'prompt', type: 'prompt-text' },
    ]);
    const firstEdge: FdmCreativeApi.WorkflowEdge = {
      id: 'random-edge-a',
      sourceNodeId: 'prompt-a',
      sourcePortId: 'prompt',
      targetNodeId: 'random',
      targetPortId: 'prompts',
    };
    const randomDefinition = promptWorkflow(target, [firstEdge]);

    expect(
      validateWorkflowConnection({
        definition: randomDefinition,
        sourceNodeId: 'prompt-b',
        sourcePortId: 'prompt',
        targetNodeId: 'random',
        targetPortId: 'prompts',
      }),
    ).toBe(true);
  });

  it('connects an image collection directly to multi-reference generation', () => {
    const collection = node('collection', 'image-collection', [
      { direction: 'OUTPUT', id: 'ordered-images', type: 'image-list' },
    ]);
    const generator = node('generator', 'image-generate', [
      { direction: 'INPUT', id: 'reference', type: 'image-list' },
    ]);
    const imageCollectionWorkflow: FdmCreativeApi.WorkflowDefinition = {
      edges: [],
      nodes: [collection, generator],
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    expect(
      validateWorkflowConnection({
        definition: imageCollectionWorkflow,
        sourceNodeId: 'collection',
        sourcePortId: 'ordered-images',
        targetNodeId: 'generator',
        targetPortId: 'reference',
      }),
    ).toBe(true);
  });

  it('accepts only one edge on scalar media inputs', () => {
    for (const [targetType, targetPortId, targetPortType] of [
      ['first-last-frame-to-video', 'first-frame', 'image-asset'],
      ['first-last-frame-to-video', 'last-frame', 'image-asset'],
      ['image-edit', 'image', 'image-asset'],
      ['image-resize', 'image', 'image-asset'],
      ['image-to-video', 'first-frame', 'image-asset'],
      ['video-frame-extract', 'video', 'video-asset'],
      ['video-normalize', 'video', 'video-asset'],
      ['video-transition', 'first', 'video-asset'],
      ['video-transition', 'second', 'video-asset'],
      ['video-trim', 'video', 'video-asset'],
    ] as const) {
      expect(
        validateWorkflowConnection({
          definition: mediaWorkflow(targetType, targetPortId, targetPortType),
          sourceNodeId: 'media-b',
          sourcePortId: 'asset',
          targetNodeId: 'target',
          targetPortId,
        }),
      ).toBe(false);
    }
  });

  it('keeps collection inputs multi-edge', () => {
    expect(
      validateWorkflowConnection({
        definition: mediaWorkflow('video-compose', 'videos', 'video-list'),
        sourceNodeId: 'media-b',
        sourcePortId: 'asset',
        targetNodeId: 'target',
        targetPortId: 'videos',
      }),
    ).toBe(true);
  });

  it('summarizes mixed image and video plans', () => {
    expect(
      planSummary({
        items: [
          {
            image: { outputCount: 2 },
            itemId: 'i1',
            kind: 'IMAGE',
            order: 1,
            prompt: 'image',
            title: 'Image',
          },
          {
            itemId: 'v1',
            kind: 'VIDEO',
            order: 2,
            prompt: 'video',
            title: 'Video',
            video: { durationSeconds: 6 },
          },
        ],
        mode: 'MIXED',
      }),
    ).toEqual({
      imageCount: 2,
      itemCount: 2,
      videoCount: 1,
      videoDurationSeconds: 6,
    });
  });
});
