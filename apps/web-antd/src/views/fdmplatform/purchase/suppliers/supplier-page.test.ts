/* eslint-disable vue/one-component-per-file -- Small adapters stand in for antd and the host shell. */
import type { PropType } from 'vue';

import { createApp, defineComponent, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SupplierPage from './index.vue';

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  overview: vi.fn(),
  download: vi.fn(),
}));
vi.mock('#/api/fdmplatform/supplier-stats', () => ({
  getSupplierStatsPage: mocks.page,
  getSupplierOverview: mocks.overview,
}));
vi.mock('#/api/fdmplatform', () => ({
  saveMasterData: vi.fn(),
  updateMasterData: vi.fn(),
}));
vi.mock('#/api/fdmplatform/masters', () => ({ getMasterRecord: vi.fn() }));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));
vi.mock('@vben/utils', () => ({
  downloadFileFromBlobPart: mocks.download,
  formatDate: () => '20261008',
}));
vi.mock('../../components/ActionDialog.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../manage/components/SupplierContacts.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./SupplierSnapshotPanel.vue', () => ({
  default: defineComponent({
    props: { supplier: { type: Object, default: undefined } },
    setup: (props) => () =>
      h('section', { 'data-snapshot': props.supplier?.id }),
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.slots.default?.()),
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: undefined } },
      setup: (props) => () => h('p', props.message),
    }),
    Button: defineComponent({
      props: { loading: Boolean },
      setup: (props, ctx) => () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.loading },
          ctx.slots.default?.(),
        ),
    }),
    Card: block,
    Drawer: block,
    Input: {
      Search: defineComponent({
        props: { value: { type: String, default: undefined } },
        emits: ['update:value', 'search'],
        setup: (props, ctx) => () =>
          h('input', {
            'data-search': true,
            value: props.value,
            onInput: (event: Event) =>
              ctx.emit(
                'update:value',
                (event.target as HTMLInputElement).value,
              ),
            onKeydown: (event: KeyboardEvent) => {
              if (event.key === 'Enter') ctx.emit('search');
            },
          }),
      }),
    },
    Select: block,
    Tag: block,
    message: { success: vi.fn(), error: vi.fn() },
    Table: defineComponent({
      props: {
        dataSource: {
          type: Array as PropType<Record<string, unknown>[]>,
          default: () => [],
        },
        columns: {
          type: Array as PropType<{ key: string }[]>,
          default: () => [],
        },
        expandedRowKeys: {
          type: Array as PropType<string[]>,
          default: () => [],
        },
      },
      emits: ['change', 'expand'],
      setup: (props, ctx) => () =>
        h('div', [
          h('button', {
            'data-sort': true,
            onClick: () =>
              ctx.emit(
                'change',
                { current: 1, pageSize: 20 },
                {},
                { columnKey: 'lastOrder', order: 'ascend' },
              ),
          }),
          ...props.dataSource.map((record) =>
            h('article', { 'data-row': record.id }, [
              ...props.columns.map((column) =>
                ctx.slots.bodyCell?.({ column, record }),
              ),
              props.expandedRowKeys.includes(String(record.id))
                ? ctx.slots.expandedRowRender?.({ record })
                : null,
            ]),
          ),
        ]),
    }),
  };
});

const row = {
  id: 's1',
  type: 'SUPPLIER',
  companyId: 0,
  code: 'GYS20210317103001',
  name: '石家庄晟鹏化工有限公司',
  sourceSystem: 'JINZHI',
  active: true,
  stats: {
    orders: 30,
    recent12Orders: 30,
    tier: 'ACTIVE',
    daysSinceLastOrder: 31,
    lastOrderDate: '2026-09-07',
    lastOrderCode: 'CG1',
    openOrders: 0,
    currency: 'CNY',
    totalAmount: 5_000_000,
    recent12Amount: 2_667_400,
    previous12Amount: 2_000_000,
    monthly: Array.from({ length: 12 }, () => 100),
    topItems: ['发泡剂(ADC)'],
  },
};
const overview = {
  total: 957,
  inactive: 3,
  withoutContact: 600,
  tiers: { ACTIVE: 105, OCCASIONAL: 149, SLEEP: 518, NONE: 185 },
  top10Amount: 26_100_184,
  top10Share: 44.8,
  activeDays: 90,
  occasionalDays: 365,
  months: Array.from(
    { length: 12 },
    (_, index) => `2026-${String(index + 1).padStart(2, '0')}`,
  ),
  monthly: Array.from({ length: 12 }, () => 100),
  currency: 'CNY',
  recent12Amount: 58_283_078,
  recent12Orders: 4102,
  activeSuppliers: 254,
  asOf: '2026-10-08',
  topSuppliers: [
    { id: 's1', name: '石家庄晟鹏化工有限公司', amount: 2_667_400, orders: 30 },
  ],
};
const disposals: (() => void)[] = [];
async function settle() {
  for (let index = 0; index < 5; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/suppliers', component: { render: () => null } }],
  });
  await router.push('/suppliers');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(SupplierPage) });
  app.use(router);
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return host;
}
function button(host: HTMLElement, text: string) {
  const found = [...host.querySelectorAll('button')].find((entry) =>
    entry.textContent?.trim().startsWith(text),
  );
  expect(found).toBeDefined();
  return found!;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.page.mockResolvedValue({ list: [row], total: 1 });
  mocks.overview.mockResolvedValue(overview);
});
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

describe('supplier page', () => {
  it('shows purchasing figures, tiers and a row with its trend and items', async () => {
    const host = await mount();
    expect(mocks.page).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'RECENT_12', order: 'DESC', pageNo: 1 }),
    );
    expect(host.textContent).toContain('254 家');
    expect(host.textContent).toContain('¥5,828.3 万');
    expect(host.textContent).toContain('44.8%');
    expect(host.textContent).toContain('常用105');
    expect(host.textContent).toContain('CNY 266.7 万');
    expect(host.textContent).toContain('比上年同期 +33%');
    expect(host.textContent).toContain('发泡剂(ADC)');
    expect(host.textContent).toContain('1 个月前下单');
  });
  it('filters by tier, sorts on the server and expands a supplier in place', async () => {
    const host = await mount();
    button(host, '沉睡').click();
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ tier: 'SLEEP', pageNo: 1 }),
    );
    host.querySelector<HTMLButtonElement>('[data-sort]')!.click();
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'LAST_ORDER', order: 'ASC' }),
    );
    button(host, '石家庄晟鹏化工有限公司').click();
    await settle();
    expect(host.querySelector('[data-snapshot="s1"]')).not.toBeNull();
  });
  it('exports every page of the current filter', async () => {
    mocks.page
      .mockResolvedValueOnce({ list: [row], total: 1 })
      .mockResolvedValueOnce({ list: [row], total: 2 })
      .mockResolvedValueOnce({ list: [{ ...row, id: 's2' }], total: 2 });
    const host = await mount();
    button(host, '导出').click();
    await settle();
    expect(mocks.page).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageNo: 1, pageSize: 100 }),
    );
    expect(mocks.page).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ pageNo: 2, pageSize: 100 }),
    );
    expect(mocks.download).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: '供应商采购统计-20261008.csv' }),
    );
  });
});
