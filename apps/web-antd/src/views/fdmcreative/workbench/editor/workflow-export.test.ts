import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import {
  createWorkflowExport,
  parseWorkflowExport,
  WORKFLOW_EXPORT_FORMAT,
} from './workflow-export';

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

describe('workflow export safety', () => {
  it('strips runtime fields, inline binary and signed URLs from local exports', () => {
    const document = createWorkflowExport(
      definition({
        apiToken: 'do-not-export',
        fileUrl: 'file:///private/source.png',
        nested: {
          previewUrl: 'blob:https://example.test/opaque',
          prompt: '保留提示词',
        },
        providerTaskId: 'task-123',
        safeAssetId: 12,
        signature: 'do-not-export',
        signed: 'https://example.test/object?X-Amz-Signature=secret',
        thumbnail: 'data:image/png;base64,AAAA',
      }),
      1_786_326_393_000,
    );
    const json = JSON.stringify(document);

    expect(json).toContain('保留提示词');
    expect(json).toContain('safeAssetId');
    expect(json).not.toMatch(
      /data:|blob:|file:|signature|token|providerTask|previewUrl/i,
    );
  });

  it('rejects dangerous imported JSON before it reaches the backend', () => {
    const document = createWorkflowExport(definition({ prompt: '安全内容' }), 1);
    document.definition.nodes[0]!.config.payload = 'data:image/png;base64,AAAA';

    expect(() => parseWorkflowExport(JSON.stringify(document))).toThrow(
      '不允许导入',
    );

    document.definition.nodes[0]!.config.payload = '安全内容';
    document.definition.nodes[0]!.config.signature = 'do-not-import';
    expect(() => parseWorkflowExport(JSON.stringify(document))).toThrow(
      '不允许导入',
    );
  });

  it('accepts a v1 legacy definition without a viewport so the server normalizer can upgrade it', () => {
    const document = {
      definition: {
        edges: [],
        nodes: [
          {
            config: {},
            height: 100,
            id: 'legacy-input',
            name: '旧节点',
            ports: [],
            type: 'image-input',
            width: 160,
            x: 0,
            y: 0,
          },
        ],
        schemaVersion: 1,
      },
      exportedAt: 1,
      format: WORKFLOW_EXPORT_FORMAT,
      metadata: {
        definitionSchemaVersion: 1,
        edgeCount: 0,
        nodeCount: 1,
      },
      schemaVersion: 1,
    };

    expect(parseWorkflowExport(JSON.stringify(document)).definition.nodes).toHaveLength(1);
  });
});
