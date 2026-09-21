import type { FdmCreativeApi } from '#/api/fdmcreative';

import { createApp, h, nextTick, reactive } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ExecutionTaskPanel from './ExecutionTaskPanel.vue';

vi.mock('@vben/icons', () => ({ IconifyIcon: { render: () => null } }));

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function node(
  id: number,
  status: FdmCreativeApi.NodeRunStatus,
  extra: Partial<FdmCreativeApi.NodeRun> = {},
): FdmCreativeApi.NodeRun {
  return { id, nodeId: `node-${id}`, status, ...extra };
}

function task(
  id = 100,
  status: FdmCreativeApi.ExecutionStatus = 'RUNNING',
  nodeRuns: FdmCreativeApi.NodeRun[] = [],
): FdmCreativeApi.ExecutionDetail {
  return {
    id,
    projectId: 33,
    status,
    totalNodeCount: nodeRuns.length,
    nodeRuns,
  };
}

function mountPanel(
  options: {
    allowCancel?: boolean;
    allowRetry?: boolean;
    busy?: boolean;
    currentExecutionId?: number;
    execution?: FdmCreativeApi.ExecutionDetail;
    history?: FdmCreativeApi.Execution[];
    historyError?: string;
    historyHasMore?: boolean;
    nodeNames?: Record<string, string>;
    syncError?: string;
  } = {},
) {
  const events = {
    onCancel: vi.fn(),
    onLoadMore: vi.fn(),
    onLocate: vi.fn(),
    onRefresh: vi.fn(),
    onRetry: vi.fn(),
    onSelectExecution: vi.fn(),
  };
  const state = reactive({ ...options });
  const container = document.createElement('div');
  document.body.append(container);
  const app = createApp({
    render: () =>
      h(ExecutionTaskPanel, { variant: 'panel', ...state, ...events }),
  });
  app.mount(container);
  cleanups.push(() => {
    app.unmount();
    container.remove();
  });
  return { container, state, ...events };
}

function findButton(container: Element, label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) =>
      item.textContent?.replace(/\s+/g, '') === label.replace(/\s+/g, '') ||
      item.getAttribute('aria-label') === label,
  );
}

async function click(container: Element, label: string) {
  const button = findButton(container, label);
  expect(button, `Button not found: ${label}`).toBeDefined();
  button!.click();
  await nextTick();
}

describe('execution task panel', () => {
  it('shows completed skipped/canceled nodes without presenting a failed task as successful', async () => {
    const { container } = mountPanel({
      execution: task(100, 'FAILED', [
        node(1, 'SUCCEEDED'),
        node(2, 'FAILED', { errorMessage: '模型调用失败' }),
        node(3, 'SKIPPED'),
        node(4, 'CANCELED'),
      ]),
    });
    await nextTick();
    expect(
      container.querySelector('.task-panel__summary')?.textContent,
    ).toContain('已结束 4/4 个节点');
    expect(
      container.querySelector('.task-panel__summary')?.textContent,
    ).toContain('失败');
    expect(
      container.querySelector('.ant-progress-status-exception'),
    ).not.toBeNull();
    expect(container.querySelector('.task-run__error')?.textContent).toBe(
      '模型调用失败',
    );
    expect(container.textContent).toContain('已跳过');
    expect(container.textContent).toContain('已取消');
    await click(container, '全部节点');
    expect(
      container.querySelectorAll('.task-panel__runs article'),
    ).toHaveLength(1);
    expect(
      container.querySelector('.task-panel__runs article')?.textContent,
    ).toContain('模型调用失败');
  });

  it('keeps readonly inspection available without cancel/retry controls', async () => {
    const { container, onLocate, onRetry, onCancel } = mountPanel({
      execution: task(100, 'RUNNING', [node(12, 'FAILED')]),
    });
    await nextTick();
    expect(findButton(container, '按原参数重试')).toBeUndefined();
    expect(findButton(container, '取消此任务')).toBeUndefined();
    await click(container, '定位节点：node-12');
    expect(onLocate).toHaveBeenCalledWith('node-12');
    expect(onRetry).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each(['CANCEL_REQUESTED', 'CANCELED'] as const)(
    'does not expose retry or another cancel for %s',
    async (status) => {
      const { container } = mountPanel({
        allowCancel: true,
        allowRetry: true,
        execution: task(100, status, [node(12, 'FAILED')]),
      });
      await nextTick();
      expect(findButton(container, '按原参数重试')).toBeUndefined();
      expect(findButton(container, '取消此任务')).toBeUndefined();
    },
  );

  it('locates the loop base node but retries the actual failed iteration run', async () => {
    const failed = node(902, 'FAILED', {
      nodeId: 'product-photo::loop::3',
      attemptNo: 2,
    });
    const { container, onLocate, onRetry, onCancel } = mountPanel({
      allowRetry: true,
      nodeNames: { 'product-photo': '商品主图' },
      execution: task(100, 'PARTIAL_SUCCESS', [
        node(901, 'SUCCEEDED', { nodeId: 'product-photo::loop::2' }),
        failed,
      ]),
    });
    await nextTick();
    expect(
      [...container.querySelectorAll('button')].filter(
        (item) => item.textContent?.trim() === '按原参数重试',
      ),
    ).toHaveLength(1);
    await click(container, '定位节点：商品主图 · 第 3 轮');
    expect(onLocate).toHaveBeenCalledWith('product-photo');
    await click(container, '按原参数重试');
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry.mock.calls[0]?.[0]).toMatchObject({
      id: 902,
      nodeId: 'product-photo::loop::3',
      status: 'FAILED',
      attemptNo: 2,
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('blocks repeated retry/cancel actions while a request is pending', async () => {
    const { container, onCancel, onRetry } = mountPanel({
      allowCancel: true,
      allowRetry: true,
      busy: true,
      execution: task(100, 'RUNNING', [node(12, 'FAILED')]),
    });
    await nextTick();
    expect(findButton(container, '按原参数重试')?.disabled).toBe(true);
    expect(findButton(container, '取消此任务')?.disabled).toBe(true);
    await click(container, '按原参数重试');
    await click(container, '取消此任务');
    expect(onCancel).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('selects an older task without retrying or canceling it', async () => {
    const current = task(100, 'RUNNING', [node(12, 'FAILED')]);
    const historical = task(90, 'FAILED', [node(11, 'FAILED')]);
    const { container, state, onSelectExecution, onCancel, onRetry } =
      mountPanel({
        allowCancel: true,
        allowRetry: true,
        currentExecutionId: 100,
        execution: current,
        history: [current, historical],
      });
    await nextTick();
    container
      .querySelector('.ant-select-selector')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const option = [
      ...document.body.querySelectorAll<HTMLElement>('.ant-select-item-option'),
    ].find((item) => item.textContent?.includes('#90'));
    expect(option).toBeDefined();
    option!.click();
    await nextTick();
    expect(onSelectExecution).toHaveBeenCalledWith(90);
    state.execution = historical;
    await nextTick();
    expect(container.querySelector('.task-hint')?.textContent).toContain(
      '正在查看历史任务',
    );
    expect(onCancel).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('keeps empty/history-error states visible and offers refresh and paging independently', async () => {
    const { container, onRefresh, onLoadMore, onCancel, onRetry } = mountPanel({
      historyError: '任务记录加载失败，请点击刷新重试',
      historyHasMore: true,
    });
    await nextTick();
    expect(container.textContent).toContain('还没有运行任务');
    expect(container.querySelector('.ant-alert')?.textContent).toContain(
      '任务记录加载失败',
    );
    await click(container, '刷新');
    await click(container, '加载更早的任务');
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('distinguishes an accepted task awaiting details from an empty task history', async () => {
    const { container, state, onCancel, onRetry, onSelectExecution } =
      mountPanel({
        allowCancel: true,
        allowRetry: true,
        currentExecutionId: 123,
      });
    await nextTick();
    expect(container.textContent).toContain('正在读取任务 #123');
    expect(container.textContent).not.toContain('还没有运行任务');
    expect(findButton(container, '取消此任务')).toBeUndefined();
    expect(findButton(container, '按原参数重试')).toBeUndefined();

    state.execution = task(123, 'RUNNING', [
      node(1, 'SUCCEEDED'),
      node(2, 'RUNNING'),
    ]);
    await nextTick();
    expect(container.textContent).not.toContain('正在读取任务 #123');
    expect(
      container.querySelector('.task-panel__summary')?.textContent,
    ).toContain('已结束 1/2 个节点');
    expect(findButton(container, '取消此任务')).toBeDefined();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
    expect(onSelectExecution).not.toHaveBeenCalled();
  });

  it('recovers a synchronization warning without clearing actual task and history failures', async () => {
    const { container, state, onRefresh, onRetry, onCancel } = mountPanel({
      currentExecutionId: 123,
      execution: task(123, 'FAILED', [
        node(12, 'FAILED', { errorMessage: '模型额度不足' }),
      ]),
      historyError: '任务记录加载失败，请点击刷新重试',
      syncError:
        '任务 #123 的状态暂时无法读取，正在自动重连。任务不会因此重新提交。',
    });
    await nextTick();
    expect(container.querySelectorAll('.ant-alert-warning')).toHaveLength(2);
    expect(container.textContent).toContain('任务不会因此重新提交');
    expect(container.querySelector('.task-run__error')?.textContent).toBe(
      '模型额度不足',
    );
    await click(container, '刷新');
    expect(onRefresh).toHaveBeenCalledOnce();

    state.syncError = '';
    state.execution = task(123, 'FAILED', [
      node(12, 'FAILED', { errorMessage: '模型额度不足' }),
      node(13, 'SKIPPED'),
    ]);
    await nextTick();
    expect(container.querySelectorAll('.ant-alert-warning')).toHaveLength(1);
    expect(container.textContent).not.toContain('正在自动重连');
    expect(container.textContent).toContain('任务记录加载失败');
    expect(container.querySelector('.task-run__error')?.textContent).toBe(
      '模型额度不足',
    );
    expect(
      container.querySelector('.task-panel__summary')?.textContent,
    ).toContain('已结束 2/2 个节点');
    expect(
      container.querySelector('.ant-progress-status-exception'),
    ).not.toBeNull();
    expect(onRetry).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
