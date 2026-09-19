/* eslint-disable vue/one-component-per-file -- Render small UI adapters around the real workbench state machine. */
import type { PropType } from 'vue';

import type { ProcurementWorkItem } from '#/api/fdmplatform/procurement-workbench';

import { createApp, defineComponent, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Workbench from './ProcurementWorkbench.vue';

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  contract: vi.fn(),
  directory: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  getContract: mocks.contract,
  getDirectory: mocks.directory,
}));
vi.mock('#/api/fdmplatform/procurement-workbench', () => ({
  getProcurementWorkbench: mocks.page,
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));
vi.mock('../../documents/RelatedLink.vue', () => ({
  default: defineComponent({
    setup: (_, ctx) => () => h('span', ctx.slots.default?.()),
  }),
}));
vi.mock('../../documents/DocumentWorkspace.vue', () => ({
  default: defineComponent({
    render: () => h('section', { 'data-history': true }, '全部申请与任务'),
  }),
}));
vi.mock('../../documents/BusinessDocumentDetail.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      id: { type: String, default: undefined },
      kind: { type: String, default: undefined },
    },
    emits: ['close'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            { 'data-native-id': props.id, 'data-kind': props.kind },
            h('button', { onClick: () => ctx.emit('close') }, '关闭历史单据'),
          )
        : null,
  }),
}));
vi.mock('../../documents/RecordDetail.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      kind: { type: String, default: undefined },
      row: { type: Object, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            { 'data-detail': props.row?.id, 'data-kind': props.kind },
            h('button', { onClick: () => ctx.emit('close') }, '关闭完整单据'),
          )
        : null,
  }),
}));
vi.mock('../../documents/DocumentAction.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      kind: { type: String, default: undefined },
      action: { type: String, default: undefined },
      contractId: { type: String, default: undefined },
      source: { type: Object, default: undefined },
      lockContract: Boolean,
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
              'data-source': JSON.stringify(props.source),
              'data-locked': String(props.lockContract),
            },
            [
              h('button', { onClick: () => ctx.emit('close') }, '取消操作'),
              h(
                'button',
                {
                  onClick: () => ctx.emit('updated', { id: props.contractId }),
                },
                '保存操作',
              ),
            ],
          )
        : null,
  }),
}));
vi.mock('../quotes/QuoteComparisonDialog.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      contractId: { type: String, default: undefined },
      sourceQuoteId: { type: String, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-compare': props.sourceQuoteId,
              'data-contract': props.contractId,
            },
            h('button', { onClick: () => ctx.emit('close') }, '关闭比价'),
          )
        : null,
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
      props: { disabled: Boolean, loading: Boolean },
      setup: (props, ctx) => () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.disabled || props.loading },
          ctx.slots.default?.(),
        ),
    }),
    Empty: block,
    Select: block,
    Input: {
      Search: defineComponent({
        props: { value: { type: String, default: undefined } },
        emits: ['update:value', 'search'],
        setup: (props, ctx) => () =>
          h('input', {
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
    Pagination: defineComponent({
      props: { current: { type: Number, default: 1 } },
      emits: ['change'],
      setup: (props, ctx) => () =>
        h(
          'button',
          {
            'data-current-page': props.current,
            onClick: () => ctx.emit('change', 2),
          },
          '第二页',
        ),
    }),
    Table: defineComponent({
      props: {
        dataSource: {
          type: Array as PropType<ProcurementWorkItem[]>,
          default: () => [],
        },
        columns: {
          type: Array as PropType<{ key: string }[]>,
          default: () => [],
        },
      },
      setup: (props, ctx) => () =>
        h('div', { 'data-list': true }, [
          ...props.dataSource.map((record) =>
            h(
              'article',
              { 'data-entry': record.key },
              props.columns.map((column) =>
                ctx.slots.bodyCell?.({ column, record }),
              ),
            ),
          ),
          props.dataSource.length > 0 ? null : ctx.slots.emptyText?.(),
        ]),
    }),
  };
});

function entry(
  key = 'a',
  stage: ProcurementWorkItem['stage'] = 'quote',
  kind: ProcurementWorkItem['kind'] = 'tasks',
): ProcurementWorkItem {
  return {
    key,
    stage,
    kind,
    title: `需求${key}`,
    subtitle: '瑜伽垫',
    quantity: '10',
    unit: '件',
    ownerUserIds: [1],
    row: {
      id: `source-${key}`,
      contractId: 'contract-a',
      contractCode: 'HT-001',
      contractName: '订单甲',
      contractVersion: 1,
      companyId: 1,
      contractStatus: 'CONFIRMED',
      allowedActions: ['CREATE_QUOTE', 'SAVE_PLAN', 'ASSIGN_FULFILLMENT'],
      record: { id: `source-${key}`, status: 'ASSIGNED', method: 'BUY' },
    },
  };
}
function response(list = [entry()]) {
  return {
    list,
    total: 21,
    counts: {
      all: 21,
      intake: 5,
      quote: 6,
      plan: 4,
      review: 2,
      order: 1,
      arrival: 2,
      production: 1,
    },
  };
}
const disposals: (() => void)[] = [];
async function settle() {
  for (let index = 0; index < 5; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
async function mount(query = '') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/workbench', component: { render: () => null } }],
  });
  await router.push(`/workbench${query}`);
  await router.isReady();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(Workbench) });
  app.use(router);
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, router };
}
function button(host: HTMLElement, title: string) {
  const value = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === title,
  );
  expect(value).toBeDefined();
  return value!;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.page.mockResolvedValue(response());
  mocks.directory.mockResolvedValue({
    users: [{ id: 1, nickname: 'Owen' }],
    departments: [],
    companies: [],
  });
});
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

describe('采购工作台交互与全量查询', () => {
  it('阶段数字来自服务端，不以当前页条数代替；我负责和分页发送真实查询条件', async () => {
    const { host } = await mount('?contractId=contract-a');
    expect(mocks.directory).toHaveBeenCalledWith(0);
    expect(host.querySelector('nav')?.textContent).toContain('全部待办21');
    button(host, '我负责的').click();
    await settle();
    button(host, '第二页').click();
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith({
      contractId: 'contract-a',
      stage: 'all',
      mine: true,
      keyword: undefined,
      pageNo: 2,
      pageSize: 10,
    });
  });
  it('列表选中、关闭、重新打开及前后切换只改变摘要，保持原路由与查询页', async () => {
    mocks.page.mockResolvedValue(response([entry(), entry('b')]));
    const { host, router } = await mount();
    button(host, '第二页').click();
    await settle();
    button(host, '需求a').click();
    await settle();
    expect(host.querySelector('aside')?.textContent).toContain('需求a');
    button(host, '下一条').click();
    await settle();
    expect(host.querySelector('aside')?.textContent).toContain('需求b');
    button(host, '关闭').click();
    await settle();
    expect(host.querySelector('aside')).toBeNull();
    button(host, '需求a').click();
    await settle();
    expect(host.querySelector('aside')).not.toBeNull();
    expect(
      host.querySelector<HTMLElement>('[data-current-page]')?.dataset
        .currentPage,
    ).toBe('2');
    expect(router.currentRoute.value.fullPath).toBe('/workbench');
  });
  it('动作继承源任务并锁定合同，保存只刷新当前页并保留筛选', async () => {
    const { host } = await mount();
    button(host, '我负责的').click();
    await settle();
    button(host, '第二页').click();
    await settle();
    button(host, '录入报价').click();
    await settle();
    const action = host.querySelector<HTMLElement>('[data-action]')!;
    expect(action.dataset.action).toBe('CREATE_QUOTE');
    expect(action.dataset.contract).toBe('contract-a');
    expect(action.dataset.source).toBe(
      JSON.stringify({ kind: 'tasks', id: 'source-a' }),
    );
    expect(action.dataset.locked).toBe('true');
    button(host, '保存操作').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-action]')).toBeNull();
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ mine: true, pageNo: 2 }),
    );
  });
  it('方案阶段报价打开比选，旧审核单据直接进入方案生效办理', async () => {
    mocks.page.mockResolvedValue(
      response([
        entry('quote', 'plan', 'quotes'),
        entry('review', 'review', 'plans'),
      ]),
    );
    const { host } = await mount();
    button(host, '比较报价').click();
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-compare]')?.dataset.compare,
    ).toBe('source-quote');
    expect(host.querySelector<HTMLElement>('[data-action]')).toBeNull();
    button(host, '关闭比价').click();
    await settle();
    button(host, '办理方案生效').click();
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-detail]')?.dataset.detail,
    ).toBe('source-review');
    expect(host.querySelector<HTMLElement>('[data-action]')).toBeNull();
  });
  it('没有变更权限或存在阻断时只提供查看入口', async () => {
    const blocked = entry();
    blocked.row.blockReasons = ['缺少必要资料'];
    const forbidden = entry('b');
    forbidden.row.allowedActions = [];
    mocks.page.mockResolvedValue(response([blocked, forbidden]));
    const { host } = await mount();
    expect(host.textContent).not.toContain('录入报价');
    button(host, '查看详情').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-detail]')).not.toBeNull();
  });
  it('刷新失败保留原结果，更换筛选后失败则不显示旧范围记录或虚假零统计', async () => {
    const { host } = await mount();
    mocks.page.mockRejectedValue(new Error('读取失败'));
    button(host, '刷新').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-entry]')).not.toBeNull();
    button(host, '我负责的').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-entry]')).toBeNull();
    expect(host.querySelector('nav')?.textContent).toContain('全部待办—');
  });
  it('旧任务深链接可打开，关闭保留合同筛选，独立历史单据身份不丢失', async () => {
    mocks.contract.mockResolvedValue({
      id: 'contract-a',
      code: 'HT-001',
      status: 'CONFIRMED',
      version: 1,
      companyId: 1,
      allowedActions: [],
      assignments: [{ id: 'task-a' }],
    });
    const { host, router } = await mount(
      '?contractId=contract-a&documentId=task-a&queue=tasks',
    );
    expect(host.querySelector<HTMLElement>('[data-detail]')?.dataset.kind).toBe(
      'tasks',
    );
    button(host, '关闭完整单据').click();
    await settle();
    expect(router.currentRoute.value.query).toEqual({
      contractId: 'contract-a',
      queue: 'tasks',
    });
    await router.push({ query: { standaloneId: 'native-a', queue: 'intake' } });
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-native-id]')?.dataset.nativeId,
    ).toBe('native-a');
    expect(
      host.querySelector<HTMLElement>('[data-native-id]')?.dataset.kind,
    ).toBe('requests');
  });
  it('看板明确只展示当前页，全部申请与任务可切回原查询入口', async () => {
    const { host } = await mount();
    button(host, '看板').click();
    await settle();
    expect(host.textContent).toContain('当前页看板');
    button(host, '全部申请与任务').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-history]')).not.toBeNull();
    button(host, '返回采购工作台').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-history]')).toBeNull();
    expect(host.textContent).toContain('采购工作台');
  });
  it('较早查询晚返回时不覆盖新的负责人筛选', async () => {
    let resolveOld: ((value: ReturnType<typeof response>) => void) | undefined;
    mocks.page
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue(response([entry('mine')]));
    const { host } = await mount();
    button(host, '我负责的').click();
    await settle();
    resolveOld?.(response([entry('old')]));
    await settle();
    expect(host.textContent).toContain('需求mine');
    expect(host.textContent).not.toContain('需求old');
  });
  it('保存清空末页后回到有效末页，合同筛选切换回第一页', async () => {
    const { host, router } = await mount();
    button(host, '第二页').click();
    await settle();
    button(host, '录入报价').click();
    await settle();
    mocks.page
      .mockResolvedValueOnce({ ...response([]), total: 9 })
      .mockResolvedValue({ ...response(), total: 9 });
    button(host, '保存操作').click();
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 1 }),
    );
    mocks.page.mockResolvedValue(response());
    button(host, '第二页').click();
    await settle();
    await router.push({ query: { contractId: 'another-contract' } });
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 1, contractId: 'another-contract' }),
    );
  });
});
