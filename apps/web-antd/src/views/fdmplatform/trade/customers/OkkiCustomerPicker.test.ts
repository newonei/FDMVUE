/* eslint-disable vue/one-component-per-file -- Small UI adapters exercise the real directory workflow without overlays. */
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OkkiCustomerPicker from './OkkiCustomerPicker.vue';

const api = vi.hoisted(() => ({
  status: vi.fn(),
  directory: vi.fn(),
  refresh: vi.fn(),
  pause: vi.fn(),
  options: vi.fn(),
  search: vi.fn(),
  preview: vi.fn(),
  sync: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  newIdempotencyKey: () => 'customer-test-request',
}));
vi.mock('#/api/fdmplatform/customers', () => ({
  getOkkiCustomerStatus: api.status,
  getOkkiDirectoryStatus: api.directory,
  refreshOkkiDirectory: api.refresh,
  pauseOkkiDirectory: api.pause,
  getCustomerOptions: api.options,
  searchOkkiCustomers: api.search,
  previewOkkiCustomer: api.preview,
  syncOkkiCustomer: api.sync,
  getCustomer: vi.fn(),
  refreshOkkiCustomer: vi.fn(),
}));
vi.mock('../../data', () => ({ errorText: (error: Error) => error.message }));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, context) => () => h('div', context.slots.default?.()),
  });
  return {
    Alert: defineComponent({
      props: {
        message: { type: String, default: '' },
        description: { type: String, default: '' },
      },
      setup: (props) => () => h('p', `${props.message} ${props.description}`),
    }),
    Button: defineComponent({
      props: { disabled: Boolean },
      emits: ['click'],
      setup: (props, context) => () =>
        h(
          'button',
          { disabled: props.disabled, onClick: () => context.emit('click') },
          context.slots.default?.(),
        ),
    }),
    Drawer: defineComponent({
      props: { open: Boolean },
      setup: (props, context) => () =>
        props.open ? h('section', context.slots.default?.()) : null,
    }),
    Input: defineComponent({
      props: { value: { type: String, default: '' }, disabled: Boolean },
      emits: ['update:value'],
      setup: (props, context) => () =>
        h('input', {
          value: props.value,
          disabled: props.disabled,
          onInput: (event: Event) =>
            context.emit(
              'update:value',
              (event.target as HTMLInputElement).value,
            ),
        }),
    }),
    Table: defineComponent({
      props: { dataSource: { type: Array, default: () => [] } },
      setup: (props, context) => () =>
        h('div', [
          h('pre', JSON.stringify(props.dataSource)),
          ...props.dataSource.map((record) =>
            context.slots.bodyCell?.({ column: { key: 'action' }, record }),
          ),
        ]),
    }),
    Empty: block,
    Space: block,
    Tag: block,
    Card: block,
    Select: block,
    Descriptions: Object.assign(block, { Item: block }),
    message: { success: vi.fn() },
  };
});
const initial = {
  status: 'NEVER',
  indexedCount: 0,
  scannedCount: 0,
  remoteTotal: null,
  complete: false,
  updatedAt: null,
  completedAt: null,
  lastError: null,
};
const disposals: (() => void)[] = [];
async function waitForDirectoryRequest() {
  await vi.waitFor(() => expect(api.directory).toHaveBeenCalled());
}
async function mount(waitForDirectory = true) {
  const props = reactive({ open: false });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(OkkiCustomerPicker, props) });
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  props.open = true;
  await nextTick();
  if (waitForDirectory) await waitForDirectoryRequest();
  await nextTick();
  return { props, host };
}
function click(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(label),
  );
  expect(button).toBeTruthy();
  button!.click();
}
beforeEach(() => {
  vi.clearAllMocks();
  api.status.mockResolvedValue({ configured: true, enabled: true });
  api.options.mockResolvedValue({ countries: [] });
  api.directory.mockResolvedValue(initial);
  api.refresh.mockResolvedValue({ ...initial, status: 'RUNNING' });
  api.pause.mockResolvedValue({ ...initial, status: 'PAUSED' });
  api.search.mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
    matchedTotal: 0,
    notice: '目录尚未完整',
    directory: initial,
  });
});
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  vi.useRealTimers();
});

describe('persistent OKKI directory workflow', () => {
  it('finishes connection initialization even if a pending keyword update occurs', async () => {
    let resolveStatus!: (status: {
      configured: boolean;
      enabled: boolean;
    }) => void;
    api.status.mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );
    const { host } = await mount(false);
    const input = host.querySelector('input')!;
    expect(input.disabled).toBe(true);
    // A delayed input event must not invalidate connection setup or strand the picker.
    input.value = 'Acme';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    resolveStatus({ configured: true, enabled: true });
    await vi.waitFor(() => expect(api.directory).toHaveBeenCalled());
    await nextTick();
    expect(input.disabled).toBe(false);
    click(host, '搜索客户目录');
    await vi.waitFor(() =>
      expect(api.search).toHaveBeenCalledWith({ keyword: 'Acme', cursor: 1 }),
    );
  });
  it('does not start a remote directory job on opening or searching and explains incomplete results', async () => {
    const { host } = await mount();
    expect(host.textContent).toContain('请先建立 OKKI 客户目录');
    expect(api.refresh).not.toHaveBeenCalled();
    click(host, '搜索客户目录');
    await vi.waitFor(() =>
      expect(api.search).toHaveBeenCalledWith({ keyword: '', cursor: 1 }),
    );
    expect(api.refresh).not.toHaveBeenCalled();
    expect(api.preview).not.toHaveBeenCalled();
    expect(api.sync).not.toHaveBeenCalled();
  });
  it('starts only on explicit update and closing the window stops polling without pausing the durable job', async () => {
    const { host, props } = await mount();
    click(host, '更新客户目录');
    await vi.waitFor(() => expect(api.refresh).toHaveBeenCalledWith(false));
    await nextTick();
    expect(host.textContent).toContain('关闭窗口后仍会继续');
    props.open = false;
    await nextTick();
    expect(api.pause).not.toHaveBeenCalled();
  });
  it('preserves query and accumulates additional matching result pages rather than remote scan pages', async () => {
    const complete = {
      ...initial,
      status: 'COMPLETE',
      indexedCount: 97_085,
      complete: true,
      completedAt: '2026-09-18T02:00:00Z',
    };
    api.directory.mockResolvedValue(complete);
    api.search.mockResolvedValueOnce({
      items: [{ externalId: '501', name: 'Target One' }],
      nextCursor: 2,
      hasMore: true,
      matchedTotal: 2,
      directory: complete,
    });
    api.search.mockResolvedValueOnce({
      items: [{ externalId: '97085', name: 'Target Last' }],
      nextCursor: null,
      hasMore: false,
      matchedTotal: 2,
      directory: complete,
    });
    const { host } = await mount();
    const input = host.querySelector('input')!;
    input.value = 'Target';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    click(host, '搜索客户目录');
    await vi.waitFor(() => expect(host.textContent).toContain('Target One'));
    click(host, '加载更多匹配客户');
    await vi.waitFor(() => expect(host.textContent).toContain('Target Last'));
    expect(host.textContent).toContain('Target One');
    expect(api.search).toHaveBeenNthCalledWith(2, {
      keyword: 'Target',
      cursor: 2,
    });
    expect(api.refresh).not.toHaveBeenCalled();
  });
  it('reads live details after selecting a directory entry and confirms the live preview hash', async () => {
    api.options.mockResolvedValue({
      countries: [{ code: 'CN', nameZh: '中国', nameEn: 'China', iso3: 'CHN' }],
    });
    api.search.mockResolvedValue({
      items: [{ externalId: '601', name: 'Cached name' }],
      nextCursor: null,
      hasMore: false,
      matchedTotal: 1,
      directory: initial,
    });
    api.preview.mockResolvedValue({
      customer: {
        externalId: '601',
        name: 'Live name',
        country: 'CN',
        sourceCustomerSource: '最新获客来源',
      },
      previewHash: 'live-detail-hash',
      fetchedAt: '2026-09-18T00:00:00Z',
    });
    api.sync.mockResolvedValue({ id: 'local-customer', name: 'Live name' });
    const { host } = await mount();
    click(host, '搜索客户目录');
    await vi.waitFor(() => expect(host.textContent).toContain('Cached name'));
    click(host, '预览资料');
    await vi.waitFor(() => expect(api.preview).toHaveBeenCalledWith('601'));
    await nextTick();
    expect(host.textContent).toContain('Live name');
    expect(host.textContent).toContain('最新获客来源');
    expect(api.sync).not.toHaveBeenCalled();
    click(host, '确认同步到客户档案');
    await vi.waitFor(() =>
      expect(api.sync).toHaveBeenCalledWith({
        externalId: '601',
        previewHash: 'live-detail-hash',
        country: 'CN',
        expectedVersion: undefined,
        idempotencyKey: 'customer-test-request',
      }),
    );
  });
});
