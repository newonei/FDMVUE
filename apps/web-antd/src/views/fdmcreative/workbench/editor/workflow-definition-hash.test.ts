import type { FdmCreativeApi } from '#/api/fdmcreative';

import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('falls back to JavaScript SHA-256 when Web Crypto is unavailable over HTTP', async () => {
    vi.stubGlobal('crypto', {});
    const empty: FdmCreativeApi.WorkflowDefinition = {
      edges: [],
      nodes: [],
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
    };

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

  it('materializes omitted port defaults before hashing and transport', async () => {
    const source = definition();
    source.nodes[0]!.ports = [
      {
        direction: 'OUTPUT',
        id: 'asset',
        type: 'image-asset',
      },
    ];

    const transport = normalizeWorkflowDefinitionForTransport(source);
    const expectedCanonical =
      '{"edges":[],"nodes":[{"config":{},"height":100,"id":"image-input","name":"输入图片","ports":[{"direction":"OUTPUT","id":"asset","required":false,"type":"image-asset"}],"type":"image-input","width":160,"x":40,"y":20}],"schemaVersion":1,"viewport":{"x":0,"y":0,"zoom":1}}';

    expect(transport.nodes[0]?.ports).toEqual([
      {
        direction: 'OUTPUT',
        id: 'asset',
        required: false,
        type: 'image-asset',
      },
    ]);
    expect(canonicalWorkflowDefinitionJson(source)).toBe(expectedCanonical);
    expect(canonicalWorkflowDefinitionJson(transport)).toBe(expectedCanonical);
    await expect(hashWorkflowDefinition(source)).resolves.toBe(
      '46c7c59cca2557b233af88ddefeaf30a84a6939f52aa085ef0777bcec4a19c65',
    );
    await expect(hashWorkflowDefinition(transport)).resolves.toBe(
      '46c7c59cca2557b233af88ddefeaf30a84a6939f52aa085ef0777bcec4a19c65',
    );
  });
});
