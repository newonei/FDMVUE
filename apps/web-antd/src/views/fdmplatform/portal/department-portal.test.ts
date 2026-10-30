/* eslint-disable vue/one-component-per-file -- Stubs stand in for the host page shell and route pages. */
import type { PortalSummary } from '#/api/fdmplatform/portal';

import { createApp, defineComponent, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, describe, expect, it, vi } from 'vitest';

import DepartmentPortal from './DepartmentPortal.vue';

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
  department: 'trade',
  generatedAt: '2026-09-29T02:00:00Z',
  month: '2026-09',
  todos: [
    { key: 'draft', count: 1, preview: 'HT-1 · 缺成交单价', contractId: 'c1' },
    {
      key: 'receipt',
      count: 2,
      preview: 'HT-2 · USD 10 待确认',
      contractId: 'c2',
    },
    { key: 'history', count: 11_708, preview: '金智导入合同' },
  ],
  metrics: {
    activeContracts: 3,
    newThisMonth: 1,
    signedThisMonth: { USD: 1000 },
    confirmedReceipts: {},
    pendingReceipts: { USD: 10 },
    unpaid: { USD: 3000, CNY: 500 },
  },
  trend: { months: ['2026-08', '2026-09'], series: { USD: [0, 1000] } },
  contracts: [],
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
      { path: '/fdmwaimao/platform-portal', component: page },
      { path: '/fdmwaimao/platform-contracts', component: page },
      { path: '/fdmwaimao/platform-customers', component: page },
    ],
  });
  await router.push('/fdmwaimao/platform-portal');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(DepartmentPortal, { department: 'trade' }),
  });
  app.use(router);
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  await vi.waitFor(() =>
    expect(host.textContent).toContain('有 3 件事等待处理'),
  );
  return { host, router };
}

describe('department portal page', () => {
  it('greets the user, shows todos with counts and keeps currencies apart', async () => {
    const { host } = await mount();
    expect(mocks.summary).toHaveBeenCalledWith('trade');
    expect(host.textContent).toContain('Owen，');
    expect(host.querySelector('[data-todo="receipt"]')?.textContent).toContain(
      '2',
    );
    expect(
      host.querySelector('[data-todo="receipt"]')?.classList.contains('hot'),
    ).toBe(true);
    expect(host.querySelector('[data-todo="quote"]')?.textContent).toContain(
      '报价都在有效期内',
    );
    expect(host.textContent).toContain('USD 3,000');
    expect(host.textContent).toContain('CNY 500');
  });

  it('lists only functions the user can open and follows todo links', async () => {
    const { host, router } = await mount();
    const functions = [...host.querySelectorAll('.fn b')].map(
      (item) => item.textContent,
    );
    expect(functions).toEqual(['客户管理', '合同订单']);
    host.querySelector<HTMLButtonElement>('[data-todo="draft"]')!.click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe(
        '/fdmwaimao/platform-contracts?contractId=c1',
      ),
    );
    await nextTick();
  });
});
