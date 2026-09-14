/* eslint-disable vue/one-component-per-file -- Small UI adapters exercise the actual purchase workspace and its router. */
import type { PropType } from 'vue';

import { createApp, defineComponent, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Workspace from './index.vue';
const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  detail: vi.fn(),
  contract: vi.fn(),
}));
vi.mock('../../documents/procurement-tabs', () => ({}));
vi.mock('#/api/fdmplatform', () => ({
  getAttachments: vi.fn(),
  getContract: mocks.contract,
  newIdempotencyKey: () => 'test-key',
}));
vi.mock('#/api/fdmplatform/procurement', () => ({
  getProcurementOrders: mocks.page,
  getProcurementOrder: mocks.detail,
  downloadProcurementFile: vi.fn(),
  exportProcurementOrder: vi.fn(),
  procurementOrderAction: vi.fn(),
  uploadProcurementSigned: vi.fn(),
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));
vi.mock('@vben/utils', () => ({
  formatDate: (value: unknown) => String(value ?? ''),
}));
vi.mock('../../components/ActionDialog.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../components/AttachmentPanel.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../components/RecordTable.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../documents/DocumentAction.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../documents/MigrationSource.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../finance/procurement/components/OrderFinance.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/OrderDetails.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/OrderContract.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../documents/BusinessDocumentDetail.vue', () => ({
  default: defineComponent({
    props: { id: { type: String, default: undefined }, open: Boolean },
    emits: ['close'],
    setup: (props, ctx) => () =>
      props.open
        ? h('section', { 'data-business-id': props.id }, [
            props.id,
            h('button', { onClick: () => ctx.emit('close') }, '关闭单据'),
          ])
        : null,
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.slots.default?.()),
  });
  const button = defineComponent({
    props: { disabled: Boolean, loading: Boolean },
    setup: (props, ctx) => () =>
      h(
        'button',
        { ...ctx.attrs, disabled: props.disabled || props.loading },
        ctx.slots.default?.(),
      ),
  });
  const table = defineComponent({
    props: {
      dataSource: {
        type: Array as PropType<Record<string, unknown>[]>,
        default: () => [],
      },
      columns: {
        type: Array as PropType<{ key: string }[]>,
        default: () => [],
      },
    },
    setup: (props, ctx) => () =>
      h(
        'div',
        props.dataSource.map((record) =>
          h(
            'article',
            { 'data-order-id': record.id },
            props.columns.map((column) =>
              ctx.slots.bodyCell?.({ record, column }),
            ),
          ),
        ),
      ),
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: undefined } },
      setup: (props) => () => h('p', { role: 'alert' }, props.message),
    }),
    Button: button,
    Card: block,
    Input: { Search: block },
    Select: block,
    Space: block,
    Table: table,
    TabPane: block,
    Tabs: block,
    Tag: block,
    message: { success: vi.fn() },
  };
});
function nativeRows() {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `po-${index + 1}`,
    standaloneId: `po-${index + 1}`,
    recordType: 'PURCHASE_ORDER',
    contractId: 'jz-contract-9676',
    contractCode: 'DD20251008193005',
    supplierName: '温州供应商',
    supplierId: 'supplier-1',
    record: {
      id: `po-${index + 1}`,
      code: `CG-${index + 1}`,
      status: 'NEEDS_COMPLETION',
      lines: [],
    },
    details: {},
    allowedActions: ['SAVE_DETAILS'],
  }));
}
const dispose: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.page.mockResolvedValue({ list: nativeRows(), total: 6 });
});
afterEach(() => {
  for (const close of dispose.splice(0)) close();
});
async function settle() {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/fdmprocurement/platform-orders', component: Workspace }],
  });
  await router.push(
    '/fdmprocurement/platform-orders?contractId=jz-contract-9676',
  );
  await router.isReady();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(RouterView) });
  app.use(router);
  app.mount(host);
  dispose.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, router };
}
function click(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(button).toBeDefined();
  button!.click();
}
describe('unified native purchase workspace', () => {
  it('displays six linked standalone orders and opens their actual identity without looking up contract arrays', async () => {
    const { host, router } = await mount();
    expect(mocks.page).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 'jz-contract-9676' }),
    );
    expect(host.querySelectorAll('[data-order-id]')).toHaveLength(6);
    expect(host.textContent).toContain('温州供应商');
    const supplierLink = host.querySelector('a[href*="supplierId=supplier-1"]');
    expect(supplierLink?.textContent).toBe('温州供应商');
    expect(
      [...host.querySelectorAll('a')]
        .filter((link) =>
          link.getAttribute('href')?.includes('contractId=jz-contract-9676'),
        )
        .every((link) => link.textContent?.trim()),
    ).toBe(true);
    const button = [...host.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('CG-3'),
    );
    expect(button).toBeDefined();
    button!.click();
    await settle();
    expect(router.currentRoute.value.query).toMatchObject({
      contractId: 'jz-contract-9676',
      standaloneId: 'po-3',
    });
    expect(router.currentRoute.value.query.documentId).toBeUndefined();
    expect(host.querySelector('[data-business-id="po-3"]')).not.toBeNull();
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(mocks.contract).not.toHaveBeenCalled();
    click(host, '关闭单据');
    await settle();
    expect(router.currentRoute.value.query.standaloneId).toBeUndefined();
    expect(router.currentRoute.value.query.contractId).toBe('jz-contract-9676');
  });
  it('preserves a real list error and clears it after a successful retry', async () => {
    mocks.page.mockRejectedValueOnce(new Error('采购单不属于关联合同'));
    const { host } = await mount();
    expect(host.textContent).toContain('采购单不属于关联合同');
    click(host, '刷新');
    await settle();
    expect(host.querySelectorAll('[data-order-id]')).toHaveLength(6);
    expect(host.textContent).not.toContain('采购单不属于关联合同');
  });
  it('does not leave a previous contract order list visible after the next contract request fails', async () => {
    const { host, router } = await mount();
    expect(host.querySelectorAll('[data-order-id]')).toHaveLength(6);
    mocks.page.mockRejectedValueOnce(new Error('新合同读取失败'));
    await router.push({ query: { contractId: 'other-contract' } });
    await settle();
    expect(host.textContent).toContain('新合同读取失败');
    expect(host.querySelectorAll('[data-order-id]')).toHaveLength(0);
  });
});
