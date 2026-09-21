import type { ConnectedImageReference } from '../connected-image-references';

import type { FdmAiApi } from '#/api/fdmai';
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { createApp, h, nextTick, reactive } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import NodeInlineEditor from './NodeInlineEditor.vue';

vi.mock('@vben/icons', () => ({ IconifyIcon: { render: () => null } }));
vi.mock('#/components/upload', () => ({ FileUpload: { render: () => null } }));
vi.mock('../../../shared/PromptLibraryPicker.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../../../shared/AssetLibraryPicker.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      emits: ['select'],
      setup(_, { emit }) {
        return () =>
          h(
            'button',
            {
              'data-testid': 'choose-library-reference',
              onClick: () =>
                emit('select', [
                  {
                    id: 503,
                    kind: 'IMAGE',
                    name: '新参考图',
                    projectId: 33,
                    url: '/new-reference.svg',
                  },
                ]),
            },
            '选择新参考图',
          );
      },
    }),
  };
});

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

function reference(edgeId: string): ConnectedImageReference {
  return {
    bindingKey: `EDGE:${edgeId}:0`,
    edgeId,
    key: `${edgeId}:pending`,
    name: `参考图 ${edgeId}`,
    sourceNodeId: `source-${edgeId}`,
    sourceNodeName: `参考图 ${edgeId}`,
    sourcePortId: 'asset',
    targetPortId: 'reference',
  };
}

function makeNode(config: Record<string, unknown> = {}) {
  return {
    id: 'generate',
    type: 'image-generate',
    name: '生成产品图',
    config,
    ports: [],
    height: 180,
    width: 260,
    x: 0,
    y: 0,
  } satisfies FdmCreativeApi.WorkflowNode;
}

function mountEditor(
  config: Record<string, unknown> = {},
  connectedReferences: ConnectedImageReference[] = [],
  modelOptions: FdmAiApi.ModelOption[] = [
    {
      id: 901,
      code: 'fixture-image',
      name: '测试图像模型',
      enabled: true,
      modality: 'IMAGE',
      capabilities: ['TEXT_TO_IMAGE', 'IMAGE_TO_IMAGE', 'MULTI_REFERENCE'],
    },
  ],
) {
  const state = reactive({
    connectedReferences,
    node: makeNode(config),
    readonly: false,
    projectAssets: [501, 502].map((id) => ({
      id,
      kind: 'IMAGE' as const,
      name: `素材 ${id}`,
      projectId: 33,
      url: `/reference-${id}.svg`,
    })),
  });
  const onConfigChange = vi.fn((key: string, value: unknown) => {
    state.node.config = { ...state.node.config, [key]: value };
  });
  const onRun = vi.fn();
  const onAssetChange = vi.fn(
    (payload: {
      assets: FdmCreativeApi.CreativeAsset[];
      key: string;
      value: unknown;
    }) => {
      state.node.config = {
        ...state.node.config,
        [payload.key]: payload.value,
      };
      for (const asset of payload.assets) {
        if (!state.projectAssets.some((item) => item.id === asset.id)) {
          state.projectAssets.push(
            asset as (typeof state.projectAssets)[number],
          );
        }
      }
    },
  );
  const container = document.createElement('div');
  document.body.append(container);
  const app = createApp({
    render: () =>
      h(NodeInlineEditor, {
        ...state,
        modelOptions,
        onAssetChange,
        onConfigChange,
        onRun,
        projectId: 33,
      }),
  });
  app.mount(container);
  cleanup.push(() => {
    app.unmount();
    container.remove();
  });
  return { container, onAssetChange, onConfigChange, onRun, state };
}

async function editPrompt(container: HTMLElement, value: string) {
  const textarea = container.querySelector<HTMLTextAreaElement>(
    '.prompt-field textarea',
  )!;
  textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

function aliases(container: HTMLElement) {
  return [...container.querySelectorAll('.reference-alias')].map(
    (element) => element.textContent,
  );
}

describe('node inline editor reference persistence', () => {
  const referenceModels: FdmAiApi.ModelOption[] = [
    {
      id: 901,
      code: 'multi-reference',
      name: '多参考图模型',
      enabled: true,
      modality: 'IMAGE',
      capabilities: ['IMAGE_TO_IMAGE', 'MULTI_REFERENCE'],
    },
    {
      id: 902,
      code: 'text-only',
      name: '仅文生图模型',
      enabled: true,
      modality: 'IMAGE',
      capabilities: ['TEXT_TO_IMAGE'],
    },
    {
      id: 903,
      code: 'single-reference',
      name: '单参考图模型',
      enabled: true,
      modality: 'IMAGE',
      capabilities: ['IMAGE_TO_IMAGE'],
    },
  ];

  it('requires image input capability for a pending edge without selecting a manual asset', async () => {
    const { container, onAssetChange, onConfigChange, onRun, state } =
      mountEditor(
        { logicalModelId: 902, prompt: '参考 @图片1 的构图' },
        [reference('a')],
        referenceModels,
      );
    await nextTick();
    const run = () =>
      container.querySelector<HTMLButtonElement>('.run-button')!;
    expect(aliases(container)).toEqual(['@图片1']);
    expect(container.textContent).toContain('已连接，生成后自动传入');
    expect(
      container.querySelector('.reference-section .section-heading')
        ?.textContent,
    ).toContain('可选：连接上游后自动传入，也可补充素材');
    expect(run().disabled).toBe(true);
    expect(container.textContent).toContain('当前模型不具备此节点所需能力');
    run().click();
    expect(onRun).not.toHaveBeenCalled();

    state.node.config.logicalModelId = 903;
    await nextTick();
    expect(run().disabled).toBe(false);
    run().click();
    expect(onRun).toHaveBeenCalledWith('generate');
    state.connectedReferences = [{ ...reference('a'), assetId: 501 }];
    await nextTick();
    expect(run().disabled).toBe(false);
    expect(container.textContent).toContain('已自动引用');
    expect(state.node.config.referenceAssetIds).toBeUndefined();
    expect(onAssetChange).not.toHaveBeenCalled();
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it('requires multi-reference capability for two pending image-to-image inputs', async () => {
    const { container, onRun, state } = mountEditor(
      { logicalModelId: 903, prompt: '组合 @图片1 和 @图片2' },
      [reference('a'), reference('b')],
      referenceModels,
    );
    state.node.type = 'image-to-image';
    await nextTick();
    const heading = container.querySelector(
      '.reference-section .section-heading',
    )?.textContent;
    expect(heading).toContain('必需：连接上游后自动传入，也可补充素材');
    expect(heading).not.toContain('可选');
    const run = () =>
      container.querySelector<HTMLButtonElement>('.run-button')!;
    expect(run().disabled).toBe(true);
    state.node.config.logicalModelId = 901;
    await nextTick();
    expect(run().disabled).toBe(false);
    run().click();
    expect(onRun).toHaveBeenCalledWith('generate');
    expect(state.node.config.referenceAssetIds).toBeUndefined();
  });

  it.each(['reference', 'first-frame'])(
    'counts the same asset on distinct edge bindings, including target port %s',
    async (targetPortId) => {
      const { container, state } = mountEditor(
        { logicalModelId: 903, prompt: '组合参考图' },
        [
          { ...reference('a'), assetId: 501 },
          { ...reference('b'), assetId: 501, targetPortId },
        ],
        referenceModels,
      );
      state.node.type = 'image-to-image';
      await nextTick();
      const run = () =>
        container.querySelector<HTMLButtonElement>('.run-button')!;
      expect(run().disabled).toBe(true);
      state.node.config.logicalModelId = 901;
      await nextTick();
      expect(run().disabled).toBe(false);
    },
  );

  it('only deduplicates a manual asset against bindings to its configured target port', async () => {
    const { container, state } = mountEditor(
      { logicalModelId: 903, prompt: '参考图', referenceAssetIds: [501, 501] },
      [{ ...reference('a'), assetId: 501 }],
      referenceModels,
    );
    state.node.type = 'image-to-image';
    await nextTick();
    const run = () =>
      container.querySelector<HTMLButtonElement>('.run-button')!;
    expect(run().disabled).toBe(false);
    state.connectedReferences[0]!.targetPortId = 'first-frame';
    await nextTick();
    expect(run().disabled).toBe(true);
  });

  it('labels the planner action as a preview and preserves its run event', async () => {
    const { container, onRun, state } = mountEditor({ prompt: '电商产品主图' });
    state.node.type = 'content-planner';
    await nextTick();
    const button = container.querySelector<HTMLButtonElement>('.run-button')!;
    expect(button.textContent).toContain('预览方案');
    button.click();
    expect(onRun).toHaveBeenCalledWith('generate');
  });

  it('only viewing, receiving references, or switching nodes never writes config', async () => {
    const { container, onConfigChange, state } = mountEditor({}, [
      reference('a'),
    ]);
    await nextTick();
    expect(aliases(container)).toEqual(['@图片1']);
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(state.node.config).toEqual({});

    state.connectedReferences = [reference('a'), reference('b')];
    await nextTick();
    expect(aliases(container)).toEqual(['@图片1', '@图片2']);
    state.node = { ...makeNode({ prompt: '另一节点' }), id: 'other' };
    state.connectedReferences = [reference('c')];
    await nextTick();
    expect(aliases(container)).toEqual(['@图片1']);
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(state.node.config).toEqual({ prompt: '另一节点' });
  });

  it('persists the displayed mapping on actual prompt edits, without rewriting unchanged values', async () => {
    const { container, onConfigChange, state } = mountEditor(
      { prompt: '产品背景' },
      [reference('a')],
    );
    await nextTick();
    await editPrompt(container, '参考 @图片1 的构图');
    expect(onConfigChange.mock.calls).toEqual([
      ['promptReferenceBindings', [{ alias: '图片1', bindingKey: 'EDGE:a:0' }]],
      ['prompt', '参考 @图片1 的构图'],
    ]);
    expect(state.node.config.prompt).toBe('参考 @图片1 的构图');
    await editPrompt(container, '参考 @图片1 的构图');
    expect(onConfigChange).toHaveBeenCalledTimes(2);
  });

  it('freezes aliases before removing a reference and assigns a fresh alias when adding another', async () => {
    const { container, onConfigChange, onAssetChange, state } = mountEditor({
      prompt: '参考 @图片2 的色彩',
      referenceAssetIds: [501, 502],
    });
    await nextTick();
    expect(onConfigChange).not.toHaveBeenCalled();
    container
      .querySelector<HTMLButtonElement>('[aria-label="移除参考素材"]')!
      .click();
    await nextTick();
    expect(onAssetChange).toHaveBeenCalledTimes(1);
    expect(state.node.config.referenceAssetIds).toEqual([502]);
    expect(aliases(container)).toEqual(['@图片2']);
    expect(state.node.config.promptReferenceBindings).toEqual([
      { alias: '图片1', bindingKey: 'ASSET:501' },
      { alias: '图片2', bindingKey: 'ASSET:502' },
    ]);

    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="choose-library-reference"]',
      )!
      .click();
    await nextTick();
    expect(aliases(container)).toEqual(['@图片2', '@图片3']);
    expect(state.node.config.referenceAssetIds).toEqual([502, 503]);
    expect(state.node.config.promptReferenceBindings).toEqual([
      { alias: '图片1', bindingKey: 'ASSET:501' },
      { alias: '图片2', bindingKey: 'ASSET:502' },
      { alias: '图片3', bindingKey: 'ASSET:503' },
    ]);
    expect(state.node.config.prompt).toBe('参考 @图片2 的色彩');
  });

  it('retains stored aliases and disconnected bindings when the prompt adds a new reference', async () => {
    const stored = [
      { alias: '图片1', bindingKey: 'EDGE:removed:0' },
      { alias: '图片7', bindingKey: 'EDGE:b:0' },
    ];
    const { container, onConfigChange, state } = mountEditor(
      { promptReferenceBindings: stored },
      [reference('b'), reference('c')],
    );
    await nextTick();
    expect(aliases(container)).toEqual(['@图片7', '@图片8']);
    expect(onConfigChange).not.toHaveBeenCalled();
    await editPrompt(container, '组合 @图片7 和 @图片8');
    expect(state.node.config.promptReferenceBindings).toEqual([
      ...stored,
      { alias: '图片8', bindingKey: 'EDGE:c:0' },
    ]);
  });

  it('does not persist derived bindings through readonly picker or prompt events', async () => {
    const { container, onAssetChange, onConfigChange, state } = mountEditor(
      {},
      [reference('a')],
    );
    state.readonly = true;
    await nextTick();
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="choose-library-reference"]',
      )!
      .click();
    await editPrompt(container, '参考 @图片1');
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(onAssetChange).not.toHaveBeenCalled();
  });
});
