/* eslint-disable vue/one-component-per-file -- Small adapters verify the live notifications page without business mutations. */
import type { PropType } from 'vue';

import type { ApprovalNotice } from '#/api/fdmplatform/approval-inbox';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Notifications from './index.vue';

const mocks = vi.hoisted(() => ({
  notices: vi.fn(),
  tasks: vi.fn(),
  route: { path: '/fdmprocurement/platform-approvals' },
}));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route }));
vi.mock('#/api/fdmplatform/approval-inbox', () => ({
  getApprovalNotices: mocks.notices,
  getApprovalTasks: mocks.tasks,
}));
vi.mock('../data', () => ({ errorText: (error: Error) => error.message }));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    props: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
    },
    setup: (props, context) => () =>
      h('main', [
        h('h1', props.title),
        h('p', props.description),
        context.slots.default?.(),
      ]),
  }),
}));
vi.mock('../documents/RelatedLink.vue', () => ({
  default: defineComponent({
    props: { target: { type: Object, default: undefined } },
    setup: (props, context) => () =>
      h(
        'a',
        { 'data-target': JSON.stringify(props.target) },
        context.slots.default?.(),
      ),
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, context) => () => h('div', context.slots.default?.()),
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup: (props) => () => h('p', { role: 'alert' }, props.message),
    }),
    Button: defineComponent({
      props: { loading: Boolean },
      setup: (props, context) => () =>
        h(
          'button',
          { ...context.attrs, disabled: props.loading },
          context.slots.default?.(),
        ),
    }),
    Card: block,
    Space: block,
    Table: defineComponent({
      props: {
        dataSource: {
          type: Array as PropType<ApprovalNotice[]>,
          default: () => [],
        },
        columns: {
          type: Array as PropType<{ key: string }[]>,
          default: () => [],
        },
        pagination: {
          type: Object as PropType<{
            current: number;
            onChange: (page: number) => void;
            total: number;
          }>,
          required: true,
        },
        loading: Boolean,
      },
      setup: (props, context) => () =>
        h(
          'section',
          {
            'data-table': true,
            'data-loading': props.loading,
            'data-current': props.pagination.current,
            'data-total': props.pagination.total,
          },
          [
            ...props.dataSource.map((record) =>
              h(
                'article',
                { 'data-notice': record.id },
                props.columns.map((column) =>
                  context.slots.bodyCell?.({ column, record }),
                ),
              ),
            ),
            h(
              'button',
              { onClick: () => props.pagination.onChange(2) },
              '第二页',
            ),
            props.dataSource.length > 0 ? null : context.slots.emptyText?.(),
          ],
        ),
    }),
  };
});
function notice(id = 'arrival-a'): ApprovalNotice {
  return {
    id,
    category: 'ARRIVAL',
    content: `到货通知 ${id}`,
    status: 'SENT',
    createdAt: '2026-09-18T09:00:00+08:00',
    contractId: 'contract-a',
    sourceId: id,
  };
}
async function settle() {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
const cleanups: (() => void)[] = [];
async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(Notifications);
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return host;
}
function click(host: Element, title: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (entry) => entry.textContent?.trim() === title,
  );
  expect(button).toBeDefined();
  button!.click();
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.route = reactive({ path: '/fdmprocurement/platform-approvals' });
  mocks.notices.mockResolvedValue({ list: [notice()], total: 21 });
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe('只保留到货业务通知', () => {
  it('初次进入只查询通知，保留到货单链接，不展示审核列表或待办弹窗', async () => {
    const host = await mount();
    expect(mocks.notices).toHaveBeenCalledWith({ pageNo: 1, pageSize: 20 });
    expect(mocks.tasks).not.toHaveBeenCalled();
    expect(host.textContent).toContain('业务通知');
    expect(host.textContent).toContain('到货通知 arrival-a');
    expect(host.textContent).toContain('已发送');
    expect(host.textContent).not.toContain('审批');
    expect(host.textContent).not.toContain('我的待办');
    expect(JSON.parse(host.querySelector('a')!.dataset.target!)).toEqual({
      type: 'document',
      kind: 'arrivals',
      contractId: 'contract-a',
      documentId: 'arrival-a',
    });
    expect(host.querySelector<HTMLElement>('[data-table]')!.dataset.total).toBe(
      '21',
    );
  });
  it('通知分页来自服务端，翻页和刷新不会请求审核数据', async () => {
    const host = await mount();
    mocks.notices.mockResolvedValue({ list: [notice('arrival-b')], total: 21 });
    click(host, '第二页');
    await settle();
    expect(mocks.notices).toHaveBeenLastCalledWith({ pageNo: 2, pageSize: 20 });
    expect(
      host.querySelector<HTMLElement>('[data-table]')!.dataset.current,
    ).toBe('2');
    expect(host.textContent).toContain('arrival-b');
    expect(host.textContent).not.toContain('arrival-a');
    click(host, '刷新通知');
    await settle();
    expect(mocks.notices).toHaveBeenLastCalledWith({ pageNo: 2, pageSize: 20 });
    expect(mocks.tasks).not.toHaveBeenCalled();
  });
  it('查询失败清除旧结果并允许原页重试，不把失败显示成空记录', async () => {
    const host = await mount();
    mocks.notices.mockRejectedValueOnce(new Error('通知服务暂时不可用'));
    click(host, '第二页');
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      '通知服务暂时不可用',
    );
    expect(host.querySelector('[data-table]')).toBeNull();
    expect(host.textContent).not.toContain('arrival-a');
    expect(host.textContent).not.toContain('暂无到货通知');
    mocks.notices.mockResolvedValue({ list: [], total: 0 });
    click(host, '刷新通知');
    await settle();
    expect(mocks.notices).toHaveBeenLastCalledWith({ pageNo: 2, pageSize: 20 });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain('暂无到货通知');
  });
  it('迟到页响应不能覆盖新页，加载期间有明确状态', async () => {
    let finishFirst!: (value: {
      list: ApprovalNotice[];
      total: number;
    }) => void;
    mocks.notices.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    );
    const host = await mount();
    expect(
      host.querySelector<HTMLElement>('[data-table]')!.dataset.loading,
    ).toBe('true');
    expect(host.textContent).toContain('正在读取通知');
    mocks.notices.mockResolvedValue({ list: [notice('new-page')], total: 25 });
    click(host, '第二页');
    await settle();
    finishFirst({ list: [notice('old-page')], total: 21 });
    await settle();
    expect(host.textContent).toContain('new-page');
    expect(host.textContent).not.toContain('old-page');
    expect(host.querySelector<HTMLElement>('[data-table]')!.dataset.total).toBe(
      '25',
    );
  });
  it('离开页面取消旧响应影响，返回时重新加载当前页', async () => {
    let failOld!: (reason: Error) => void;
    mocks.notices.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failOld = reject;
        }),
    );
    const host = await mount();
    mocks.route.path = '/other';
    await nextTick();
    failOld(new Error('离开后旧请求失败'));
    await settle();
    expect(host.textContent).not.toContain('离开后旧请求失败');
    mocks.route.path = '/fdmprocurement/platform-approvals';
    await settle();
    expect(mocks.notices).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('arrival-a');
    expect(mocks.tasks).not.toHaveBeenCalled();
  });
});
