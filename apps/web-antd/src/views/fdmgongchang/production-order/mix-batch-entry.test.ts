import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ProductionOrderPage from './index.vue';

const api = vi.hoisted(() => ({ page: vi.fn(), factory: 1 }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }));
vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: () => true }),
}));
vi.mock('#/api/fdmgongchang/production-order', () => ({
  getFactoryProductionOrders: api.page,
  getMyProductionOrders: api.page,
  getOrderableFactories: vi.fn(async () => []),
}));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getMyFactories: vi.fn(async () => ({
    canSeeAll: true,
    defaultFactoryId: 1,
    factories: [
      { id: 1, name: '一厂' },
      { id: 2, name: '二厂' },
    ],
  })),
  setCurrentFactoryId: (id: number) => {
    api.factory = id;
  },
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('main', [slots.default?.(), slots.title?.()]),
  }),
}));
vi.mock('../shared/factory-switch.vue', () => ({
  default: defineComponent({
    props: ['value'],
    emits: ['change'],
    setup:
      (props, { emit }) =>
      () =>
        h(
          'select',
          {
            id: 'test-factory',
            value: String(props.value),
            onChange: (event: Event) =>
              emit('change', Number((event.target as HTMLSelectElement).value)),
          },
          [
            h('option', { value: '1' }, '一厂'),
            h('option', { value: '2' }, '二厂'),
          ],
        ),
  }),
}));
vi.mock('../schedule/modules/mix-batch-modal.vue', () => ({
  default: defineComponent({
    props: ['open', 'orders'],
    setup: (props) => () =>
      props.open
        ? h(
            'section',
            { id: 'batch-entry' },
            props.orders.map((order: { id: number }) => order.id).join(','),
          )
        : null,
  }),
}));
vi.mock('../schedule/modules/package-release-modal.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../schedule/modules/schedule-board.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../schedule/modules/task-manage.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./modules/create-modal.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./modules/order-drawer.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./modules/schedule-modal.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./modules/exception-ledger.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./modules/restock-ledger.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  return {
    Button: defineComponent({
      props: ['disabled'],
      setup:
        (props, { attrs, slots }) =>
        () =>
          h(
            'button',
            { ...attrs, disabled: props.disabled },
            slots.default?.(),
          ),
    }),
    Input: block,
    Progress: block,
    Result: block,
    Select: block,
    Tag: block,
    Tabs: Object.assign(block, { TabPane: block }),
    message: { success: vi.fn() },
    Table: defineComponent({
      props: ['dataSource', 'rowSelection', 'pagination'],
      emits: ['change'],
      setup:
        (props, { emit }) =>
        () =>
          h('div', [
            ...props.dataSource.map((row: { id: number }) =>
              h('input', {
                id: `select-order-${row.id}`,
                type: 'checkbox',
                checked: props.rowSelection?.selectedRowKeys.includes(row.id),
                onChange: (event: Event) => {
                  const on = (event.target as HTMLInputElement).checked;
                  const keys = on
                    ? [...props.rowSelection.selectedRowKeys, row.id]
                    : props.rowSelection.selectedRowKeys.filter(
                        (id: number) => id !== row.id,
                      );
                  props.rowSelection.onChange(
                    keys,
                    props.dataSource.filter((record: { id: number }) =>
                      keys.includes(record.id),
                    ),
                  );
                },
              }),
            ),
            h(
              'button',
              {
                id: 'next-page',
                onClick: () => emit('change', { current: 2, pageSize: 20 }),
              },
              '下一页',
            ),
          ]),
    }),
  };
});
const flush = async () => {
  for (let index = 0; index < 10; index++) {
    await Promise.resolve();
    await nextTick();
  }
};
let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
  vi.clearAllMocks();
  api.factory = 1;
});
describe('批量发泡订单入口', () => {
  it('保留跨页选择，切换工厂时关闭批量窗口并清空旧厂订单', async () => {
    api.page.mockImplementation(
      async (params: { pageNo: number; pageSize: number }) => {
        const orderId = params.pageNo === 1 ? 11 : 12;
        return {
        total: params.pageSize === 1 ? 0 : 40,
        list:
          params.pageSize === 1
            ? []
            : [
                {
                  id: api.factory === 1 ? orderId : 21,
                  status: 'ACCEPTED',
                  items: [],
                  orderNo: '测试订单',
                },
              ],
        };
      },
    );
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(ProductionOrderPage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();
    document.querySelector<HTMLInputElement>('#select-order-11')!.click();
    await flush();
    document.querySelector<HTMLButtonElement>('#next-page')!.click();
    await flush();
    document.querySelector<HTMLInputElement>('#select-order-12')!.click();
    await flush();
    const batchButton = () =>
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent?.includes('批量安排发泡'),
      )!;
    expect(batchButton().textContent).toContain('已选 2 张');
    batchButton().click();
    await flush();
    expect(document.querySelector('#batch-entry')!.textContent).toBe('11,12');
    const factory = document.querySelector<HTMLSelectElement>('#test-factory')!;
    factory.value = '2';
    factory.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(api.factory).toBe(2);
    expect(document.querySelector('#batch-entry')).toBeNull();
    expect(batchButton().textContent).not.toContain('已选');
    batchButton().click();
    await flush();
    expect(document.querySelector('#batch-entry')!.textContent).toBe('');
    expect(document.querySelector('#select-order-21')).not.toBeNull();
  });
});
