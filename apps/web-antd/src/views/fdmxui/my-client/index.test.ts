import type { FdmxuiClientApi } from '#/api/fdmxui/client';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MyClient from './index.vue';

const api = vi.hoisted(() => ({
  getMyFdmxuiClientLinks: vi.fn(),
  getMyFdmxuiClientPage: vi.fn(),
  prepareMyClashImport: vi.fn(),
}));
const grid = vi.hoisted(() => ({ rows: [] as FdmxuiClientApi.Client[] }));

vi.mock('#/api/fdmxui/client', () => api);
vi.mock('#/api/fdmxui/panel', () => ({ getSimpleFdmxuiPanelList: vi.fn() }));
vi.mock('#/utils', () => ({ getRangePickerDefaultProps: () => ({}) }));
vi.mock('@vueuse/core', () => ({ useClipboard: () => ({ copy: vi.fn() }) }));
vi.mock('../client/modules/link-detail-modal.vue', () => ({
  default: { render: () => null },
}));
vi.mock('@vben/common-ui', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Page: defineComponent({
      setup(_props, { slots }) {
        return () => h('main', slots.default?.());
      },
    }),
  };
});
vi.mock('#/adapter/vxe-table', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    TableAction: defineComponent({
      props: ['actions'],
      setup(props) {
        return () =>
          h(
            'div',
            props.actions.map(
              (action: {
                disabled?: boolean;
                label: string;
                onClick: () => void;
              }) =>
                h(
                  'button',
                  { disabled: action.disabled, onClick: action.onClick },
                  action.label,
                ),
            ),
          );
      },
    }),
    useVbenVxeGrid: () => [
      defineComponent({
        setup(_props, { slots }) {
          return () => h('div', grid.rows.map((row) => slots.actions?.({ row })));
        },
      }),
    ],
  };
});
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Alert: defineComponent({
      props: ['description', 'message'],
      setup(props) {
        return () =>
          h('div', { role: 'alert' }, [props.message, props.description]);
      },
    }),
    Button: defineComponent({
      props: ['href'],
      setup(props, { attrs, slots }) {
        return () =>
          h(
            props.href ? 'a' : 'button',
            { ...attrs, href: props.href },
            slots.default?.(),
          );
      },
    }),
    message: { error: vi.fn(), success: vi.fn() },
    Modal: defineComponent({
      props: ['open', 'title'],
      setup(props, { slots }) {
        return () =>
          props.open
            ? h('section', { 'aria-label': props.title, role: 'dialog' }, [
                slots.default?.(),
                slots.footer?.(),
              ])
            : null;
      },
    }),
    Spin: { render: () => null },
  };
});

const cachedUrl = 'https://old.example.com/clash/cached-subscription';
const latestUrl =
  'https://subscriptions.example.com/clash/current?token=a%2Fb&name=办公 #测试';
const expectedImportUrl =
  `clash://install-config?url=${encodeURIComponent(latestUrl)}`;
const cleanup: Array<() => void> = [];

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

function mount(status = 1) {
  const row: FdmxuiClientApi.Client = {
    clashSubscriptionUrl: cachedUrl,
    id: 7,
    status,
  };
  grid.rows = [row];
  const container = document.createElement('div');
  const app = createApp(MyClient);
  app.mount(container);
  cleanup.push(() => app.unmount());
  const button = (text: string) => {
    const element = [...container.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === text,
    );
    expect(element, `button ${text}`).toBeTruthy();
    return element!;
  };
  return { button, container, row };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { userActivation: { isActive: true } });
  vi.spyOn(window.location, 'assign').mockImplementation(() => {});
  api.prepareMyClashImport.mockResolvedValue({
    clashSubscriptionUrl: latestUrl,
    id: 7,
    status: 1,
  });
});

afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('my client Clash Verge import', () => {
  it('shows the subscription 404 error without offering an invalid import link', async () => {
    api.prepareMyClashImport.mockRejectedValueOnce({
      response: { data: { msg: 'Clash 订阅地址返回 HTTP 404，请联系管理员检查订阅' } },
    });
    const { button, container } = mount();
    button('导入 Clash Verge').click();
    await settle();

    expect(api.prepareMyClashImport).toHaveBeenCalledWith(7);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Clash 订阅地址返回 HTTP 404，请联系管理员检查订阅',
    );
    expect(container.textContent).toContain('订阅检查失败，尚未导入');
    expect(container.querySelector('a[href]')).toBeNull();
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(button('重新检查').disabled).toBe(false);
  });

  it('opens the checked URL and encodes the complete subscription query', async () => {
    const { button, row } = mount();
    button('导入 Clash Verge').click();
    await settle();

    expect(window.location.assign).toHaveBeenCalledExactlyOnceWith(
      expectedImportUrl,
    );
    const importedUrl = new URL(
      vi.mocked(window.location.assign).mock.calls[0]![0].toString(),
    );
    expect(importedUrl.searchParams.get('url')).toBe(latestUrl);
    expect([...importedUrl.searchParams.keys()]).toEqual(['url']);
    expect(row.clashSubscriptionUrl).toBe(latestUrl);
  });

  it('offers the compatibility import link when user activation has expired', async () => {
    vi.stubGlobal('navigator', { userActivation: { isActive: false } });
    const { button, container } = mount();
    button('导入 Clash Verge').click();
    await settle();

    expect(window.location.assign).not.toHaveBeenCalled();
    expect(container.textContent).toContain('订阅检查通过，点击下方按钮打开 Clash Verge');
    const links = [...container.querySelectorAll('a[href]')];
    const open = links.find((item) => item.textContent?.trim() === '打开 Clash Verge 并导入');
    expect(open?.getAttribute('href')).toBe(expectedImportUrl);
    expect(links.every((item) => item.getAttribute('href')?.startsWith('clash://'))).toBe(true);
  });

  it('ignores an in-flight check after the user closes the dialog', async () => {
    let finishCheck!: (client: FdmxuiClientApi.Client) => void;
    api.prepareMyClashImport.mockImplementationOnce(
      () => new Promise((resolve) => { finishCheck = resolve; }),
    );
    const { button, container, row } = mount();
    button('导入 Clash Verge').click();
    await nextTick();
    expect(container.textContent).toContain('正在获取最新订阅并检查配置');
    button('关闭').click();
    await nextTick();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    finishCheck({ clashSubscriptionUrl: latestUrl, id: 7, status: 1 });
    await settle();

    expect(window.location.assign).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('a[href]')).toBeNull();
    expect(row.clashSubscriptionUrl).toBe(cachedUrl);
    expect(button('导入 Clash Verge').disabled).toBe(false);
  });

  it('disables import for a recycled subscription', async () => {
    const { button, container } = mount(2);
    const importButton = button('导入 Clash Verge');
    expect(importButton.disabled).toBe(true);
    importButton.click();
    await settle();

    expect(api.prepareMyClashImport).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
