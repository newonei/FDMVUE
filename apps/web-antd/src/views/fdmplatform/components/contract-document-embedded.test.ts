/* eslint-disable vue/one-component-per-file -- Minimal UI adapters exercise real embedded child lifecycles without Ant Design overlays. */
import type { Component, PropType } from 'vue';

import type { ActionDefinition } from '../data';

import type { Contract } from '#/api/fdmplatform';
import type { CustomsBatch } from '#/api/fdmplatform/customs';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DocumentAction from '../documents/DocumentAction.vue';
import CustomsPanel from './CustomsPanel.vue';

const mocks = vi.hoisted(() => ({
  contract: vi.fn(),
  directory: vi.fn(),
  attachments: vi.fn(),
  action: vi.fn(),
  customsPage: vi.fn(),
  customs: vi.fn(),
  customsFiles: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  getAccess: vi.fn().mockResolvedValue({ userId: 1 }),
  getAttachments: mocks.attachments,
  getContract: mocks.contract,
  getDirectory: mocks.directory,
  getMasterData: vi.fn().mockResolvedValue([]),
  newIdempotencyKey: () => 'embedded-test-key',
  requestAiReview: vi.fn(),
}));
vi.mock('#/api/fdmplatform/stock', () => ({
  getContractStockPools: vi.fn().mockResolvedValue({ pools: [] }),
}));
vi.mock('#/api/fdmplatform/customs', () => ({
  getCustomsPage: mocks.customsPage,
  getCustoms: mocks.customs,
  getCustomsFiles: mocks.customsFiles,
  downloadCustomsFile: vi.fn(),
  uploadCustomsFile: vi.fn(),
}));
vi.mock('#/api/fdmplatform/submissions', () => ({
  contractActionWithAttachments: mocks.action,
  createCustomsWithAttachments: vi.fn(),
  customsActionWithAttachments: vi.fn(),
}));
vi.mock('../documents/ContractPicker.vue', () => ({
  default: defineComponent({
    props: { open: Boolean },
    emits: ['select'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'button',
            {
              'data-picker': true,
              onClick: () => ctx.emit('select', { id: 'other-contract' }),
            },
            '选择其他合同',
          )
        : null,
  }),
}));
vi.mock('./ActionDialog.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      saving: Boolean,
      definition: {
        type: Object as PropType<ActionDefinition>,
        default: undefined,
      },
    },
    emits: ['close', 'submit'],
    setup: (props, ctx) => () =>
      props.open
        ? h('section', { 'data-action': props.definition?.action }, [
            ctx.slots.context?.(),
            props.definition?.title,
            h(
              'button',
              {
                disabled: props.saving,
                onClick: () =>
                  ctx.emit('submit', { name: '当前单据' }, 'embedded-test-key'),
              },
              '提交当前单据',
            ),
            h(
              'button',
              { disabled: props.saving, onClick: () => ctx.emit('close') },
              '关闭当前办理',
            ),
          ])
        : null,
  }),
}));
vi.mock('./AttachmentPanel.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./CreationAttachments.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./CustomsEditor.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      lockContract: Boolean,
      contractId: { type: String, default: undefined },
    },
    emits: ['update:open'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-customs-editor': props.contractId,
              'data-locked': String(props.lockContract),
            },
            [
              h(
                'button',
                { onClick: () => ctx.emit('update:open', false) },
                '关闭报关编辑',
              ),
            ],
          )
        : null,
  }),
}));
vi.mock('../documents/LinkedRecordTable.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../documents/RelatedLink.vue', () => ({
  default: defineComponent({
    setup: (_, ctx) => () => h('span', ctx.slots.default?.()),
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
  const drawer = defineComponent({
    props: { open: Boolean, closable: { type: Boolean, default: true } },
    emits: ['close'],
    setup: (props, ctx) => () =>
      props.open
        ? h('section', { 'data-drawer': true }, [
            ctx.slots.default?.(),
            h(
              'button',
              { disabled: !props.closable, onClick: () => ctx.emit('close') },
              '关闭详情',
            ),
          ])
        : null,
  });
  const modal = defineComponent({
    props: { open: Boolean },
    setup: (props, ctx) => () =>
      props.open
        ? h('section', { 'data-modal': true }, ctx.slots.default?.())
        : null,
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
            { 'data-row': record.id },
            props.columns.map((column) =>
              ctx.slots.bodyCell?.({ record, column }),
            ),
          ),
        ),
      ),
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup: (props) => () => h('p', { role: 'alert' }, props.message),
    }),
    Button: button,
    Checkbox: block,
    Collapse: Object.assign(block, { Panel: block }),
    Descriptions: Object.assign(block, { Item: block }),
    DescriptionsItem: block,
    Drawer: drawer,
    Empty: block,
    Form: Object.assign(block, { Item: block }),
    Input: Object.assign(block, { TextArea: block }),
    Modal: Object.assign(modal, { confirm: vi.fn() }),
    Select: block,
    Space: block,
    Spin: block,
    Table: table,
    TabPane: block,
    Tabs: block,
    Tag: block,
    message: { success: vi.fn() },
  };
});

function contractFixture(id = 'contract-a', version = 42): Contract {
  return {
    id,
    code: `HT-${id}`,
    name: `合同 ${id}`,
    companyId: 1,
    companyName: '测试公司',
    departmentId: 3,
    ownerUserId: 1,
    customerId: 'customer-a',
    customerName: '客户甲',
    businessType: 'FOREIGN',
    currency: 'CNY',
    status: 'CONFIRMED',
    version,
    businessVersion: 4,
    allowedActions: ['CREATE_REQUEST', 'CREATE_RECEIPT'],
    items: [
      {
        id: `item-${id}`,
        skuId: 'sku-a',
        skuName: `产品 ${id}`,
        specification: '标准',
        specVersion: '1',
        quantity: 10,
        unit: '件',
        unitPrice: '5',
      },
    ],
    finance: { receipts: [], invoices: [], costs: [], allocations: [] },
  };
}
function batchFixture(
  id = 'customs-a',
  contractId = 'contract-a',
): CustomsBatch {
  return {
    id,
    name: `报关批次 ${id}`,
    code: `BG-${id}`,
    contractId,
    contractCode: `HT-${contractId}`,
    version: 1,
    contractVersion: 42,
    companyId: 1,
    required: true,
    purchaseOrderIds: [],
    lines: [],
    shipments: [],
    status: 'DRAFT',
    documentStatus: 'MISSING',
    allowedActions: ['UPDATE'],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const dispose: (() => void)[] = [];
async function settle() {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
async function mount(component: Component, props: Record<string, unknown>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/contracts', component: { render: () => null } }],
  });
  await router.push(
    '/contracts?contractId=contract-a&documentId=parent-contract&tab=progress',
  );
  await router.isReady();
  const values = reactive(props);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(component, values) });
  app.use(router);
  app.mount(host);
  const close = () => {
    app.unmount();
    host.remove();
  };
  dispose.push(close);
  await settle();
  return { host, router, values };
}
function click(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === text,
  );
  expect(button, `缺少按钮：${text}`).toBeDefined();
  button!.click();
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.contract.mockImplementation(async (id: string) => contractFixture(id));
  mocks.directory.mockResolvedValue({
    companies: [],
    users: [],
    departments: [],
  });
  mocks.attachments.mockResolvedValue({ items: [] });
  mocks.action.mockResolvedValue(contractFixture('contract-a', 43));
  mocks.customsPage.mockResolvedValue({ list: [batchFixture()], total: 1 });
  mocks.customs.mockResolvedValue(batchFixture());
  mocks.customsFiles.mockResolvedValue({ items: [], enabled: true });
});
afterEach(() => {
  for (const close of dispose.splice(0)) close();
});

describe('locked contract document actions', () => {
  it('prepares on its first open=true mount and submits the current contract version without a picker', async () => {
    const updated = vi.fn();
    const closed = vi.fn();
    const { host, router } = await mount(DocumentAction, {
      open: true,
      lockContract: true,
      contractId: 'contract-a',
      kind: 'requests',
      action: 'CREATE_REQUEST',
      onUpdated: updated,
      onClose: closed,
    });
    expect(mocks.contract).toHaveBeenCalledExactlyOnceWith('contract-a');
    expect(host.querySelector('[data-picker]')).toBeNull();
    expect(host.querySelector('[data-action="CREATE_REQUEST"]')).not.toBeNull();
    expect(host.textContent).toContain('HT-contract-a');
    click(host, '提交当前单据');
    await settle();
    expect(mocks.action).toHaveBeenCalledExactlyOnceWith(
      'contract-a',
      'CREATE_REQUEST',
      42,
      'embedded-test-key',
      { name: '当前单据' },
      [],
    );
    expect(updated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'contract-a', version: 43 }),
    );
    expect(closed).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.fullPath).toBe(
      '/contracts?contractId=contract-a&documentId=parent-contract&tab=progress',
    );
  });
  it('retries a failed fixed contract without exposing another-contract selection', async () => {
    mocks.contract.mockRejectedValueOnce(new Error('当前合同读取失败'));
    const { host } = await mount(DocumentAction, {
      open: true,
      lockContract: true,
      contractId: 'contract-a',
      kind: 'requests',
      action: 'CREATE_REQUEST',
    });
    expect(host.textContent).toContain('当前合同读取失败');
    expect(host.textContent).not.toContain('重新选择合同');
    expect(host.querySelector('[data-picker]')).toBeNull();
    click(host, '重试当前合同');
    await settle();
    expect(mocks.contract.mock.calls).toEqual([['contract-a'], ['contract-a']]);
    expect(host.textContent).not.toContain('当前合同读取失败');
    expect(host.querySelector('[data-action="CREATE_REQUEST"]')).not.toBeNull();
  });
  it('does not fall back to a picker when its required locked contract is missing', async () => {
    const { host } = await mount(DocumentAction, {
      open: true,
      lockContract: true,
      kind: 'requests',
      action: 'CREATE_REQUEST',
    });
    expect(host.textContent).toContain('当前合同未加载');
    expect(host.querySelector('[data-picker]')).toBeNull();
    expect(mocks.contract).not.toHaveBeenCalled();
  });
  it('rejects an attached record belonging to another contract before loading or submitting', async () => {
    const { host } = await mount(DocumentAction, {
      open: true,
      lockContract: true,
      contractId: 'contract-a',
      kind: 'requests',
      action: 'CREATE_REQUEST',
      row: { id: 'request-b', contractId: 'contract-b' },
    });
    expect(host.textContent).toContain('当前单据不属于此合同');
    expect(mocks.contract).not.toHaveBeenCalled();
    expect(mocks.action).not.toHaveBeenCalled();
    expect(host.querySelector('[data-action]')).toBeNull();
  });
  it('rejects contract data returned under an unexpected identity', async () => {
    mocks.contract.mockResolvedValueOnce(contractFixture('contract-b'));
    const { host } = await mount(DocumentAction, {
      open: true,
      lockContract: true,
      contractId: 'contract-a',
      kind: 'requests',
      action: 'CREATE_REQUEST',
    });
    expect(host.textContent).toContain('返回的资料不属于当前合同');
    expect(host.querySelector('[data-action]')).toBeNull();
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it('keeps the new action and newer version when an earlier preparation returns late', async () => {
    const slow = deferred<Contract>();
    mocks.contract
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(contractFixture('contract-a', 55));
    const { host, values } = await mount(DocumentAction, {
      open: true,
      lockContract: true,
      contractId: 'contract-a',
      kind: 'requests',
      action: 'CREATE_REQUEST',
    });
    values.kind = 'receipts';
    values.action = 'CREATE_RECEIPT';
    await settle();
    expect(host.querySelector('[data-action="CREATE_RECEIPT"]')).not.toBeNull();
    slow.resolve(contractFixture('contract-a', 42));
    await settle();
    expect(host.querySelector('[data-action="CREATE_REQUEST"]')).toBeNull();
    click(host, '提交当前单据');
    await settle();
    expect(mocks.action).toHaveBeenCalledWith(
      'contract-a',
      'CREATE_RECEIPT',
      55,
      'embedded-test-key',
      { name: '当前单据', currency: '' },
      [],
    );
  });
  it('discards old-contract preparation failures after switching the fixed contract', async () => {
    const slow = deferred<Contract>();
    mocks.contract.mockReturnValueOnce(slow.promise);
    const { host, values } = await mount(DocumentAction, {
      open: true,
      lockContract: true,
      contractId: 'contract-a',
      kind: 'requests',
      action: 'CREATE_REQUEST',
    });
    values.contractId = 'contract-b';
    await settle();
    slow.reject(new Error('旧合同迟到失败'));
    await settle();
    expect(host.textContent).toContain('HT-contract-b');
    expect(host.textContent).not.toContain('旧合同迟到失败');
    expect(host.textContent).not.toContain('HT-contract-a');
  });
  it('does not reopen a closed child when its pending preparation completes', async () => {
    const slow = deferred<Contract>();
    mocks.contract.mockReturnValueOnce(slow.promise);
    const { host, values } = await mount(DocumentAction, {
      open: true,
      lockContract: true,
      contractId: 'contract-a',
      kind: 'requests',
      action: 'CREATE_REQUEST',
    });
    values.open = false;
    await settle();
    slow.resolve(contractFixture());
    await settle();
    expect(host.querySelector('[data-action]')).toBeNull();
    expect(host.querySelector('[data-modal]')).toBeNull();
    expect(mocks.action).not.toHaveBeenCalled();
  });
});

describe('embedded customs child', () => {
  it('ignores the parent documentId and opens and closes its own detail without modifying the route', async () => {
    const busy = vi.fn();
    const { host, router } = await mount(CustomsPanel, {
      companyId: 1,
      contractId: 'contract-a',
      embedded: true,
      onBusy: busy,
    });
    const initialRoute = router.currentRoute.value.fullPath;
    expect(mocks.customsPage).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 'contract-a' }),
    );
    expect(mocks.customs).not.toHaveBeenCalled();
    expect(host.querySelector('[data-drawer]')).toBeNull();
    click(host, '查看跟进');
    await settle();
    expect(mocks.customs).toHaveBeenCalledExactlyOnceWith('customs-a');
    expect(host.querySelector('[data-drawer]')).not.toBeNull();
    expect(busy).toHaveBeenLastCalledWith(true);
    expect(router.currentRoute.value.fullPath).toBe(initialRoute);
    click(host, '关闭详情');
    await settle();
    expect(host.querySelector('[data-drawer]')).toBeNull();
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(router.currentRoute.value.fullPath).toBe(initialRoute);
  });
  it('locks the new customs editor to the parent contract and announces its open state', async () => {
    const busy = vi.fn();
    const { host, router } = await mount(CustomsPanel, {
      companyId: 1,
      contractId: 'contract-a',
      embedded: true,
      onBusy: busy,
    });
    click(host, '新建报关批次');
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-customs-editor="contract-a"]')
        ?.dataset.locked,
    ).toBe('true');
    expect(busy).toHaveBeenLastCalledWith(true);
    click(host, '关闭报关编辑');
    await settle();
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(router.currentRoute.value.query.documentId).toBe('parent-contract');
  });
  it('rejects a foreign-contract batch detail and retains the original parent route', async () => {
    mocks.customs.mockResolvedValueOnce(
      batchFixture('customs-a', 'contract-b'),
    );
    const { host, router } = await mount(CustomsPanel, {
      companyId: 1,
      contractId: 'contract-a',
      embedded: true,
    });
    click(host, '查看跟进');
    await settle();
    expect(host.textContent).toContain('此报关批次不属于链接中的合同');
    expect(mocks.contract).not.toHaveBeenCalled();
    expect(host.querySelector('[data-drawer]')?.textContent).not.toContain(
      'HT-contract-b',
    );
    expect(router.currentRoute.value.query.documentId).toBe('parent-contract');
  });
});
