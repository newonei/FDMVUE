import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WagePage from './index.vue';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  create: vi.fn(),
  items: vi.fn(),
  page: vi.fn(),
  settle: vi.fn(),
  summary: vi.fn(),
  workers: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getMyFactories: vi.fn().mockResolvedValue({
    canSeeAll: false,
    defaultFactoryId: 1,
    factories: [{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }],
  }),
  getWorkerList: mocks.workers,
  setCurrentFactoryId: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/wage', () => ({
  confirmWorkRecords: mocks.confirm,
  createWorkRecords: mocks.create,
  deleteWorkRecords: vi.fn(),
  exportWageDetail: vi.fn(),
  exportWageSummary: vi.fn(),
  getWageSummary: mocks.summary,
  getWorkRecordItems: mocks.items,
  getWorkRecordPage: mocks.page,
  reopenWageMonth: vi.fn(),
  settleWageMonth: mocks.settle,
  unconfirmWorkRecords: vi.fn(),
}));
vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: () => true }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

function clickButton(text: string) {
  const el = [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.replaceAll(/\s/g, '').includes(text),
  );
  if (!el) throw new Error(`找不到按钮：${text}`);
  el.click();
}

async function selectOption(id: string, label: string) {
  const selector = document.querySelector(`#${id}`)!.closest('.ant-select')!.querySelector('.ant-select-selector')!;
  selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await flush();
  const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')]
    .find((element) => element.getAttribute('title')?.includes(label));
  if (!option) throw new Error(`找不到选项：${label}`);
  option.click();
  await flush();
}

describe('wage page', () => {
  let unmount: (() => void) | undefined;
  beforeEach(() => {
    mocks.page.mockResolvedValue({
      list: [
        {
          amount: 112.5,
          category: 'TIME',
          hours: 7.5,
          id: 1,
          itemId: 200,
          itemName: '雕刻',
          shift: 'NIGHT',
          source: 'MANUAL',
          status: 'PENDING',
          team: '雕刻组',
          unit: '小时',
          unitPrice: 15,
          userId: 2,
          userName: '张三',
          workDate: [2026, 10, 10],
        },
      ],
      total: 1,
    });
    mocks.summary.mockResolvedValue({
      month: '2026-10',
      pendingCount: 0,
      people: [
        {
          allowanceAmount: 15,
          hours: 7.5,
          miscAmount: 0,
          pendingCount: 0,
          processAmount: 10.78,
          recordCount: 3,
          team: '雕刻组',
          timeAmount: 112.5,
          totalAmount: 138.28,
          userId: 2,
          userName: '张三',
        },
      ],
      recordCount: 3,
      settled: false,
      totalAmount: 138.28,
    });
    mocks.items.mockResolvedValue([
      { category: 'TIME', currentPrice: 15, id: 200, name: '雕刻', status: 0, unit: '小时' },
      { category: 'ALLOWANCE', currentPrice: 15, id: 400, name: '夜班补助', status: 0, unit: '班' },
    ]);
    mocks.workers.mockResolvedValue([
      { assigned: true, nickname: '张三', posts: ['ENGRAVE'], status: 0, team: '雕刻组', userId: 2 },
    ]);
    mocks.confirm.mockResolvedValue(1);
    mocks.create.mockResolvedValue(1);
  });
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('lists work records, confirms them and shows the monthly summary', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(WagePage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    const text = document.body.textContent ?? '';
    expect(text).toContain('黄石工厂');
    expect(text).toContain('张三 · 雕刻组');
    expect(text).toContain('7.5 小时');
    expect(text).toContain('112.5');
    expect(text).toContain('待确认');

    document.querySelector<HTMLInputElement>('tbody input[type="checkbox"]')!.click();
    await flush();
    clickButton('确认');
    await flush();
    expect(mocks.confirm).toHaveBeenCalledWith([1]);

    [...document.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((t) => t.textContent?.includes('月度汇总'))!
      .click();
    await flush();
    expect(mocks.summary).toHaveBeenCalled();
    expect(document.body.textContent).toContain('138.28');
  });

  it('shows batch volume and the personal share without allowing an order share to be deleted alone', async () => {
    mocks.page.mockResolvedValue({ list: [{
      id: 10, itemId: 20, itemName: '开片', process: 'SLICE', category: 'PROCESS',
      source: 'ORDER', orderNo: 'GX-SLICE', status: 'PENDING', shift: 'DAY',
      userId: 2, userName: '张三', workDate: '2026-11-10',
      quantity: '0.507870000', unit: 'm³', unitPrice: 27, amount: 4.57, sharingCount: 3,
    }], total: 1 });
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(WagePage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    expect(document.body.textContent).toContain('整批 0.50787 m³');
    expect(document.body.textContent).toContain('3 人平分，金额为个人份额');
    expect(document.body.textContent).toContain('4.57');
    document.querySelector<HTMLInputElement>('tbody input[type="checkbox"]')!.click();
    await flush();
    expect([...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === '删除')).toBe(false);
    expect(document.body.textContent).toContain('工序单需作废后重报');
    clickButton('确认');
    await flush();
    expect(mocks.confirm).toHaveBeenCalledWith([10]);
  });

  it('registers manual slice work with one batch volume shared by the selected workers', async () => {
    mocks.items.mockResolvedValue([
      { category: 'PROCESS', process: 'SLICE', currentPrice: 27, id: 20, name: '开片', status: 0, unit: 'm³' },
    ]);
    mocks.workers.mockResolvedValue([
      { nickname: '张三', userId: 2, status: 0 },
      { nickname: '李四', userId: 3, status: 0 },
    ]);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(WagePage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();
    clickButton('登记报工');
    await flush();
    await selectOption('record-item', '开片');
    await selectOption('record-people', '张三');
    await selectOption('record-people', '李四');
    const volume = document.querySelector<HTMLInputElement>('#record-slice-volume')!;
    expect(volume).not.toBeNull();
    expect(document.querySelector('[id^="record-value-"]')).toBeNull();
    volume.value = '0.50787';
    volume.dispatchEvent(new Event('input', { bubbles: true }));
    volume.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(document.body.textContent).toContain('13.71 元，由 2 人平分');
    expect(document.body.textContent).toContain('6.86 元');
    expect(document.body.textContent).toContain('6.85 元');
    document.querySelector<HTMLButtonElement>('.ant-modal-footer .ant-btn-primary')!.click();
    await flush();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 20,
      lines: [{ userId: 2, quantity: '0.50787' }, { userId: 3, quantity: '0.50787' }],
    }));
  });
});
