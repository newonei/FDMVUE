import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { clampDrawerWidth, drawerWidthStorageKey } from './drawer-width';
import FdmResizableDrawer from './fdm-resizable-drawer.vue';

// happy-dom 不支持 CSS min()，用桩组件记录传给 Drawer 的 width
vi.mock('ant-design-vue', () => ({
  Drawer: defineComponent({
    props: { open: Boolean, width: [Number, String] },
    setup(props, { slots }) {
      return () =>
        props.open
          ? h(
              'div',
              {
                class: 'ant-drawer-content-wrapper',
                'data-width': String(props.width),
              },
              [h('div', { class: 'ant-drawer-body' }, slots.default?.())],
            )
          : null;
    },
  }),
}));

async function flush() {
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function mountDrawer(props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(FdmResizableDrawer, { open: true, title: '采购单', ...props }, () =>
        h('p', { class: 'drawer-body' }, '单据内容'),
      ),
  });
  app.mount(host);
  return () => {
    app.unmount();
    host.remove();
  };
}

function wrapperEl() {
  return document.querySelector<HTMLElement>('.ant-drawer-content-wrapper');
}

function pointer(type: string, clientX: number) {
  return new PointerEvent(type, { bubbles: true, button: 0, clientX });
}

describe('clampDrawerWidth', () => {
  it('keeps the width between min width and viewport minus the outside gutter', () => {
    expect(clampDrawerWidth(200, 360, 1440)).toBe(360);
    expect(clampDrawerWidth(900.4, 360, 1440)).toBe(900);
    expect(clampDrawerWidth(2000, 360, 1440)).toBe(1392);
    expect(clampDrawerWidth(500, 360, 300)).toBe(252);
  });
});

describe('FdmResizableDrawer', () => {
  let unmount: (() => void) | undefined;

  afterEach(() => {
    unmount?.();
    unmount = undefined;
    localStorage.clear();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('drags the left edge, saves the width and restores it on reopen', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1600);
    unmount = mountDrawer({ resizeKey: 'purchase-order', width: 1000 });
    await flush();

    const wrapper = wrapperEl();
    expect(wrapper?.dataset.width).toBe('1000');
    vi.spyOn(wrapper!, 'getBoundingClientRect').mockReturnValue({
      right: 1600,
    } as DOMRect);
    const handle = wrapper!.querySelector<HTMLElement>(
      '.fdm-resizable-drawer__handle',
    );
    expect(handle).toBeTruthy();

    handle!.dispatchEvent(pointer('pointerdown', 600));
    handle!.dispatchEvent(pointer('pointermove', 400));
    await flush();
    expect(wrapper!.dataset.width).toBe('min(1200px, calc(100vw - 48px))');

    handle!.dispatchEvent(pointer('pointerup', 400));
    expect(localStorage.getItem(drawerWidthStorageKey('purchase-order'))).toBe(
      '1200',
    );

    unmount();
    unmount = mountDrawer({ resizeKey: 'purchase-order', width: 1000 });
    await flush();
    expect(wrapperEl()?.dataset.width).toBe('min(1200px, calc(100vw - 48px))');
  });

  it('double click resets to the default width', async () => {
    localStorage.setItem(drawerWidthStorageKey('contract-detail'), '900');
    unmount = mountDrawer({ resizeKey: 'contract-detail', width: 1320 });
    await flush();
    const wrapper = wrapperEl();
    expect(wrapper?.dataset.width).toBe('min(900px, calc(100vw - 48px))');

    wrapper!
      .querySelector<HTMLElement>('.fdm-resizable-drawer__handle')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    expect(wrapper!.dataset.width).toBe('1320');
    expect(
      localStorage.getItem(drawerWidthStorageKey('contract-detail')),
    ).toBeNull();
  });

  it('keeps the original width when resizing is turned off', async () => {
    localStorage.setItem(drawerWidthStorageKey('product-detail'), '900');
    unmount = mountDrawer({
      resizable: false,
      resizeKey: 'product-detail',
      width: '100vw',
    });
    await flush();
    const wrapper = wrapperEl();
    expect(wrapper?.dataset.width).toBe('100vw');
    expect(wrapper?.querySelector('.fdm-resizable-drawer__handle')).toBeNull();
  });
});
