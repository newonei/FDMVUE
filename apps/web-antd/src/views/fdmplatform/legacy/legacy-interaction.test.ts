/* eslint-disable vue/one-component-per-file -- Small Ant Design adapters exercise the real history components and router without mounting global UI infrastructure. */
import type { Component, PropType, VNode } from 'vue';

import type {
  LegacyDetailView,
  LegacyRecord,
  LegacySummary,
} from '#/api/fdmplatform/legacy';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LegacyDetail from './LegacyDetail.vue';
import LegacyPanel from './LegacyPanel.vue';
import LegacyWorkspace from './LegacyWorkspace.vue';

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  records: vi.fn(),
  detail: vi.fn(),
}));
vi.mock('#/api/fdmplatform/legacy', () => ({
  getLegacySummary: mocks.summary,
  getLegacyRecords: mocks.records,
  getLegacyDetail: mocks.detail,
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup(_, ctx) {
      return () => h('div', [ctx.slots.extra?.(), ctx.slots.default?.()]);
    },
  });
  const button = defineComponent({
    setup(_, ctx) {
      return () => h('button', ctx.attrs, ctx.slots.default?.());
    },
  });
  const input = defineComponent({
    props: { value: { type: String, default: '' } },
    emits: ['update:value', 'pressEnter'],
    setup(props, ctx) {
      return () =>
        h('input', {
          ...ctx.attrs,
          value: props.value,
          onInput: (event: Event) =>
            ctx.emit('update:value', (event.target as HTMLInputElement).value),
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === 'Enter') ctx.emit('pressEnter');
          },
        });
    },
  });
  const select = defineComponent({
    props: {
      value: { type: [String, Array], default: undefined },
      options: {
        type: Array as PropType<{ label: string; value: string }[]>,
        default: () => [],
      },
    },
    emits: ['update:value', 'change'],
    setup(props, ctx) {
      return () =>
        h(
          'select',
          {
            ...ctx.attrs,
            value: props.value,
            onChange: (event: Event) => {
              const value = (event.target as HTMLSelectElement).value;
              ctx.emit('update:value', value);
              ctx.emit('change', value);
            },
          },
          props.options.map((option) =>
            h('option', { value: option.value }, option.label),
          ),
        );
    },
  });
  const table = defineComponent({
    props: {
      dataSource: {
        type: Array as PropType<Record<string, unknown>[]>,
        default: () => [],
      },
      columns: {
        type: Array as PropType<Record<string, unknown>[]>,
        default: () => [],
      },
      pagination: { type: [Object, Boolean], default: false },
    },
    emits: ['change'],
    setup(props, ctx) {
      return () =>
        h('section', { 'data-table': true }, [
          ...props.dataSource.map((record) =>
            h(
              'article',
              { 'data-row': String(record.id ?? record.rowNo ?? record.index) },
              props.columns.map((column) =>
                h(
                  'span',
                  ctx.slots.bodyCell?.({ column, record }) ??
                    String(record[String(column.dataIndex)] ?? ''),
                ),
              ),
            ),
          ),
          props.pagination && typeof props.pagination === 'object'
            ? h(
                'button',
                {
                  'data-next-page': true,
                  onClick: () =>
                    ctx.emit('change', {
                      current:
                        Number(
                          props.pagination &&
                            typeof props.pagination === 'object'
                            ? (props.pagination.current ?? 1)
                            : 1,
                        ) + 1,
                      pageSize:
                        typeof props.pagination === 'object'
                          ? props.pagination.pageSize
                          : 20,
                    }),
                },
                '下一页',
              )
            : null,
        ]);
    },
  });
  const drawer = defineComponent({
    props: { open: Boolean },
    setup(props, ctx) {
      return () =>
        props.open
          ? h('aside', [ctx.slots.extra?.(), ctx.slots.default?.()])
          : null;
    },
  });
  const tabs = defineComponent({
    props: { activeKey: { type: String, default: '' } },
    emits: ['update:activeKey'],
    setup(_, ctx) {
      return () => {
        const children = (ctx.slots.default?.() ?? []) as VNode[];
        return h('div', [
          children.map((child) =>
            h(
              'button',
              { onClick: () => ctx.emit('update:activeKey', child.key) },
              String(child.props?.tab ?? ''),
            ),
          ),
          children,
        ]);
      };
    },
  });
  const descriptions = Object.assign(block, { Item: block });
  return {
    Alert: defineComponent({
      props: {
        message: { type: String, default: '' },
        description: { type: String, default: '' },
      },
      setup(props) {
        return () =>
          h('p', `${props.message ?? ''} ${props.description ?? ''}`);
      },
    }),
    Button: button,
    Card: block,
    Checkbox: block,
    Descriptions: descriptions,
    Drawer: drawer,
    Empty: block,
    Input: input,
    Select: select,
    Space: block,
    Spin: block,
    Table: table,
    TabPane: block,
    Tabs: tabs,
    Tag: block,
  };
});

const unmounts: (() => void)[] = [];
function sourceSummary(counts?: LegacySummary['counts']): LegacySummary {
  return {
    batchId: 'batch-1',
    sourceSystem: 'JINZHI',
    counts: counts ?? { CONTRACT: 2 },
    totalRecords: 2,
    totalRows: 5,
    issueRecords: 0,
  };
}
function sourceRecord(
  id: string,
  extra: Partial<LegacyRecord> = {},
): LegacyRecord {
  return {
    id,
    kind: 'CONTRACT',
    externalId: id,
    documentNo: `JZ-${id}`,
    title: `合同${id}`,
    partyName: null,
    companyName: null,
    businessDate: null,
    sourceStatus: '结束',
    amount: null,
    amountLabel: '金额',
    currency: null,
    rowCount: 2,
    issueCount: 0,
    nativeType: null,
    nativeId: null,
    ...extra,
  };
}
function sourceDetail(
  id: string,
  extra: Partial<LegacyDetailView> = {},
): LegacyDetailView {
  return {
    record: sourceRecord(id),
    source: { file: '合同订单.xlsx', sheet: '数据', sha256: 'abc' },
    fields: [{ key: 'c1', label: '主题', value: `源字段-${id}` }],
    columns: [{ key: 'c1', label: '产品' }],
    list: [{ rowNo: 3, values: { c1: `产品-${id}` } }],
    total: 3,
    issues: [],
    relatedCounts: {},
    ...extra,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function flush() {
  for (let index = 0; index < 10; index++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount(
  component: Component,
  props: Record<string, unknown>,
  path = '/history',
  slot?: () => VNode,
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/history', component: { render: () => null } }],
  });
  await router.push(path);
  await router.isReady();
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp({
    render: () => h(component, props, slot ? { default: slot } : undefined),
  });
  app.use(router);
  app.mount(root);
  unmounts.push(() => {
    app.unmount();
    root.remove();
  });
  await flush();
  return { root, router };
}
function click(root: HTMLElement, text: string) {
  const button = [...root.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  );
  if (!button) throw new Error(`未找到按钮 ${text}`);
  button.click();
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.summary.mockResolvedValue(sourceSummary());
  mocks.records.mockResolvedValue({ list: [], total: 0 });
  mocks.detail.mockImplementation(async (id: string) => sourceDetail(id));
});
afterEach(() => {
  for (const unmount of unmounts.splice(0)) unmount();
});

describe('原系统记录真实组件交互', () => {
  it('有来源默认历史，点击当前业务后仍可使用原生新建入口', async () => {
    const { root, router } = await mount(
      LegacyWorkspace,
      { kinds: ['CONTRACT'] },
      '/history',
      () => h('button', '新建当前合同'),
    );
    expect(root.textContent).toContain('金智导入记录');
    expect(root.textContent).not.toContain('新建当前合同');
    click(root, '当前业务');
    await flush();
    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.dataSource).toBe('current');
    });
    expect(root.textContent).toContain('新建当前合同');
  });
  it('带原生合同定位时直接呈现当前页面，不被历史默认入口盖住', async () => {
    const { root } = await mount(
      LegacyWorkspace,
      { kinds: ['CONTRACT'] },
      '/history?contractId=native-contract',
      () => h('div', '当前合同详情'),
    );
    expect(root.textContent).toContain('当前合同详情');
    expect(mocks.records).not.toHaveBeenCalled();
  });
  it('产品范围summary和分页都携带productId，旧产品响应不能覆盖新产品', async () => {
    const old = deferred<{ list: LegacyRecord[]; total: number }>();
    mocks.records.mockImplementation((query: { productId: string }) =>
      query.productId === 'p1'
        ? old.promise
        : Promise.resolve({ list: [sourceRecord('B')], total: 40 }),
    );
    const props = reactive({ productId: 'p1' });
    const { root } = await mount(LegacyPanel, props);
    props.productId = 'p2';
    await flush();
    old.resolve({ list: [sourceRecord('A')], total: 100 });
    await flush();
    expect(mocks.summary).toHaveBeenLastCalledWith({
      productId: 'p2',
      relatedId: undefined,
    });
    expect(root.textContent).toContain('JZ-B');
    expect(root.textContent).not.toContain('JZ-A');
    click(root, '下一页');
    await flush();
    expect(mocks.records).toHaveBeenLastCalledWith(
      expect.objectContaining({ productId: 'p2', pageNo: 2, pageSize: 20 }),
    );
  });
  it('原字段中的HTML保持文字，重复标签列由独立键保留', async () => {
    mocks.detail.mockResolvedValue(
      sourceDetail('A', {
        fields: [
          { key: 'c1', label: '备注', value: '<img src=x onerror=alert(1)>' },
        ],
        columns: [
          { key: 'c1', label: '单据类型' },
          { key: 'c2', label: '单据类型' },
        ],
        list: [{ rowNo: 5, values: { c1: '原类型一', c2: '原类型二' } }],
      }),
    );
    const { root } = await mount(LegacyDetail, { open: true, id: 'A' });
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(root.textContent).toContain('原类型一');
    expect(root.textContent).toContain('原类型二');
    expect(root.textContent).toContain('文件未随表导出');
  });
  it('关联按relatedId和类别分页，点击目标精确打开并可返回原记录', async () => {
    mocks.detail.mockImplementation(async (id: string) =>
      sourceDetail(id, {
        relatedCounts: id === 'A' ? { PURCHASE_ORDER: 4 } : {},
      }),
    );
    mocks.records.mockResolvedValue({
      list: [sourceRecord('PO', { kind: 'PURCHASE_ORDER' })],
      total: 4,
    });
    const { root } = await mount(LegacyDetail, { open: true, id: 'A' });
    click(root, '关联原记录');
    await flush();
    expect(mocks.records).toHaveBeenLastCalledWith({
      relatedId: 'A',
      kind: 'PURCHASE_ORDER',
      pageNo: 1,
      pageSize: 10,
    });
    click(root, 'JZ-PO');
    await flush();
    expect(mocks.detail).toHaveBeenLastCalledWith('PO', {
      pageNo: 1,
      pageSize: 50,
    });
    expect(root.textContent).toContain('源字段-PO');
    click(root, '返回上一条');
    await flush();
    expect(mocks.detail).toHaveBeenLastCalledWith('A', {
      pageNo: 1,
      pageSize: 50,
    });
  });
  it('详情切换和关闭后返回的旧请求不会显示旧记录', async () => {
    const old = deferred<LegacyDetailView>();
    mocks.detail.mockImplementation((id: string) =>
      id === 'A' ? old.promise : Promise.resolve(sourceDetail(id)),
    );
    const props = reactive({ open: true, id: 'A' });
    const { root } = await mount(LegacyDetail, props);
    props.id = 'B';
    await flush();
    old.resolve(sourceDetail('A'));
    await flush();
    expect(root.textContent).toContain('源字段-B');
    expect(root.textContent).not.toContain('源字段-A');
    props.open = false;
    await flush();
    expect(root.querySelector('aside')).toBeNull();
  });
});
