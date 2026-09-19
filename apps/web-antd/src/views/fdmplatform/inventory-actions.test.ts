/* eslint-disable vue/one-component-per-file -- Render workspace entry points without unrelated business forms. */
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Workbench from './index.vue';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  stock: vi.fn(),
  directory: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  route: {
    path: '/inventory/platform-stock',
    query: {} as Record<string, string>,
  },
  businessLists: 0,
}));
vi.mock('vue-router', () => ({
  useRoute: () => reactive(mocks.route),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock('#/api/fdmplatform', () => ({
  getAccess: mocks.access,
  getDirectory: mocks.directory,
  getBusinessPage: vi.fn().mockResolvedValue({ list: [], total: 0 }),
  getContract: vi.fn(),
  getMasterData: vi.fn().mockResolvedValue([]),
  getRoutingRules: vi.fn(),
  saveMasterData: vi.fn(),
  saveRoutingRule: vi.fn(),
  stockAction: vi.fn(),
  updateMasterData: vi.fn(),
}));
vi.mock('#/api/fdmplatform/stock', () => ({
  getStockPage: mocks.stock,
  getStockPool: vi.fn(),
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup(_, { slots }) {
      return () => h('main', slots.default?.());
    },
  }),
}));
vi.mock('./components/ActionDialog.vue', () => ({
  default: defineComponent({ render: () => h('div') }),
}));
vi.mock('./components/ContractDetail.vue', () => ({
  default: defineComponent({ render: () => h('div') }),
}));
vi.mock('./components/ImportPanel.vue', () => ({
  default: defineComponent({ render: () => h('div') }),
}));
vi.mock('./components/MasterSourcePicker.vue', () => ({
  default: defineComponent({ render: () => h('div') }),
}));
vi.mock('./components/RecordTable.vue', () => ({
  default: defineComponent({ render: () => h('div') }),
}));
vi.mock('./products/components/ContractEditor.vue', () => ({
  default: defineComponent({ render: () => h('div') }),
}));
vi.mock('./documents/BusinessDocumentList.vue', () => ({
  default: defineComponent({
    setup() {
      mocks.businessLists++;
      return () => h('div', { 'data-business-list': true });
    },
  }),
}));
vi.mock('./documents/DocumentAction.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      action: { type: String, default: '' },
      kind: { type: String, default: '' },
      contractId: { type: String, default: undefined },
      lockContract: Boolean,
    },
    emits: ['close', 'updated'],
    setup(props, { emit }) {
      return () =>
        props.open
          ? h(
              'section',
              {
                'data-document-action': props.action,
                'data-kind': props.kind,
                'data-contract-id': props.contractId,
                'data-lock-contract': props.lockContract,
              },
              [
                h(
                  'button',
                  {
                    onClick: () => {
                      emit('updated', { id: 'chosen-contract' });
                      emit('close');
                    },
                  },
                  '保存办理结果',
                ),
                h('button', { onClick: () => emit('close') }, '关闭办理'),
              ],
            )
          : null;
    },
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup(_, { slots }) {
      return () => h('div', slots.default?.());
    },
  });
  return {
    Alert: block,
    Card: block,
    Empty: block,
    Pagination: block,
    Result: block,
    Space: block,
    Table: block,
    Tabs: block,
    TabPane: block,
    Tag: block,
    Select: Object.assign(block, { Option: block }),
    Input: Object.assign(block, { Search: block }),
    Button: defineComponent({
      setup(_, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.());
      },
    }),
    message: { warning: vi.fn(), success: vi.fn() },
  };
});
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.businessLists = 0;
  mocks.route.path = '/inventory/platform-stock';
  mocks.route.query = {};
  mocks.access.mockResolvedValue({ userId: 1, companies: [] });
  mocks.stock.mockResolvedValue({ list: [], total: 0 });
  mocks.directory.mockResolvedValue({
    users: [],
    departments: [],
    companies: [],
  });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});
async function mount(workspace = 'inventory-stock') {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(Workbench, { workspace });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await vi.waitFor(() => expect(mocks.directory).toHaveBeenCalled());
  await nextTick();
  return host;
}
function click(host: Element, text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === text,
  );
  expect(button).toBeTruthy();
  button!.click();
}
describe('库存工作区就地办理入口', () => {
  it('预留、发货、采购到货和自产入库均在原页面选择合同后办理', async () => {
    const host = await mount();
    for (const [title, action, kind] of [
      ['预留库存', 'STOCK_RESERVE', 'shipments'],
      ['登记发货', 'STOCK_SHIP', 'shipments'],
      ['采购到货', 'RECORD_ARRIVAL', 'arrivals'],
      ['自产入库', 'STOCK_RECEIVE', 'production'],
    ]) {
      click(host, title!);
      await nextTick();
      const dialog = host.querySelector<HTMLElement>('[data-document-action]')!;
      expect(dialog.dataset.documentAction).toBe(action);
      expect(dialog.dataset.kind).toBe(kind);
      expect(Object.hasOwn(dialog.dataset, 'contractId')).toBe(false);
      expect(dialog.dataset.lockContract).toBe('false');
      click(host, '关闭办理');
      await nextTick();
      expect(
        host.querySelector<HTMLElement>('[data-document-action]'),
      ).toBeNull();
    }
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('保存后刷新库存并留在当前页面，离开库存页时清理未完成弹窗', async () => {
    const host = await mount();
    expect(mocks.stock).toHaveBeenCalledOnce();
    click(host, '登记发货');
    await nextTick();
    click(host, '保存办理结果');
    await vi.waitFor(() => expect(mocks.stock).toHaveBeenCalledTimes(2));
    expect(
      host.querySelector<HTMLElement>('[data-document-action]'),
    ).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
    click(host, '预留库存');
    await nextTick();
    reactive(mocks.route).path = '/other';
    await nextTick();
    reactive(mocks.route).path = '/inventory/platform-stock';
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-document-action]'),
    ).toBeNull();
  });

  it('在入库单标签下完成办理会刷新当前列表且保留标签', async () => {
    mocks.route.query = { inventoryType: 'stock-ins' };
    const host = await mount();
    expect(mocks.businessLists).toBe(1);
    click(host, '采购到货');
    await nextTick();
    click(host, '保存办理结果');
    await vi.waitFor(() => expect(mocks.businessLists).toBe(2));
    expect(mocks.route.query.inventoryType).toBe('stock-ins');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('其他工作区不显示库存办理入口', async () => {
    const host = await mount('trade-contracts');
    for (const title of ['预留库存', '登记发货', '采购到货', '自产入库'])
      expect(
        [...host.querySelectorAll('button')].some(
          (node) => node.textContent?.trim() === title,
        ),
      ).toBe(false);
  });
});
