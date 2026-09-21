import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import { resolveGeneratedImageAssets } from './generated-image-assets';

function asset(
  id: number,
  extra: Partial<FdmCreativeApi.CreativeAsset> = {},
): FdmCreativeApi.CreativeAsset {
  return {
    id,
    kind: 'IMAGE',
    name: `产品图-${id}`,
    projectId: 33,
    url: `https://files.test/fdmcreative/33/${id}.png`,
    ...extra,
  };
}

function archivedImage(assetId: number, extra: Record<string, unknown> = {}) {
  return {
    type: 'IMAGE',
    assetId,
    url: asset(assetId).url,
    mimeType: 'image/png',
    ...extra,
  };
}

function run(
  id: number,
  nodeId: string,
  output?: unknown,
  extra: Partial<FdmCreativeApi.NodeRun> = {},
): FdmCreativeApi.NodeRun {
  return {
    id,
    nodeId,
    nodeType: 'image-generate',
    status: 'SUCCEEDED',
    outputJson: output === undefined ? undefined : JSON.stringify(output),
    ...extra,
  };
}

function ids(assets?: FdmCreativeApi.CreativeAsset[]) {
  return assets?.map((item) => item.id);
}

describe('resolveGeneratedImageAssets', () => {
  it('previews an archived image-generate output missing from the asset page while image-to-image is still running', () => {
    const generated = archivedImage(701);
    const runs = [
      run(101, 'generate', { outputs: [generated] }),
      run(
        102,
        'image-to-image',
        { outputs: [] },
        {
          nodeType: 'image-to-image',
          status: 'WAITING_AI',
        },
      ),
    ];
    const recentAssets = [asset(900), asset(901)];
    const resolved = resolveGeneratedImageAssets(33, runs, recentAssets);

    expect(resolved.get('generate')).toEqual([
      {
        id: 701,
        kind: 'IMAGE',
        mimeType: 'image/png',
        name: 'generate-701',
        projectId: 33,
        sourceNodeRunId: 101,
        url: generated.url,
      },
    ]);
    expect(resolved.has('image-to-image')).toBe(false);
    expect(recentAssets.map((item) => item.id)).toEqual([900, 901]);
  });

  it('accepts known runs from earlier tasks during a partial node run', () => {
    const current = run(
      202,
      'edit',
      { outputs: [archivedImage(802)] },
      {
        nodeType: 'image-to-image',
      },
    );
    const previous = run(101, 'generate', { outputs: [archivedImage(701)] });
    const resolved = resolveGeneratedImageAssets(33, [current, previous], []);

    expect(ids(resolved.get('generate'))).toEqual([701]);
    expect(ids(resolved.get('edit'))).toEqual([802]);
  });

  it('prefers real asset details and follows source ID, output ID, then URL order', () => {
    const real = asset(20, { name: '真实素材名称', mimeType: 'image/webp' });
    const sourceFirst = asset(10, { sourceNodeRunId: 101 });
    const sourceLast = asset(50, { sourceNodeRunId: 101 });
    const urlOnly = asset(80);
    const source = run(101, 'generate', {
      outputs: [
        { url: urlOnly.url },
        archivedImage(20, { url: 'https://stale.test/20.png' }),
        archivedImage(50),
        archivedImage(30),
      ],
    });
    const projectAssets = [sourceLast, urlOnly, real, sourceFirst];
    const resolved = resolveGeneratedImageAssets(33, [source], projectAssets);

    expect(ids(resolved.get('generate'))).toEqual([10, 50, 20, 30, 80]);
    expect(resolved.get('generate')?.[2]).toBe(real);
    expect(projectAssets.map((item) => item.id)).toEqual([50, 80, 20, 10]);
  });

  it.each(['image-collection', 'image-loop', 'image-select'])(
    'preserves explicit output reference order for %s',
    (nodeType) => {
      const source = run(
        101,
        'ordered',
        {
          images: [{ url: asset(80).url }, { assetId: 20 }, { assetId: 80 }],
        },
        { nodeType },
      );
      const resolved = resolveGeneratedImageAssets(
        33,
        [source],
        [asset(10, { sourceNodeRunId: 101 }), asset(20), asset(80)],
      );

      expect(ids(resolved.get('ordered'))).toEqual([80, 20, 10]);
    },
  );

  it('resolves collection IDs against archived upstream outputs outside the asset page', () => {
    const collection = run(
      103,
      'collection',
      {
        images: [{ assetId: 702 }, { assetId: 701 }],
      },
      { nodeType: 'image-collection' },
    );
    const resolved = resolveGeneratedImageAssets(
      33,
      [
        collection,
        run(101, 'generate', {
          outputs: [archivedImage(701), archivedImage(702)],
        }),
      ],
      [],
    );

    expect(ids(resolved.get('collection'))).toEqual([702, 701]);
    expect(ids(resolved.get('generate'))).toEqual([701, 702]);
  });

  it('uses only the last successful loop iteration and preserves its multiple outputs', () => {
    const resolved = resolveGeneratedImageAssets(
      33,
      [
        run(102, 'generate::loop::2', {
          outputs: [archivedImage(703), archivedImage(702), archivedImage(703)],
        }),
        run(101, 'generate::loop::1', { outputs: [archivedImage(701)] }),
        run(90, 'generate', { outputs: [archivedImage(690)] }),
      ],
      [],
    );

    expect([...resolved.keys()]).toEqual(['generate']);
    expect(ids(resolved.get('generate'))).toEqual([703, 702]);
  });

  it('switches loop references to a newly successful iteration without accumulating old images', () => {
    const first = run(101, 'generate::loop::1', {
      outputs: [archivedImage(701)],
    });
    const second = run(102, 'generate::loop::2', undefined, {
      status: 'WAITING_AI',
    });
    const aggregate = run(
      102,
      'generate',
      { outputs: [archivedImage(701)] },
      { status: 'WAITING_AI' },
    );
    const projectAssets = [asset(701, { sourceNodeRunId: 101 })];

    const pending = resolveGeneratedImageAssets(
      33,
      [aggregate, second, first],
      projectAssets,
    );
    expect(ids(pending.get('generate'))).toEqual([701]);

    const completed = resolveGeneratedImageAssets(
      33,
      [
        aggregate,
        {
          ...second,
          status: 'SUCCEEDED',
          outputJson: JSON.stringify({ outputs: [archivedImage(702)] }),
        },
        first,
      ],
      [...projectAssets, asset(702, { sourceNodeRunId: 102 })],
    );
    expect(ids(completed.get('generate'))).toEqual([702]);
  });

  it('does not show an old plain-node result when the current loop has no successful iteration', () => {
    const resolved = resolveGeneratedImageAssets(
      33,
      [
        run(90, 'generate', { outputs: [archivedImage(690)] }),
        run(101, 'generate::loop::1', undefined, { status: 'RUNNING' }),
        run(102, 'generate::loop::2', undefined, { status: 'PENDING' }),
      ],
      [asset(690, { sourceNodeRunId: 90 })],
    );
    expect(resolved.has('generate')).toBe(false);
  });

  it('uses a genuinely newer ordinary successful run instead of older loop outputs', () => {
    const resolved = resolveGeneratedImageAssets(
      33,
      [
        run(201, 'generate', {
          outputs: [archivedImage(801), archivedImage(802)],
        }),
        run(101, 'generate::loop::1', { outputs: [archivedImage(701)] }),
        run(102, 'generate::loop::2', { outputs: [archivedImage(702)] }),
        run(102, 'generate', { outputs: [archivedImage(999)] }),
      ],
      [],
    );
    expect(ids(resolved.get('generate'))).toEqual([801, 802]);
  });

  it('does not fall back to an old base success when newer loop attempts failed', () => {
    const resolved = resolveGeneratedImageAssets(
      33,
      [
        run(90, 'generate', { outputs: [archivedImage(690)] }),
        run(101, 'generate::loop::1', undefined, { status: 'FAILED' }),
        run(102, 'generate::loop::2', undefined, { status: 'SKIPPED' }),
      ],
      [],
    );
    expect(resolved.has('generate')).toBe(false);
  });

  it('retains explicit collection order within the selected final loop iteration', () => {
    const resolved = resolveGeneratedImageAssets(
      33,
      [
        run(
          101,
          'collection::loop::1',
          { assets: [{ assetId: 701 }] },
          { nodeType: 'image-collection' },
        ),
        run(
          102,
          'collection::loop::2',
          { assets: [{ assetId: 703 }, { assetId: 702 }] },
          { nodeType: 'image-collection' },
        ),
      ],
      [asset(701), asset(702), asset(703)],
    );
    expect(ids(resolved.get('collection'))).toEqual([703, 702]);
  });

  it('accepts a safe string asset ID and image MIME metadata without guessing from a URL', () => {
    const resolved = resolveGeneratedImageAssets(
      33,
      [
        run(101, 'generate', {
          outputs: [
            { assetId: '701', url: asset(701).url, mimeType: 'image/png' },
          ],
        }),
      ],
      [],
    );
    expect(ids(resolved.get('generate'))).toEqual([701]);
  });

  it('never creates assets from unarchived provider URLs, unsafe IDs, or other media', () => {
    const invalid = [
      undefined,
      0,
      -1,
      1.2,
      Number.MAX_SAFE_INTEGER + 1,
      'invalid',
    ];
    const resolved = resolveGeneratedImageAssets(
      33,
      [
        run(101, 'generate', {
          outputs: [
            ...invalid.map((assetId) => ({
              type: 'IMAGE',
              assetId,
              url: 'https://provider.test/raw.png',
              mimeType: 'image/png',
            })),
            archivedImage(702, { type: 'VIDEO', mimeType: 'video/mp4' }),
            { assetId: 703, url: 'https://provider.test/unknown.png' },
          ],
        }),
      ],
      [],
    );

    expect(resolved.size).toBe(0);
  });

  it('allows URL-only references only when they match real project images', () => {
    const registered = asset(701);
    const resolved = resolveGeneratedImageAssets(
      33,
      [
        run(101, 'generate', {
          outputs: [{ type: 'IMAGE', url: registered.url }],
        }),
      ],
      [registered],
    );
    expect(resolved.get('generate')).toEqual([registered]);
  });

  it('does not synthesize over known non-image or cross-project assets', () => {
    const resolved = resolveGeneratedImageAssets(
      33,
      [
        run(101, 'generate', {
          outputs: [archivedImage(701), archivedImage(702)],
        }),
      ],
      [asset(701, { kind: 'VIDEO' }), asset(702, { projectId: 34 })],
    );
    expect(resolved.size).toBe(0);
  });

  it('ignores malformed or empty output while keeping known generated assets', () => {
    const runs = [
      run(101, 'broken', undefined, { outputJson: '{broken' }),
      run(102, 'empty'),
      run(103, 'text', { outputs: [{ type: 'TEXT', text: 'hello' }] }),
    ];
    const resolved = resolveGeneratedImageAssets(33, runs, [
      asset(701, { sourceNodeRunId: 101 }),
    ]);
    expect(ids(resolved.get('broken'))).toEqual([701]);
    expect(resolved.has('empty')).toBe(false);
    expect(resolved.has('text')).toBe(false);
  });
});
