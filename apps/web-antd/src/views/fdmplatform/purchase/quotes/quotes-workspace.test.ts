/* eslint-disable vue/one-component-per-file -- Small UI adapters exercise real page routing and modal state. */
import type { Component, PropType } from 'vue';

import type { BusinessRecord, Contract, DocumentRow } from '#/api/fdmplatform';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import QuotesWorkspace from './index.vue';
import QuoteComparisonDialog from './QuoteComparisonDialog.vue';

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  contract: vi.fn(),
  saved: undefined as Contract | undefined,
}));
vi.mock('#/api/fdmplatform', () => ({
  getBusinessPage: mocks.page,
  getContract: mocks.contract,
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));
vi.mock('../../documents/DocumentAction.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      kind: { type: String, default: undefined },
      action: { type: String, default: undefined },
      contractId: { type: String, default: undefined },
      lockContract: Boolean,
      source: { type: Object, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-action': props.action,
              'data-kind': props.kind,
              'data-contract': props.contractId,
              'data-locked': String(props.lockContract),
              'data-source': JSON.stringify(props.source),
            },
            [
              h('button', { onClick: () => ctx.emit('close') }, '取消办理'),
              h(
                'button',
                { onClick: () => ctx.emit('updated', mocks.saved) },
                '保存办理',
              ),
            ],
          )
        : null,
  }),
}));
vi.mock('../../documents/RecordDetail.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      row: { type: Object as PropType<DocumentRow>, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h('section', { 'data-detail': props.row?.id }, [
            h('button', { onClick: () => ctx.emit('close') }, '关闭详情'),
          ])
        : null,
  }),
}));
vi.mock('../../documents/BusinessDocumentDetail.vue', () => ({
  default: defineComponent({
    props: { open: Boolean, id: { type: String, default: undefined } },
    emits: ['close'],
    setup: (props, ctx) => () =>
      props.open
        ? h('section', { 'data-standalone': props.id }, [
            h('button', { onClick: () => ctx.emit('close') }, '关闭历史单据'),
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
  const search = defineComponent({
    props: { value: { type: String, default: '' } },
    emits: ['update:value', 'search'],
    setup: (props, ctx) => () =>
      h('input', {
        value: props.value,
        'data-search': true,
        onInput: (event: Event) =>
          ctx.emit('update:value', (event.target as HTMLInputElement).value),
        onKeydown: (event: KeyboardEvent) => {
          if (event.key === 'Enter') ctx.emit('search');
        },
      }),
  });
  const numeric = defineComponent({
    props: {
      value: { type: [String, Number], default: undefined },
      disabled: Boolean,
    },
    emits: ['update:value'],
    setup: (props, ctx) => () =>
      h('input', {
        value: props.value,
        'data-quantity': true,
        disabled: props.disabled,
        onInput: (event: Event) =>
          ctx.emit('update:value', (event.target as HTMLInputElement).value),
      }),
  });
  const pagination = defineComponent({
    props: { current: { type: Number, default: 1 } },
    emits: ['change'],
    setup: (props, ctx) => () =>
      h('div', { 'data-page': props.current }, [
        h('button', { onClick: () => ctx.emit('change', 2) }, '第2页'),
      ]),
  });
  const modal = defineComponent({
    props: { open: Boolean, closable: Boolean },
    emits: ['cancel'],
    setup: (props, ctx) => () =>
      props.open
        ? h('section', { 'data-comparison-dialog': true }, [
            ctx.slots.default?.(),
            props.closable
              ? h('button', { onClick: () => ctx.emit('cancel') }, '关闭比较')
              : null,
          ])
        : null,
  });
  const alert = defineComponent({
    props: { message: { type: String, default: undefined } },
    setup: (props, ctx) => () =>
      h('aside', [props.message, ctx.slots.message?.(), ctx.slots.action?.()]),
  });
  const empty = defineComponent({
    props: { description: { type: String, default: undefined } },
    setup: (props) => () => h('div', props.description),
  });
  return {
    Alert: alert,
    Button: button,
    Empty: empty,
    Input: { Search: search },
    InputNumber: numeric,
    Modal: modal,
    Pagination: pagination,
    Spin: block,
  };
});

function quote(
  id = 'quote-a',
  overrides: Partial<BusinessRecord> = {},
): BusinessRecord {
  return {
    id,
    seriesId: `series-${id}`,
    version: 1,
    assignmentId: 'task',
    supplierId: `supplier-${id}`,
    supplierName: id === 'quote-a' ? '工厂甲' : '工厂乙',
    currency: 'CNY',
    unit: '件',
    unitPrice: '12.8',
    minQuantity: 1,
    maxQuantity: 100,
    confirmed: true,
    validUntil: '2099-12-31',
    promisedDate: '2099-12-01',
    taxIncluded: true,
    freightIncluded: false,
    packagingIncluded: true,
    ...overrides,
  };
}
function fixture(id = 'contract-a'): Contract {
  return {
    id,
    code: id === 'contract-a' ? 'HT-A' : 'HT-B',
    name: '订单',
    companyId: 1,
    departmentId: 1,
    ownerUserId: 1,
    customerId: 'customer',
    customerName: '客户',
    currency: 'CNY',
    businessType: 'FOREIGN',
    status: 'CONFIRMED',
    version: 3,
    businessVersion: 1,
    allowedActions: ['SAVE_PLAN', 'CREATE_QUOTE'],
    items: [
      {
        id: 'item',
        skuId: 'sku',
        skuName: '瑜伽垫',
        specVersion: 'v1',
        specification: '标准',
        unit: '件',
        quantity: 100,
      },
    ],
    requests: [
      {
        id: 'request',
        name: '采购申请',
        status: 'ACTIVE',
        items: [{ id: 'request-line', contractItemId: 'item', quantity: 100 }],
      },
    ],
    assignments: [
      {
        id: 'task',
        requestId: 'request',
        requestItemId: 'request-line',
        contractItemId: 'item',
        method: 'BUY',
        quantity: 100,
        status: 'ASSIGNED',
      },
    ],
    quotes: [quote(), quote('quote-b')],
    plans: [],
    purchaseOrders: [],
  };
}
function row(contract = fixture(), record = contract.quotes![0]!): DocumentRow {
  return {
    id: record.id,
    contractId: contract.id,
    contractCode: contract.code,
    contractName: contract.name,
    contractVersion: contract.version,
    companyId: contract.companyId,
    contractStatus: contract.status,
    allowedActions: contract.allowedActions,
    record,
  };
}
async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
const disposals: (() => void)[] = [];
async function mount(
  component: Component = QuotesWorkspace,
  query = '',
  props: Record<string, unknown> = {},
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quotes', component: { render: () => null } },
      { path: '/other', component: { render: () => null } },
    ],
  });
  await router.push(`/quotes${query}`);
  await router.isReady();
  const host = document.createElement('div');
  document.body.append(host);
  const state = reactive(props);
  const app = createApp({ render: () => h(component, state) });
  app.use(router);
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, router, state };
}
function button(host: Element, title: string) {
  const found = [...host.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === title,
  );
  expect(found).toBeDefined();
  return found!;
}
function selectQuote(host: Element, id: string) {
  button(
    host.querySelector(`[data-quote-id="${id}"]`)!,
    '选为方案来源',
  ).click();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.page.mockResolvedValue({ list: [row()], total: 21 });
  mocks.contract.mockResolvedValue(fixture());
  mocks.saved = fixture();
});
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

describe('procurement quote workspace', () => {
  it('compares every supplier in the full contract even when the current server page has one quote', async () => {
    const { host } = await mount();
    expect(host.querySelectorAll('.quote-record')).toHaveLength(1);
    expect(host.querySelectorAll('[data-quote-id]')).toHaveLength(2);
    expect(host.textContent).toContain('2 份当前报价');
    expect(button(host, '编制采购方案').disabled).toBe(true);
    expect(mocks.contract).toHaveBeenCalledWith('contract-a');
  });
  it('requires an explicit supplier choice and preserves server search, page and selected context after creating a plan', async () => {
    const { host, router } = await mount();
    const search = host.querySelector<HTMLInputElement>('[data-search]')!;
    search.value = '工厂';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    search.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await settle();
    button(host, '第2页').click();
    await settle();
    selectQuote(host, 'quote-b');
    await nextTick();
    button(host, '编制采购方案').click();
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-action]')?.dataset.source,
    ).toBe(JSON.stringify({ kind: 'quotes', id: 'quote-b' }));
    expect(
      host.querySelector<HTMLElement>('[data-action]')?.dataset.locked,
    ).toBe('true');
    expect(router.currentRoute.value.fullPath).toBe('/quotes');
    button(host, '保存办理').click();
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      'quotes',
      expect.objectContaining({
        pageNo: 2,
        keyword: '工厂',
        contractId: undefined,
      }),
    );
    expect(host.querySelector<HTMLElement>('[data-page]')?.dataset.page).toBe(
      '2',
    );
    expect(host.textContent).toContain('方案来源：工厂乙');
  });
  it('adds a quote to the selected source task and returns to the comparison after cancel', async () => {
    const { host } = await mount();
    button(host, '补充供应商报价').click();
    await settle();
    const action = host.querySelector<HTMLElement>('[data-action]')!;
    expect(action.dataset.action).toBe('CREATE_QUOTE');
    expect(action.dataset.source).toBe(
      JSON.stringify({ kind: 'tasks', id: 'task' }),
    );
    expect(action.dataset.contract).toBe('contract-a');
    button(host, '取消办理').click();
    await settle();
    expect(host.querySelectorAll('[data-quote-id]')).toHaveLength(2);
    expect(host.querySelector<HTMLElement>('[data-action]')).toBeNull();
  });
  it('preserves external detail links and clears only the detail when closed', async () => {
    const { host, router } = await mount(
      QuotesWorkspace,
      '?contractId=contract-a&documentId=quote-b',
    );
    expect(
      host.querySelector<HTMLElement>('[data-detail]')?.dataset.detail,
    ).toBe('quote-b');
    button(host, '关闭详情').click();
    await settle();
    expect(router.currentRoute.value.query).toEqual({
      contractId: 'contract-a',
    });
    expect(host.querySelectorAll('[data-quote-id]')).toHaveLength(2);
  });
  it('keeps migrated standalone documents reachable without guessing a contract', async () => {
    mocks.page.mockResolvedValue({
      list: [{ ...row(), standaloneId: 'legacy-quote' }],
      total: 1,
    });
    const { host, router } = await mount(
      QuotesWorkspace,
      '?standaloneId=legacy-quote',
    );
    expect(
      host.querySelector<HTMLElement>('[data-standalone]')?.dataset.standalone,
    ).toBe('legacy-quote');
    expect(mocks.contract).not.toHaveBeenCalled();
    button(host, '关闭历史单据').click();
    await settle();
    expect(router.currentRoute.value.query).toEqual({});
    button(host, '查看详情').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-standalone]')).not.toBeNull();
  });
  it('ignores an old contract response after another quote is selected', async () => {
    mocks.page.mockResolvedValue({
      list: [row(), row(fixture('contract-b'))],
      total: 2,
    });
    const { host } = await mount();
    const stale = deferred<Contract>();
    mocks.contract
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(fixture('contract-b'));
    (
      host.querySelectorAll('.quote-record-select')[0] as HTMLButtonElement
    ).click();
    await nextTick();
    (
      host.querySelectorAll('.quote-record-select')[1] as HTMLButtonElement
    ).click();
    await settle();
    expect(host.querySelector('.comparison-heading')?.textContent).toContain(
      'HT-B',
    );
    stale.resolve(fixture());
    await settle();
    expect(host.querySelector('.comparison-heading')?.textContent).toContain(
      'HT-B',
    );
  });
  it('retains the comparison on refresh failure but blocks mutations until retry', async () => {
    const { host } = await mount();
    selectQuote(host, 'quote-a');
    await nextTick();
    mocks.contract.mockRejectedValueOnce(new Error('暂时离线'));
    button(host, '刷新').click();
    await settle();
    expect(host.textContent).toContain('报价资料未刷新');
    expect(host.querySelectorAll('[data-quote-id]')).toHaveLength(2);
    expect(button(host, '编制采购方案').disabled).toBe(true);
    button(host, '重试').click();
    await settle();
    expect(button(host, '编制采购方案').disabled).toBe(false);
  });
  it('disables a selected quote when the comparison quantity no longer meets its quoted interval', async () => {
    const { host } = await mount();
    selectQuote(host, 'quote-a');
    await nextTick();
    const quantity = host.querySelector<HTMLInputElement>('[data-quantity]')!;
    quantity.value = '101';
    quantity.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(button(host, '编制采购方案').disabled).toBe(true);
    expect(host.textContent).toContain('比较数量超过适用上限');
  });
});

describe('source task quote comparison dialog', () => {
  it('loads a complete task, does not preselect the representative quote, and creates a plan in place', async () => {
    const updated = vi.fn();
    const { host } = await mount(QuoteComparisonDialog, '', {
      open: true,
      contractId: 'contract-a',
      sourceQuoteId: 'quote-a',
      onUpdated: updated,
    });
    expect(host.querySelectorAll('[data-quote-id]')).toHaveLength(2);
    expect(button(host, '编制采购方案').disabled).toBe(true);
    selectQuote(host, 'quote-b');
    await nextTick();
    button(host, '编制采购方案').click();
    await settle();
    expect(
      [...host.querySelectorAll('button')].some(
        (entry) => entry.textContent === '关闭比较',
      ),
    ).toBe(false);
    expect(
      host.querySelector<HTMLElement>('[data-action]')?.dataset.source,
    ).toBe(JSON.stringify({ kind: 'quotes', id: 'quote-b' }));
    button(host, '保存办理').click();
    await settle();
    expect(updated).toHaveBeenCalledTimes(1);
    expect(
      host.querySelector<HTMLElement>('[data-comparison-dialog]'),
    ).not.toBeNull();
    expect(button(host, '关闭比较')).toBeDefined();
  });
  it('ignores pending data when the comparison dialog closes or changes its source', async () => {
    const pending = deferred<Contract>();
    mocks.contract.mockReturnValueOnce(pending.promise);
    const { host, state } = await mount(QuoteComparisonDialog, '', {
      open: true,
      contractId: 'contract-a',
      sourceQuoteId: 'quote-a',
    });
    state.open = false;
    await settle();
    pending.resolve(fixture());
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-comparison-dialog]'),
    ).toBeNull();
    state.contractId = 'contract-b';
    mocks.contract.mockResolvedValue(fixture('contract-b'));
    state.open = true;
    await settle();
    expect(host.querySelector('.comparison-heading')?.textContent).toContain(
      'HT-B',
    );
  });
});
