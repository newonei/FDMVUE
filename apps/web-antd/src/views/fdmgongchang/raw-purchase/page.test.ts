import type { FdmgongchangRawPurchaseApi as Api } from '#/api/fdmgongchang/raw-purchase';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import RawPurchasePage from './index.vue';

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  close: vi.fn(),
  create: vi.fn(),
  materials: vi.fn(),
  page: vi.fn(),
  update: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getFactoryList: vi.fn().mockResolvedValue([
    { code: 'HBFDM', deptId: 118, id: 1, name: '湖北飞德慕' },
  ]),
}));
vi.mock('#/api/fdmgongchang/raw-purchase', () => ({
  cancelRawPurchase: mocks.cancel,
  closeRawPurchase: mocks.close,
  createRawPurchase: mocks.create,
  getRawPurchaseMaterials: mocks.materials,
  getRawPurchasePage: mocks.page,
  updateRawPurchase: mocks.update,
}));
vi.mock('#/views/fdmplatform/components/RemoteMasterSelect.vue', () => ({
  default: (props: { value?: string }) =>
    h('span', { 'data-supplier': props.value ?? '' }),
}));
vi.mock('@vben/access', () => ({ useAccess: () => ({ hasAccessByCodes: () => true }) }));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({ setup: (_, ctx) => () => h('main', ctx.slots.default?.()) }),
}));

const line = (id: number, code: string, name: string, qty: number, received: number): Api.Line => ({
  amount: qty * 10,
  id,
  quantity: qty,
  rawMaterialCode: code,
  rawMaterialName: name,
  receivedQuantity: received,
  remainingQuantity: qty - received,
  unitPrice: 10,
});
const ordered: Api.Purchase = {
  currency: 'CNY',
  expectedDate: [2026, 10, 20],
  factoryId: 1,
  factoryName: '湖北飞德慕',
  id: 1,
  lines: [line(11, 'MAT-TPE', 'TPE粒子', 1000, 0), line(12, 'MAT-AC', '发泡剂AC', 20, 0)],
  operatorName: 'Owen',
  orderDate: [2026, 10, 8],
  purchaseNo: 'CG20261008-001',
  status: 'ORDERED',
  supplierId: 's1',
  supplierName: '东莞原料厂',
  totalAmount: 10_200,
};
const partial: Api.Purchase = {
  ...ordered,
  id: 2,
  lines: [line(21, 'MAT-TPE', 'TPE粒子', 1000, 600)],
  purchaseNo: 'CG20261008-002',
  status: 'PARTIAL',
  totalAmount: 10_000,
};

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

function rowOf(no: string) {
  return [...document.querySelectorAll('tr')].find((tr) => tr.textContent?.includes(no))!;
}

function clickButton(text: string, root: ParentNode = document) {
  const el = [...root.querySelectorAll('button')].find((b) => b.textContent?.replaceAll(/\s/g, '') === text);
  if (!el) throw new Error(`找不到按钮：${text}`);
  el.click();
}

describe('raw purchase page', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  async function mount() {
    const errors: unknown[] = [];
    mocks.page.mockResolvedValue({ list: [ordered, partial], total: 2 });
    mocks.materials.mockResolvedValue([
      { category: 'MAIN', code: 'MAT-TPE', enabled: true, name: 'TPE粒子' },
      { category: 'ADDITIVE', code: 'MAT-AC', enabled: true, name: '发泡剂AC' },
    ]);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(RawPurchasePage);
    app.config.errorHandler = (err) => errors.push(err);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();
    return errors;
  }

  it('lists purchases with received progress and offers edit/cancel before arrival, close after a partial arrival', async () => {
    const errors = await mount();
    const text = document.body.textContent ?? '';
    expect(text).toContain('原材料采购');
    expect(text).toContain('东莞原料厂');
    expect(text).toContain('10,200.00');
    expect(text).toContain('2026-10-20');
    expect(text).toContain('到货 60%');
    expect(rowOf('CG20261008-001').textContent).toContain('修改');
    expect(rowOf('CG20261008-001').textContent).toContain('取消');
    expect(rowOf('CG20261008-001').textContent).not.toContain('关闭');
    expect(rowOf('CG20261008-002').textContent).toContain('关闭');
    expect(rowOf('CG20261008-002').textContent).not.toContain('修改');
    expect(errors).toEqual([]);
  });

  it('saves an edited purchase with its lines and cancels with a reason', async () => {
    const errors = await mount();
    mocks.update.mockResolvedValue(true);
    mocks.cancel.mockResolvedValue(true);
    clickButton('修改', rowOf('CG20261008-001'));
    await flush();
    expect(document.body.textContent).toContain('修改采购单 CG20261008-001');
    expect(document.body.textContent).toContain('合计 10,200.00 元 · 2 种原材料');
    clickButton('保存修改');
    await flush();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDate: '2026-10-20',
        id: 1,
        lines: [
          { quantity: 1000, rawMaterialCode: 'MAT-TPE', remark: undefined, unitPrice: 10 },
          { quantity: 20, rawMaterialCode: 'MAT-AC', remark: undefined, unitPrice: 10 },
        ],
        orderDate: '2026-10-08',
        supplierId: 's1',
      }),
    );

    clickButton('取消', rowOf('CG20261008-001'));
    await flush();
    const input = document.querySelector<HTMLInputElement>('#rp-close-reason')!;
    input.value = '供应商缺货';
    input.dispatchEvent(new Event('input'));
    await flush();
    clickButton('确认取消');
    await flush();
    expect(mocks.cancel).toHaveBeenCalledWith({ id: 1, reason: '供应商缺货' });
    expect(errors).toEqual([]);
  });
});
