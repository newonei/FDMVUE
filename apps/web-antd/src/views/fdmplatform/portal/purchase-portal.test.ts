/* eslint-disable vue/one-component-per-file -- Stubs stand in for the host page shell and route pages. */
import type { PortalSummary } from '#/api/fdmplatform/portal';

import { createApp, defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, describe, expect, it, vi } from 'vitest';

import PurchasePortal from './PurchasePortal.vue';

const mocks = vi.hoisted(() => ({ summary: vi.fn() }));
vi.mock('#/api/fdmplatform/portal', () => ({
  getPortalSummary: mocks.summary,
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));
vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userInfo: { realName: 'Owen' } }),
}));

const summary: PortalSummary = {
  department: 'purchase',
  generatedAt: '2026-10-08T02:00:00Z',
  month: '2026-10',
  todos: [
    { key: 'intake', count: 3, preview: 'HT-1 · 测试' },
    { key: 'quote', count: 2, preview: 'HT-2 · EVA瑜伽柱' },
    { key: 'plan', count: 1, preview: '' },
    { key: 'order', count: 1, preview: '' },
    { key: 'arrival', count: 0, preview: '' },
    {
      key: 'sign',
      count: 1,
      preview: 'CG-1 · 工厂甲',
      contractId: 'c1',
      orderId: 'po1',
    },
    { key: 'transit', count: 4, preview: 'CG-1 · 工厂甲' },
    { key: 'pay', count: 0, preview: '' },
    { key: 'customs', count: 0, preview: '' },
  ],
  metrics: {
    orders: 5,
    openOrders: 4,
    awaitingLines: 6,
    overdueTasks: 2,
    soonTasks: 0,
    orderedThisMonth: { CNY: 1200 },
    unpaid: { CNY: 500, USD: 10 },
  },
  trend: { months: [], series: {} },
  tasks: [
    {
      key: 't1',
      stage: 'quote',
      kind: 'tasks',
      title: '甲、乙',
      dueDate: '2000-01-01',
      ownerUserIds: [1],
      row: {
        id: 'task',
        contractId: 'c1',
        contractCode: 'HT-1',
        contractName: '订单',
        contractVersion: 1,
        companyId: 1,
        allowedActions: [],
        contractStatus: 'EXECUTING',
        customerName: 'Koreasports',
        record: { id: 'task' },
      },
    },
  ],
  purchasing: {
    months: ['2025-11', '2025-12'],
    monthly: [100, 300],
    currency: 'CNY',
    recent12Amount: 58_283_078,
    recent12Orders: 4102,
    activeSuppliers: 254,
    asOf: '2026-10-08',
    topSuppliers: [
      { id: 's1', name: '四联创业集团', amount: 6_899_271, orders: 32 },
    ],
  },
};
const disposals: (() => void)[] = [];
afterEach(() => {
  while (disposals.length > 0) disposals.pop()!();
});
async function mount() {
  mocks.summary.mockResolvedValue(summary);
  const page = defineComponent({ render: () => h('div') });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      '/fdmprocurement/platform-portal',
      '/fdmprocurement/platform-tasks',
      '/fdmprocurement/platform-orders',
      '/fdmprocurement/platform-suppliers',
      '/fdmprocurement/platform-customs',
    ].map((path) => ({ path, component: page })),
  });
  await router.push('/fdmprocurement/platform-portal');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(PurchasePortal) });
  app.use(router);
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  await vi.waitFor(() => expect(host.textContent).toContain('2 件已超期'));
  return { host, router };
}
function step(host: HTMLElement, key: string) {
  return host.querySelector<HTMLButtonElement>(`[data-step="${key}"]`)!;
}

describe('purchase portal', () => {
  it('shows the buyer pipeline in order and sums plan and order into 待下单', async () => {
    const { host } = await mount();
    expect(mocks.summary).toHaveBeenCalledWith('purchase');
    expect(host.textContent).toContain('3 条申请等你接单');
    const labels = [...host.querySelectorAll('[data-step] span')].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual([
      '待接单',
      '待报价',
      '待下单',
      '待签回',
      '在途',
      '待付款',
      '报关中',
    ]);
    expect(step(host, 'order').textContent).toContain('2');
    expect(step(host, 'quote').classList.contains('hot')).toBe(true);
    expect(step(host, 'pay').classList.contains('zero')).toBe(true);
  });
  it('opens the single unsigned order directly and other steps as filtered lists', async () => {
    const { host, router } = await mount();
    step(host, 'sign').click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.query).toEqual({
        contractId: 'c1',
        documentId: 'po1',
      }),
    );
    step(host, 'quote').click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe(
        '/fdmprocurement/platform-tasks?stage=quote&mine=true',
      ),
    );
  });
  it('shows department purchasing with 金智 history, top suppliers and due risk', async () => {
    const { host, router } = await mount();
    expect(host.textContent).toContain('¥5,828.3 万');
    expect(host.textContent).toContain('254 家供应商');
    expect(host.textContent).toContain('四联创业集团');
    expect(host.textContent).toContain('甲 等 2 项');
    expect(host.textContent).toMatch(/超期 \d+ 天/);
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('已超期 2'))!
      .click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.query).toEqual({
        due: 'overdue',
        mine: 'true',
      }),
    );
  });
});
