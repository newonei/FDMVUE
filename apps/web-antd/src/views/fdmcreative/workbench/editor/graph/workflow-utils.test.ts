import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import {
  createsCycle,
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
