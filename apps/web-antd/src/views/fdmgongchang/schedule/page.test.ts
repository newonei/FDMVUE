import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SchedulePage from './index.vue';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  generate: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getMyFactories: vi.fn().mockResolvedValue({
    canSeeAll: false,
    defaultFactoryId: 1,
    factories: [{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }],
  }),
  getWorkerList: vi.fn().mockResolvedValue([
    { assigned: true, nickname: '张三', posts: ['SLICE'], status: 0, team: '开片一组', userId: 2 },
    { assigned: true, nickname: '李四', posts: ['PACK'], status: 0, userId: 3 },
  ]),
  setCurrentFactoryId: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/schedule', () => ({
  confirmSchedule: mocks.confirm,
  discardSchedule: vi.fn(),
  generateSchedule: mocks.generate,
  getSchedule: mocks.get,
  getSchedules: mocks.list,
  regenerateSchedule: vi.fn(),
}));
vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: () => true }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));

const base: Api.Schedule = {
  days: 3,
  id: 9,
  revision: 1,
  scheduleNo: 'PB20261010-001',
  startDate: '2026-10-10',
  status: 'GENERATING',
};
const draft: Api.Schedule = {
  ...base,
  plan: {
    risks: [{ detail: '后天需要密炼补料', level: 'MEDIUM', title: '板材只够两天' }],
    summary: '先开片保交期',
    tasks: [
      {
        contractCode: 'HT-001',
        date: '2026-10-10',
        process: 'SLICE',
        product: '紫色瑜伽垫',
        quantity: 400,
        reason: '交期近',
        sequence: 1,
        spec: '183x61x0.6',
        unit: '片',
        workerIds: [2],
        workerNames: ['张三'],
      },
      {
        contractCode: null,
        date: '2026-10-11',
        process: 'PACK',
        product: '紫色瑜伽垫',
        quantity: 100,
        reason: '备货',
        sequence: 1,
        unit: '件',
        workerIds: [],
      },
    ],
    warnings: ['第 3 个任务的日期 2026-10-20 不在排单范围内，已去掉'],
  },
  status: 'DRAFT',
};

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

function clickButton(text: string) {
  const el = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.replaceAll(/\s/g, '') === text,
  );
  if (!el) throw new Error(`找不到按钮：${text}`);
  el.click();
}

describe('schedule page', () => {
  let unmount: (() => void) | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mocks.list.mockResolvedValue([]);
    mocks.generate.mockResolvedValue(9);
    mocks.confirm.mockResolvedValue(true);
  });
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('generates a plan, waits for the AI, then confirms the adjusted tasks', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(SchedulePage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();
    expect(document.body.textContent).toContain('还没有排单');

    mocks.list.mockResolvedValue([base]);
    mocks.get.mockResolvedValueOnce(base).mockResolvedValue(draft);
    clickButton('生成排单');
    await flush();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ days: 3 }));
    expect(document.body.textContent).toContain('AI 正在根据订单');

    await vi.advanceTimersByTimeAsync(3100);
    await flush();
    const text = document.body.textContent ?? '';
    expect(text).toContain('先开片保交期');
    expect(text).toContain('板材只够两天');
    expect(text).toContain('系统校验时调整了 1 处');
    expect(text).toContain('HT-001');
    expect(text).toContain('1 个任务还没排人');

    clickButton('确认下发');
    await flush();
    expect(mocks.confirm).toHaveBeenCalledWith({
      id: 9,
      tasks: [
        expect.objectContaining({ process: 'SLICE', quantity: 400, workerIds: [2] }),
        expect.objectContaining({ process: 'PACK', workerIds: [] }),
      ],
    });
  });
});
