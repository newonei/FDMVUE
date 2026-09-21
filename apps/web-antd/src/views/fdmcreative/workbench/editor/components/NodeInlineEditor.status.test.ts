import type { FdmCreativeApi } from '#/api/fdmcreative';

import { createApp, h, nextTick, reactive } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import NodeInlineEditor from './NodeInlineEditor.vue';

vi.mock('@vben/icons', () => ({ IconifyIcon: { render: () => null } }));
vi.mock('#/components/upload', () => ({ FileUpload: { render: () => null } }));
vi.mock('../../../shared/AssetLibraryPicker.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../../../shared/PromptLibraryPicker.vue', () => ({
  default: { render: () => null },
}));

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

function mountEditor(
  options: {
    busy?: boolean;
    executionStatus?: FdmCreativeApi.ExecutionStatus;
    nodeRun?: FdmCreativeApi.NodeRun;
  } = {},
) {
  const onRun = vi.fn();
  const onRunDownstream = vi.fn();
  const state = reactive({
    busy: false,
    executionStatus: 'PARTIAL_SUCCESS' as FdmCreativeApi.ExecutionStatus,
    nodeRun: undefined as FdmCreativeApi.NodeRun | undefined,
    ...options,
  });
  const node: FdmCreativeApi.WorkflowNode = {
    id: 'new-image-input',
    type: 'image-input',
    name: '刚导入的产品图',
    config: { assetId: 501 },
    ports: [{ direction: 'OUTPUT', id: 'asset', type: 'image-asset' }],
    x: 0,
    y: 0,
    width: 260,
    height: 180,
  };
  const container = document.createElement('div');
  document.body.append(container);
  const app = createApp({
    render: () =>
      h(NodeInlineEditor, {
        ...state,
        node,
        onRun,
        onRunDownstream,
        projectId: 33,
        projectAssets: [
          {
            id: 501,
            projectId: 33,
            kind: 'IMAGE',
            name: '产品图',
            url: '/fixture-product.svg',
          },
        ],
      }),
  });
  app.mount(container);
  cleanup.push(() => {
    app.unmount();
    container.remove();
  });
  return { container, onRun, onRunDownstream, state };
}

describe('node inline editor execution status', () => {
  it.each(['PARTIAL_SUCCESS', 'FAILED', 'RUNNING', 'SUCCEEDED'] as const)(
    'keeps a node without its own run idle when the project task is %s',
    async (executionStatus) => {
      const { container, onRun } = mountEditor({ executionStatus });
      await nextTick();
      expect(container.querySelector('.status-tag')?.textContent).toContain(
        '待运行',
      );
      const runButton =
        container.querySelector<HTMLButtonElement>('.run-button')!;
      expect(runButton.disabled).toBe(executionStatus === 'RUNNING');
      runButton.click();
      if (executionStatus === 'RUNNING') expect(onRun).not.toHaveBeenCalled();
      else expect(onRun).toHaveBeenCalledWith('new-image-input');
    },
  );

  it('uses the current node run, and returns to idle when that run is cleared', async () => {
    const { container, state } = mountEditor({
      executionStatus: 'PARTIAL_SUCCESS',
      nodeRun: {
        id: 81,
        nodeId: 'new-image-input',
        status: 'FAILED',
        errorMessage: '本节点失败',
      },
    });
    await nextTick();
    expect(container.querySelector('.status-tag')?.textContent).toContain(
      '执行失败',
    );
    state.nodeRun = { id: 82, nodeId: 'new-image-input', status: 'SUCCEEDED' };
    await nextTick();
    expect(container.querySelector('.status-tag')?.textContent).toContain(
      '已完成',
    );
    state.nodeRun = undefined;
    await nextTick();
    expect(container.querySelector('.status-tag')?.textContent).toContain(
      '待运行',
    );
  });

  it('distinguishes request submission from the active node run', async () => {
    const { container, state } = mountEditor({ busy: true });
    await nextTick();
    expect(container.querySelector('.status-tag')?.textContent).toContain(
      '待运行',
    );
    expect(container.querySelector('.run-button')?.textContent).toContain(
      '提交中',
    );
    expect(
      container.querySelector<HTMLButtonElement>('.run-button')?.disabled,
    ).toBe(true);
    state.busy = false;
    state.executionStatus = 'RUNNING';
    state.nodeRun = { id: 83, nodeId: 'new-image-input', status: 'WAITING_AI' };
    await nextTick();
    expect(container.querySelector('.status-tag')?.textContent).toContain(
      '模型生成中',
    );
    expect(
      container.querySelector<HTMLButtonElement>('.run-button')?.disabled,
    ).toBe(true);
  });

  it.each(['CANCELED', 'FAILED', 'PARTIAL_SUCCESS', 'SUCCEEDED'] as const)(
    'unlocks consecutive runs when the task becomes %s despite stale active node state',
    async (executionStatus) => {
      const { container, onRun, onRunDownstream, state } = mountEditor({
        executionStatus: 'RUNNING',
        nodeRun: { id: 84, nodeId: 'new-image-input', status: 'WAITING_AI' },
      });
      const run = () =>
        container.querySelector<HTMLButtonElement>('.run-button')!;
      const downstream = () =>
        container.querySelector<HTMLButtonElement>('.downstream-button')!;
      await nextTick();
      expect(run().disabled).toBe(true);
      expect(downstream().disabled).toBe(true);
      state.executionStatus = executionStatus;
      await nextTick();
      expect(container.querySelector('.status-tag')?.textContent).toContain(
        '任务已结束',
      );
      expect(run().textContent).toContain('仅运行此节点');
      expect(run().disabled).toBe(false);
      expect(downstream().disabled).toBe(false);
      run().click();
      downstream().click();
      expect(onRun).toHaveBeenCalledOnce();
      expect(onRunDownstream).toHaveBeenCalledOnce();

      state.busy = true;
      await nextTick();
      expect(run().disabled).toBe(true);
      state.busy = false;
      state.executionStatus = 'RUNNING';
      await nextTick();
      expect(run().disabled).toBe(true);
      state.executionStatus = executionStatus;
      await nextTick();
      expect(run().disabled).toBe(false);
      run().click();
      expect(onRun).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['SUCCEEDED', 'FAILED', 'CANCELED', 'SKIPPED', 'STALE'] as const)(
    'keeps finished node %s blocked while its task is active and releases it afterward',
    async (status) => {
      const { container, onRun, state } = mountEditor({
        executionStatus: 'RUNNING',
        nodeRun: { id: 85, nodeId: 'new-image-input', status },
      });
      const run = () =>
        container.querySelector<HTMLButtonElement>('.run-button')!;
      await nextTick();
      expect(run().textContent).toContain('任务运行中');
      expect(run().disabled).toBe(true);
      run().click();
      expect(onRun).not.toHaveBeenCalled();
      state.executionStatus = 'PARTIAL_SUCCESS';
      await nextTick();
      expect(run().disabled).toBe(false);
      run().click();
      expect(onRun).toHaveBeenCalledWith('new-image-input');
    },
  );
});
