import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MyPerformance from './index.vue';

const api = vi.hoisted(() => ({
  acknowledgeResultAdjustment: vi.fn(),
  getMyInstancePage: vi.fn(),
  getMyResultPage: vi.fn(),
  getMyResults: vi.fn(),
  getMyPendingReviews: vi.fn(),
  getMyPendingSupervisorReviews: vi.fn(),
  getInstance: vi.fn(),
  confirmReview: vi.fn(),
  submitReview: vi.fn(),
}));
const confirm = vi.hoisted(() => vi.fn());
vi.mock('#/api/fdmperformance', () => api);
vi.mock('@vben/stores', () => ({ useUserStore: () => ({ userInfo: { id: 7 } }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../shared/PerformanceShell.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({ setup: (_, { slots }) => () => h('main', slots.default?.()) }) };
});
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const content = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) });
  return {
    Button: defineComponent({ setup: (_, { slots, attrs }) => () => h('button', attrs, slots.default?.()) }),
    Descriptions: Object.assign({}, content, { Item: content }),
    Drawer: { render: () => null },
    Empty: { render: () => null },
    Form: Object.assign({}, content, { Item: content }),
    Modal: { confirm },
    Space: content,
    Table: { render: () => null },
    Tabs: Object.assign({}, content, { TabPane: { render: () => null } }),
    Tag: content,
    Textarea: { render: () => null },
    message: { success: vi.fn(), warning: vi.fn() },
  };
});

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).forEach((run) => run()); vi.clearAllMocks(); });

describe('我的绩效结果确认入口', () => {
  it('默认进行中页也显示其他历史分页中的待确认结果，确认后立即移除卡片', async () => {
    const pending = { id: 10, instanceId: 20, userId: 7, periodKey: '2026-10', publicStatus: 1, employeeConfirmed: false, finalScore: 97, grade: 'C+' };
    api.getMyInstancePage.mockResolvedValue({ list: [], total: 0 });
    api.getMyResultPage.mockResolvedValue({ list: [], total: 100 });
    api.getMyPendingReviews.mockResolvedValue([]);
    api.getMyPendingSupervisorReviews.mockResolvedValue([]);
    api.getMyResults.mockResolvedValue([
      pending,
      { ...pending, id: 11, publicStatus: 0 },
      { ...pending, id: 12, userId: 8 },
    ]);
    const container = document.createElement('div');
    const app = createApp(MyPerformance);
    app.mount(container);
    cleanup.push(() => app.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    const buttons = [...container.querySelectorAll('button')].filter((button) => button.textContent === '确认绩效结果');
    expect(buttons).toHaveLength(1);
    expect(container.textContent).toContain('当前考核');
    expect(container.textContent).toContain('2026年10月');
    expect(container.textContent).toContain('绩效结果待本人确认');
    buttons[0]!.click();
    api.getMyResults.mockResolvedValue([{ ...pending, employeeConfirmed: true }]);
    await confirm.mock.calls.at(-1)![0].onOk();
    await nextTick();
    expect(api.acknowledgeResultAdjustment).toHaveBeenCalledWith(10);
    expect(container.textContent).not.toContain('绩效结果待本人确认');
  });
});
