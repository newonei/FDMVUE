import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import {
  invalidPromptImageReferenceNumbers,
  reconcilePromptReferenceBindings,
  resolveConnectedImageReferences,
} from './connected-image-references';

function imageAsset(id: number, name: string): FdmCreativeApi.CreativeAsset {
  return {
    id,
    kind: 'IMAGE',
    name,
    projectId: 1,
    url: `https://files.test/${id}.png`,
  };
}

function definition(): FdmCreativeApi.WorkflowDefinition {
  return {
    edges: [
      {
        id: 'edge-b',
        sourceNodeId: 'source-b',
        sourcePortId: 'asset',
        targetNodeId: 'target',
        targetPortId: 'reference',
      },
      {
        id: 'edge-a',
        sourceNodeId: 'source-a',
        sourcePortId: 'asset',
        targetNodeId: 'target',
        targetPortId: 'reference',
      },
    ],
    nodes: [
      {
        config: { assetId: 1 },
        height: 100,
        id: 'source-a',
        name: '主图',
        ports: [{ direction: 'OUTPUT', id: 'asset', type: 'image-asset' }],
        type: 'image-input',
        width: 100,
        x: 0,
        y: 0,
      },
      {
        config: { assetId: 2 },
        height: 100,
        id: 'source-b',
        name: '透明图',
        ports: [{ direction: 'OUTPUT', id: 'asset', type: 'image-asset' }],
        type: 'image-input',
        width: 100,
        x: 0,
        y: 120,
      },
      {
        config: {},
        height: 100,
        id: 'target',
        name: '参考图生图',
        ports: [
          { direction: 'INPUT', id: 'item', type: 'image-plan-item' },
          {
            direction: 'INPUT',
            id: 'reference',
            required: true,
            type: 'image-asset',
          },
        ],
        type: 'image-to-image',
        width: 100,
        x: 200,
        y: 0,
      },
    ],
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

describe('resolveConnectedImageReferences', () => {
  it('uses workflow edge order for references on the same target port', () => {
    const result = resolveConnectedImageReferences(definition(), 'target', [
      imageAsset(1, '主图01.jpg'),
      imageAsset(2, '透明图.png'),
    ]);

    expect(result.map((item) => item.assetId)).toEqual([2, 1]);
    expect(result.map((item) => item.sourceNodeName)).toEqual([
      '透明图',
      '主图',
    ]);
  });

  it('keeps a connected placeholder before an upstream node has output', () => {
    const value = definition();
    value.nodes[0]!.config = {};
    const result = resolveConnectedImageReferences(value, 'target', [
      imageAsset(2, '透明图.png'),
    ]);

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      name: '主图',
      sourceNodeId: 'source-a',
    });
    expect(result[1]?.assetId).toBeUndefined();
  });
});

describe('invalidPromptImageReferenceNumbers', () => {
  it('reports references that are no longer connected', () => {
    expect(
      invalidPromptImageReferenceNumbers(
        '将@图片1 的图案替换为@图片3 的图案，再参考@图片0',
        2,
      ),
    ).toEqual([3, 0]);
  });
});

describe('reconcilePromptReferenceBindings', () => {
  it('does not renumber surviving mentions after an edge is removed', () => {
    const result = reconcilePromptReferenceBindings(
      ['EDGE:edge-b:0', 'EDGE:edge-c:0'],
      [
        { alias: '图片1', bindingKey: 'EDGE:edge-a:0' },
        { alias: '图片2', bindingKey: 'EDGE:edge-b:0' },
      ],
    );

    expect(result).toEqual([
      { alias: '图片1', bindingKey: 'EDGE:edge-a:0' },
      { alias: '图片2', bindingKey: 'EDGE:edge-b:0' },
      { alias: '图片3', bindingKey: 'EDGE:edge-c:0' },
    ]);
  });

  it('keeps later edges stable when a pending edge gains another output', () => {
    const result = reconcilePromptReferenceBindings(
      ['EDGE:edge-a:0', 'EDGE:edge-a:1', 'EDGE:edge-b:0'],
      [
        { alias: '图片1', bindingKey: 'EDGE:edge-a:0' },
        { alias: '图片2', bindingKey: 'EDGE:edge-b:0' },
      ],
    );

    expect(result).toContainEqual({
      alias: '图片2',
      bindingKey: 'EDGE:edge-b:0',
    });
    expect(result).toContainEqual({
      alias: '图片3',
      bindingKey: 'EDGE:edge-a:1',
    });
  });
});
