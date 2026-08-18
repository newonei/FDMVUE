import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import { firstRestorableAgentNode } from './agent-draft-restore';

describe('agent draft restoration', () => {
  it('focuses only an affected node that exists in the server-returned draft', () => {
    const draft: FdmCreativeApi.WorkflowDraft = {
      definition: {
        edges: [],
        nodes: [
          {
            config: {},
            height: 100,
            id: 'server-created-image',
            name: '图片生成',
            ports: [],
            type: 'image-generate',
            width: 200,
            x: 100,
            y: 100,
          },
        ],
        schemaVersion: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      draftVersion: 9,
    };

    expect(
      firstRestorableAgentNode(draft, [
        'client-only-guess',
        'server-created-image',
      ]),
    ).toBe('server-created-image');
  });
});
