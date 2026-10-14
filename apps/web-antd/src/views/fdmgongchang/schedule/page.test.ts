import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SchedulePage from './index.vue';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  manual: vi.fn(),
  options: vi.fn(),
  saveTask: vi.fn(),
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
  createManualSchedule: mocks.manual,
  deleteScheduleTask: vi.fn(),
  discardSchedule: vi.fn(),
  getScheduleFormOptions: mocks.options,
  saveScheduleTask: mocks.saveTask,
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
    clickButton('AI生成排单');
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

  it('creates a manual dispatch without AI and edits a dispatched task', async () => {
    const manualDraft: Api.Schedule = { ...base, id: 12, manual: true, plan: { risks: [], tasks: [], warnings: [] }, status: 'DRAFT' };
    const confirmed: Api.Schedule = {
      ...base,
      id: 12,
      manual: true,
      status: 'CONFIRMED',
      tasks: [
        {
          actualQuantity: 0,
          contractCode: 'HT-001',
          id: 31,
          orderCount: 0,
          process: 'SLICE',
          product: '紫色瑜伽垫',
          quantity: 200,
          scheduleId: 12,
          sequence: 1,
          unit: '片',
          workDate: '2026-10-10',
          workerIds: '2',
          workerNames: '张三',
        },
      ],
    };
    mocks.manual.mockResolvedValue(12);
    mocks.options.mockResolvedValue({
      demand: [{ contractCode: 'HT-001', product: '紫色瑜伽垫' }],
      processes: [{ code: 'SLICE', label: '开片', unit: '片' }],
    });
    mocks.saveTask.mockResolvedValue(31);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(SchedulePage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    mocks.list.mockResolvedValue([manualDraft]);
    mocks.get.mockResolvedValue(manualDraft);
    clickButton('手动派工（不用AI）');
    await flush();
    expect(mocks.manual).toHaveBeenCalledWith(expect.objectContaining({ days: 3 }));
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('手动派工：点右上角');
    expect(document.body.textContent).not.toContain('带意见重新生成');

    // 空表单保存：提示要填的项
    clickButton('＋添加任务');
    await flush();
    expect(mocks.options).toHaveBeenCalledWith(12);
    clickButton('保存');
    await flush();
    expect(document.body.textContent).toContain('请选择工序。');
    [...document.querySelectorAll('button')].find((b) => ['Cancel', '取消'].includes(b.textContent?.replaceAll(/\s/g, '') ?? ''))!.click();
    await flush();

    // 已下发：改人 / 改量，表单带出原来的内容，保存时带任务编号
    mocks.list.mockResolvedValue([confirmed]);
    mocks.get.mockResolvedValue(confirmed);
    const item = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('PB20261010-001'));
    item!.click();
    await flush();
    clickButton('改人/改量');
    await flush();
    const saves = [...document.querySelectorAll('button')].filter((b) => b.textContent?.replaceAll(/\s/g, '') === '保存');
    saves.at(-1)!.click();
    await flush();
    expect(mocks.saveTask).toHaveBeenCalledWith({
      id: 31,
      scheduleId: 12,
      task: expect.objectContaining({ contractCode: 'HT-001', date: '2026-10-10', process: 'SLICE', quantity: 200, sequence: 1, workerIds: [2] }),
    });
  });
});
