import type { FdmCreativeApi } from '#/api/fdmcreative';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import NodeResultVersionsPanel from './NodeResultVersionsPanel.vue';

vi.mock('@vben/icons', () => ({ IconifyIcon: { render: () => null } }));
vi.mock('ant-design-vue', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const { defineComponent, h } = await import('vue');
  return {
    ...original,
    // Keep real buttons and their native disabled behavior; render modal content locally.
    Modal: defineComponent({
      props: ['open', 'title'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h(
                'section',
                { 'aria-label': props.title, role: 'dialog' },
                slots.default?.(),
              )
            : null,
    }),
  };
});

const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
});

function asset(
  id: number,
  overrides: Partial<FdmCreativeApi.NodeResultAsset> = {},
): FdmCreativeApi.NodeResultAsset {
  return {
    id: String(id),
    name: `图片 ${id}`,
    kind: 'IMAGE',
    availability: 'ACTIVE',
    url: `/result-${id}.png`,
    adopted: false,
    deleteEligible: false,
    ...overrides,
  };
}

function version(
  nodeRunId: number,
  assets: FdmCreativeApi.NodeResultAsset[],
  overrides: Partial<FdmCreativeApi.NodeResultVersion> = {},
): FdmCreativeApi.NodeResultVersion {
  return {
    nodeRunId: String(nodeRunId),
    assets,
    selectionVersion: 1,
    selectionStatus: 'CURRENT',
    model: { name: `模型 ${nodeRunId}` },
    ...overrides,
  };
}

function mountPanel(
  options: {
    canEdit?: boolean;
    autosaveConflict?: boolean;
    versions?: FdmCreativeApi.NodeResultVersion[];
  } = {},
) {
  const onAdopt = vi.fn();
  const onPin = vi.fn();
  const onTool = vi.fn();
  const state = reactive({
    canEdit: true,
    autosaveConflict: false,
    versions: [version(20, [asset(1), asset(2)]), version(10, [asset(3)])],
    ...options,
  });
  const mediaTools: FdmCreativeApi.MediaToolDescriptor[] = [
    {
      id: 'resize',
      label: '调整尺寸',
      available: true,
      applicableAssetKinds: ['IMAGE'],
      localExecution: true,
      generatedNodeType: 'image-resize',
      defaultConfig: {},
      inputPort: 'image',
      outputPlacement: 'RIGHT',
      schemaVersion: 1,
    },
  ];
  const container = document.createElement('div');
  document.body.append(container);
  const app = createApp(
    defineComponent({
      render: () =>
        h(NodeResultVersionsPanel, {
          ...state,
          mediaTools,
          onAdopt,
          onPin,
          onTool,
        }),
    }),
  );
  app.mount(container);
  cleanup.push(() => {
    app.unmount();
    container.remove();
  });
  return { container, state, onAdopt, onPin, onTool };
}

function button(container: Element, label: string) {
  const result = [
    ...container.querySelectorAll<HTMLButtonElement>('button'),
  ].find(
    (item) =>
      item.textContent?.trim() === label ||
      item.getAttribute('aria-label') === label,
  );
  expect(result, `Button not found: ${label}`).toBeDefined();
  return result!;
}

async function click(container: Element, label: string) {
  button(container, label).click();
  await nextTick();
}

describe('node result browsing and comparison', () => {
  it('compares at most two images across versions without adopting either image', async () => {
    const { container, onAdopt, onPin, onTool } = mountPanel();
    await click(container, '加入比较：版本 2 图片 1');
    await click(container, '展开版本 1');
    await click(container, '加入比较：版本 1 图片 3');
    expect(button(container, '加入比较：版本 2 图片 2').disabled).toBe(true);
    await click(container, '并排比较');

    const comparison = container.querySelector(
      '[data-testid="result-compare"]',
    )!;
    expect(
      [...comparison.querySelectorAll('img')].map((item) =>
        item.getAttribute('src'),
      ),
    ).toEqual(['/result-1.png', '/result-3.png']);
    expect(comparison.textContent).toContain('版本 2 · 图片 1');
    expect(comparison.textContent).toContain('模型 10');
    await click(comparison, '比较放大');
    expect(comparison.textContent).toContain('同步缩放 150%');
    expect(
      [
        ...comparison.querySelectorAll<HTMLElement>('.result-compare__surface'),
      ].map((item) => item.style.width),
    ).toEqual(['150%', '150%']);
    expect(onAdopt).not.toHaveBeenCalled();
    expect(onPin).not.toHaveBeenCalled();
    expect(onTool).not.toHaveBeenCalled();

    await click(container, '移出比较：版本 1 图片 3');
    expect(button(container, '加入比较：版本 2 图片 2').disabled).toBe(false);
    expect(button(container, '并排比较').disabled).toBe(true);
  });

  it('allows readonly comparison and preview while blocking every mutation', async () => {
    const { container, onAdopt, onPin, onTool } = mountPanel({
      canEdit: false,
    });
    for (const label of ['采用此图', '固定到画布', '调整尺寸']) {
      const actions = [
        ...container.querySelectorAll<HTMLButtonElement>('button'),
      ].filter((item) => item.textContent?.trim() === label);
      expect(actions.length).toBeGreaterThan(0);
      actions.forEach((item) => {
        expect(item.disabled).toBe(true);
        item.click();
      });
    }
    await click(container, '加入比较：版本 2 图片 1');
    await click(container, '加入比较：版本 2 图片 2');
    await click(container, '并排比较');
    expect(
      container.querySelector('[data-testid="result-compare"]'),
    ).not.toBeNull();
    container
      .querySelector<HTMLButtonElement>('.result-asset__preview')
      ?.click();
    await nextTick();
    expect(
      container.querySelector('[aria-label="结果预览"]')?.textContent,
    ).toContain('正在查看：图片 1');
    expect(onAdopt).not.toHaveBeenCalled();
    expect(onPin).not.toHaveBeenCalled();
    expect(onTool).not.toHaveBeenCalled();
  });

  it('removes an expired selected image and closes stale compare/preview surfaces on refresh', async () => {
    const { container, state } = mountPanel();
    await click(container, '加入比较：版本 2 图片 1');
    await click(container, '加入比较：版本 2 图片 2');
    await click(container, '并排比较');
    container
      .querySelector<HTMLButtonElement>('.result-asset__preview')
      ?.click();
    await nextTick();
    state.versions[0]!.assets[0] = asset(1, {
      availability: 'EXPIRED',
      url: undefined,
      unavailableReason: '素材已过期',
    });
    await nextTick();
    expect(
      container.querySelector('[data-testid="result-compare"]'),
    ).toBeNull();
    expect(container.querySelector('[aria-label="结果预览"]')).toBeNull();
    expect(
      container.querySelector('.result-compare-tray__selections')?.textContent,
    ).not.toContain('图片 1');
    expect(button(container, '加入比较：版本 2 图片 1').disabled).toBe(true);
    const unavailable = container.querySelector(
      '.result-asset.is-unavailable',
    )!;
    expect(unavailable.querySelector('img')).toBeNull();
    expect(button(unavailable, '采用此图').disabled).toBe(true);
    expect(button(unavailable, '固定到画布').disabled).toBe(true);
  });

  it('marks only the adopted asset within its version and submits the clicked image independently of preview or comparison', async () => {
    const { container, onAdopt } = mountPanel({
      versions: [
        version(20, [asset(1), asset(2)], { adoptedNodeRunId: '10' }),
        version(10, [asset(3, { adopted: true }), asset(4)], {
          adoptedNodeRunId: '10',
          adoptedAssetId: '3',
        }),
      ],
    });
    const badges = container.querySelectorAll(
      '[data-testid="contains-adopted-result"]',
    );
    expect(badges).toHaveLength(1);
    expect(badges[0]?.closest('article')?.textContent).toContain('版本 1');
    expect(
      container.querySelectorAll(
        '.result-asset__actions [data-testid="adopted-asset"]',
      ),
    ).toHaveLength(1);
    const adoptedAsset = container
      .querySelector('[data-testid="adopted-asset"]')
      ?.closest('.result-asset');
    expect(adoptedAsset?.textContent).toContain('图片 3');
    const siblingAsset = [...container.querySelectorAll('.result-asset')].find(
      (item) =>
        item
          .querySelector('.result-asset__detail')
          ?.textContent?.includes('图片 4'),
    )!;
    expect(
      siblingAsset.querySelector('[data-testid="adopted-asset"]'),
    ).toBeNull();
    container
      .querySelector<HTMLButtonElement>('.result-asset__preview')
      ?.click();
    await nextTick();
    expect(
      container.querySelector('[aria-label="结果预览"]')?.textContent,
    ).toContain('正在查看：图片 1');
    expect(onAdopt).not.toHaveBeenCalled();
    await click(container, '加入比较：版本 2 图片 1');
    await click(container, '加入比较：版本 1 图片 3');
    expect(onAdopt).not.toHaveBeenCalled();
    await click(siblingAsset, '采用此图');
    expect(onAdopt).toHaveBeenCalledOnce();
    expect(onAdopt.mock.calls[0]?.[0]).toMatchObject({
      asset: { id: '4' },
      version: { nodeRunId: '10' },
    });
  });

  it('blocks edits during a save conflict but preserves comparison of older readable results', async () => {
    const { container, onAdopt, onPin, onTool } = mountPanel({
      autosaveConflict: true,
      versions: [
        version(20, [asset(1), asset(2)], {
          selectionStatus: 'STALE',
          adoptedNodeRunId: '20',
        }),
      ],
    });
    expect(
      container.querySelector('[data-testid="contains-adopted-result"]'),
    ).toBeNull();
    expect(container.textContent).toContain('已采用结果待更新');
    for (const label of ['采用此图', '固定到画布', '调整尺寸']) {
      expect(button(container, label).disabled).toBe(true);
      await click(container, label);
    }
    await click(container, '加入比较：版本 1 图片 1');
    await click(container, '加入比较：版本 1 图片 2');
    expect(button(container, '并排比较').disabled).toBe(false);
    expect(onAdopt).not.toHaveBeenCalled();
    expect(onPin).not.toHaveBeenCalled();
    expect(onTool).not.toHaveBeenCalled();
  });

  it('synchronizes scroll position between comparison panes with different scrollable dimensions', async () => {
    const { container } = mountPanel();
    await click(container, '加入比较：版本 2 图片 1');
    await click(container, '加入比较：版本 2 图片 2');
    await click(container, '并排比较');
    const panes = [
      ...container.querySelectorAll<HTMLElement>('.result-compare__viewport'),
    ];
    Object.defineProperties(panes[0], {
      scrollWidth: { value: 1000 },
      clientWidth: { value: 500 },
      scrollHeight: { value: 1200 },
      clientHeight: { value: 400 },
    });
    Object.defineProperties(panes[1], {
      scrollWidth: { value: 800 },
      clientWidth: { value: 400 },
      scrollHeight: { value: 900 },
      clientHeight: { value: 300 },
    });
    panes[0]!.scrollLeft = 250;
    panes[0]!.scrollTop = 400;
    panes[0]!.dispatchEvent(new Event('scroll'));
    expect(panes[1]!.scrollLeft).toBe(200);
    expect(panes[1]!.scrollTop).toBe(300);
  });
});
