import { createApp, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import BindProductDialog from './BindProductDialog.vue';

const mocks = vi.hoisted(() => ({
  bind: vi.fn(),
  search: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/stage-stock', () => ({
  bindStageItemProduct: mocks.bind,
  searchSemiProducts: mocks.search,
}));

const stock = {
  id: 1,
  item: { productCode: 'PC-TPE-MB', productId: 'auto-1' },
  itemCode: 'PC-TPE-MB',
  itemId: 9,
  stage: 'SHEET',
} as never;

async function flush() {
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await Promise.resolve();
  }
}

function mount(onSaved: () => void, onClose: () => void) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(BindProductDialog, { onClose, onSaved, stock }),
  });
  app.mount(host);
  return () => {
    app.unmount();
    host.remove();
  };
}

function button(text: string) {
  return [...document.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').replaceAll(/\s/g, '').includes(text),
  )!;
}

describe('绑定产品弹窗', () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('显示当前产品，没选产品不能绑定，可以恢复自动建的产品', async () => {
    mocks.bind.mockResolvedValue({});
    const saved = vi.fn();
    const closed = vi.fn();
    const unmount = mount(saved, closed);
    await flush();

    expect(document.body.textContent).toContain('当前产品');
    expect(button('绑定').disabled).toBe(true);

    button('恢复自动建的产品').click();
    await flush();
    expect(mocks.bind).toHaveBeenCalledWith(9, undefined);
    expect(saved).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
    unmount();
  });

  it('后端拒绝时留在弹窗显示原因', async () => {
    mocks.bind.mockRejectedValue(new Error('这个产品已经绑定了工序物料 X'));
    const saved = vi.fn();
    const unmount = mount(saved, vi.fn());
    await flush();

    button('恢复自动建的产品').click();
    await flush();
    expect(document.body.textContent).toContain('已经绑定了工序物料');
    expect(saved).not.toHaveBeenCalled();
    unmount();
  });
});
