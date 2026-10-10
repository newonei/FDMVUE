import type { FdmgongchangDashboardApi as Api } from '#/api/fdmgongchang/dashboard';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import DashboardPage from './index.vue';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  myFactories: vi.fn().mockResolvedValue({
    canSeeAll: false,
    defaultFactoryId: 1,
    factories: [{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }],
  }),
  push: vi.fn(),
  render: vi.fn(),
  setFactory: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/dashboard', () => ({ getFactoryDashboard: mocks.get }));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getMyFactories: mocks.myFactories,
  setCurrentFactoryId: mocks.setFactory,
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({ setup: (_, ctx) => () => h('main', ctx.slots.default?.()) }),
}));
vi.mock('@vben/plugins/echarts', () => ({
  EchartsUI: defineComponent({ setup: () => () => h('div', { class: 'chart' }) }),
  useEcharts: () => ({ renderEcharts: mocks.render }),
}));

const today = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const past = new Date(today);
past.setDate(past.getDate() - 2);

const dashboard: Api.Dashboard = {
  from: iso(new Date(today.getTime() - 6 * 86_400_000)),
  generatedAt: Date.now(),
  kpi: {
    defect: 4,
    defectPrev: 10,
    good: 236,
    goodPrev: 190,
    openOrders: 2,
    overdueOrders: 1,
    packedGood: 120,
    packedGoodPrev: 100,
    packedUnit: '件',
    pendingOrders: 1,
    pendingRecords: 3,
    planRate: 0.5,
    planRatePrev: null,
    planTaskCount: 1,
    staleCount: 1,
    wageAmount: 140.5,
    wageAmountPrev: 20,
    wipCount: 1,
  },
  orders: [
    { completed: 30, dueDate: iso(past), orderNo: 'GD20261010-001', party: '运营一组', product: 'TPE瑜伽垫', quantity: 100, status: 'ACCEPTED', statusLabel: '生产中', type: 'FACTORY', unit: '条' },
  ],
  people: { active: 2, reported: 2, top: [{ amount: 80, name: '张三', records: 1, userId: 2 }], unassigned: 1 },
  prevFrom: '2026-09-27',
  prevTo: '2026-10-03',
  processes: [{ defect: 4, good: 236, goodPrev: 190, label: '开片', process: 'SLICE', stock: 236, unit: '片', wip: 1 }],
  stocks: [{ label: '板材', quantity: 240, stage: 'BOARD', unit: '张' }],
  to: iso(today),
  today: {
    defectTotal: 0,
    goodTotal: 0,
    lanes: [],
    pendingRecords: 3,
    shortages: [{ available: 0, label: '贴合', planned: 500, process: 'LAMINATE', sourceLabel: '已立切片材', unit: '片' }],
    staleOrders: [],
    startedTaskCount: 0,
    taskCount: 1,
    today: iso(today),
    unassignedWorkers: 1,
    wipCount: 1,
  },
  trend: [{ date: iso(today), defect: 4, good: 236, process: 'SLICE' }],
};

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

describe('factory dashboard', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('shows KPIs with comparisons, delivery, people and what needs attention', async () => {
    mocks.get.mockResolvedValue(dashboard);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(DashboardPage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    expect(mocks.setFactory).toHaveBeenCalledWith(1);
    expect(mocks.get).toHaveBeenCalledWith('7d');
    const text = document.body.textContent ?? '';
    expect(text).toContain('成品产出');
    expect(text).toContain('↑ 20.0%');
    expect(text).toContain('98.3%');
    expect(text).toContain('50.0%');
    expect(text).toContain('逾期 2 天');
    expect(text).toContain('1 张订单已逾期');
    expect(text).toContain('贴合明天可能缺料');
    expect(text).toContain('张三');
    expect(text).toContain('¥141');
    expect(mocks.render).toHaveBeenCalled();

    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('去人员岗位'))!.click();
    expect(mocks.push).toHaveBeenCalledWith('/gongchang/worker');
  });
});
