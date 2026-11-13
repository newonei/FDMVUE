import { createApp, h, KeepAlive, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HrReviewQueue from './HrReviewQueue.vue';

const api = vi.hoisted(() => ({
  batchHrReview: vi.fn(),
  getHrReviewPendingPage: vi.fn(),
}));

vi.mock('#/api/fdmperformance', () => api);
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const content = defineComponent({
    setup(_props, { slots }) {
      return () => h('div', slots.default?.());
    },
  });
  return {
    Button: defineComponent({
      setup(_props, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.());
      },
    }),
    Popconfirm: content,
    Space: content,
    Tag: content,
    Table: defineComponent({
      props: ['pagination', 'rowSelection', 'dataSource'],
      emits: ['change'],
      setup(props, { emit }) {
        return () =>
          h('section', [
            h('output', { 'aria-label': '当前页码' }, props.pagination.current),
            h(
              'output',
              { 'aria-label': '考核人员' },
              props.dataSource
                .map((row: { userName: string }) => row.userName)
                .join(','),
            ),
            h(
              'button',
              {
                onClick: () =>
                  emit('change', {
                    current: 3,
                    pageSize: props.pagination.pageSize,
                  }),
              },
              '翻到第三页',
            ),
            h(
              'button',
              { onClick: () => props.rowSelection.onChange([1]) },
              '勾选第一条',
            ),
          ]);
      },
    }),
    message: { success: vi.fn(), warning: vi.fn() },
  };
});

const cleanup: Array<() => void> = [];

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

async function mount(initialActive = true) {
  const visible = ref(true);
  const active = ref(initialActive);
  const container = document.createElement('div');
  document.body.append(container);
  const app = createApp({
    setup() {
      return () =>
        h(KeepAlive, null, {
          default: () =>
            visible.value
              ? h(HrReviewQueue, { active: active.value })
              : h('div', '详情'),
        });
    },
  });
  app.mount(container);
  cleanup.push(() => {
    app.unmount();
    container.remove();
  });
  await settle();
  return {
    container,
    async setActive(value: boolean) {
      active.value = value;
      await settle();
    },
    async navigateToDetail() {
      visible.value = false;
      await settle();
    },
    async returnToQueue() {
      visible.value = true;
      await settle();
    },
    async click(text: string) {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === text)!
        .click();
      await settle();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getHrReviewPendingPage.mockResolvedValue({
    list: [{ instanceId: 1, batchId: 2, taskId: 'task-1', userName: '李晨' }],
    total: 100,
  });
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

describe('待人事审核队列缓存恢复', () => {
  it('首次仅加载一次，返回刷新并清空勾选，数据减少回退到最后有效页', async () => {
    const queue = await mount();
    expect(api.getHrReviewPendingPage).toHaveBeenCalledOnce();
    await queue.click('翻到第三页');
    await queue.click('勾选第一条');
    expect(queue.container.textContent).toContain('已选择 1 项');
    await queue.navigateToDetail();
    api.getHrReviewPendingPage.mockClear();
    api.getHrReviewPendingPage.mockResolvedValue({ list: [], total: 15 });

    await queue.returnToQueue();

    expect(api.getHrReviewPendingPage).toHaveBeenNthCalledWith(1, {
      pageNo: 3,
      pageSize: 10,
    });
    expect(api.getHrReviewPendingPage).toHaveBeenNthCalledWith(2, {
      pageNo: 2,
      pageSize: 10,
    });
    expect(
      queue.container.querySelector('[aria-label="当前页码"]')?.textContent,
    ).toBe('2');
    expect(queue.container.textContent).toContain('已选择 0 项');
    expect(queue.container.textContent).toContain('共 15 条');
  });

  it('未选中的页签不加载，切回页签加载，缓存返回仍按 active 控制请求', async () => {
    const queue = await mount(false);
    expect(api.getHrReviewPendingPage).not.toHaveBeenCalled();

    await queue.setActive(true);
    expect(api.getHrReviewPendingPage).toHaveBeenCalledOnce();
    await queue.setActive(false);
    await queue.navigateToDetail();
    await queue.returnToQueue();
    expect(api.getHrReviewPendingPage).toHaveBeenCalledOnce();

    await queue.setActive(true);
    expect(api.getHrReviewPendingPage).toHaveBeenCalledTimes(2);
  });

  it('离开前未完成的请求不能覆盖返回后新加载的记录', async () => {
    let finishOldRequest!: (value: unknown) => void;
    api.getHrReviewPendingPage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldRequest = resolve;
        }),
    );
    const queue = await mount();
    await queue.navigateToDetail();
    api.getHrReviewPendingPage.mockResolvedValue({
      list: [
        { instanceId: 2, batchId: 2, taskId: 'task-2', userName: '最新记录' },
      ],
      total: 1,
    });
    await queue.returnToQueue();
    expect(queue.container.textContent).toContain('最新记录');

    finishOldRequest({ list: [{ userName: '离开前旧记录' }], total: 50 });
    await settle();

    expect(queue.container.textContent).toContain('最新记录');
    expect(queue.container.textContent).not.toContain('离开前旧记录');
    expect(queue.container.textContent).toContain('共 1 条');
  });
});
