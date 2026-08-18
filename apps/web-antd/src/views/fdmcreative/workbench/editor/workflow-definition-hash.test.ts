import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import {
  canonicalWorkflowDefinitionJson,
  hashWorkflowDefinition,
  normalizeWorkflowDefinitionForTransport,
} from './workflow-definition-hash';

function definition(
  config: Record<string, unknown> = {},
): FdmCreativeApi.WorkflowDefinition {
  return {
    edges: [],
    nodes: [
      {
        config,
        height: 100,
        id: 'image-input',
        name: '输入图片',
        ports: [],
        type: 'image-input',
        width: 160,
        x: 40,
        y: 20,
      },
    ],
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

describe('workflow definition hash', () => {
  it('matches the server-owned empty-workflow SHA-256 fixture', async () => {
    const empty: FdmCreativeApi.WorkflowDefinition = {
      edges: [],
      nodes: [],
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    expect(canonicalWorkflowDefinitionJson(empty)).toBe(
      '{"edges":[],"nodes":[],"schemaVersion":1,"viewport":{"x":0,"y":0,"zoom":1}}',
    );
    await expect(hashWorkflowDefinition(empty)).resolves.toBe(
      'a8d7d5ac1e2bc91f2f5b89c5fa3dffddb771c5598d8c9c9c030bb98784cfefd0',
    );
  });

  it('is independent of object insertion order and normalizes decimal spelling', async () => {
    const left = definition({
      nested: { beta: 2, alpha: 1 },
      scale: 1e-7,
      width: 120,
    });
    const right = definition({
      width: 120,
      scale: 0.0000001,
      nested: { alpha: 1, beta: 2 },
    });

    expect(canonicalWorkflowDefinitionJson(left)).toBe(
      canonicalWorkflowDefinitionJson(right),
    );
    expect(await hashWorkflowDefinition(left)).toBe(
      await hashWorkflowDefinition(right),
    );
  });

  it('follows JSON transport semantics for undefined object keys and array members', () => {
    const result = normalizeWorkflowDefinitionForTransport(
      definition({
        optional: undefined,
        variants: ['keep', undefined],
      }),
    );

    expect(result.nodes[0]?.config).toEqual({
      variants: ['keep', null],
    });
  });
});
