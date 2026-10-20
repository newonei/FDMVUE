import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TaskManage from './modules/task-manage.vue';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  reassign: vi.fn(),
  returnToHall: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getWorkerList: vi.fn().mockResolvedValue([
    { assigned: true, nickname: '张三', posts: ['SLICE'], status: 0, team: '开片一组', userId: 2 },
    { assigned: true, nickname: '李四', posts: ['SLICE', 'PACK'], status: 0, userId: 3 },
  ]),
}));
vi.mock('#/api/fdmgongchang/schedule', () => ({
  listScheduleTasks: mocks.list,
  reassignScheduleTasks: mocks.reassign,
  returnScheduleTasksToHall: mocks.returnToHall,
}));
vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: () => true }),
}));

const task = (over: Partial<Api.Task>): Api.Task => ({
  actualQuantity: 0,
  contractCode: 'HT-001',
  id: 1,
  orderCount: 0,
  process: 'SLICE',
  product: '紫色瑜伽垫',
  quantity: 40,
  scheduleId: 9,
  scheduleNo: 'PB20261020-001',
  sequence: 1,
  status: 'OPEN',
  unit: '片',
  workDate: '2026-10-20',
  ...over,
});

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

function buttons(text: string) {
  return [...document.querySelectorAll('button')].filter((b) => b.textContent?.replaceAll(/\s/g, '') === text);
}

describe('schedule task management', () => {
  let unmount: (() => void) | undefined;
  beforeEach(() => {
    mocks.list.mockResolvedValue([
      task({ id: 1 }),
      task({ id: 2, status: 'CLAIMED', workerIds: '2', workerNames: '张三' }),
      task({ id: 3, orderCount: 1, status: 'CLAIMED', workerIds: '3', workerNames: '李四' }),
      task({ actualQuantity: 30, id: 4, status: 'DONE', workerIds: '2', workerNames: '张三', shortage: 10 }),
    ]);
    mocks.returnToHall.mockResolvedValue(1);
  });
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('lists tasks across schedules and only lets unfinished ones be returned to the hall', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const opened: number[] = [];
    const app = createApp(TaskManage, { factoryId: 1, onOpenSchedule: (id: number) => opened.push(id) });
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));
    const text = document.body.textContent ?? '';
    expect(text).toContain('待领取');
    expect(text).toContain('已报工');
    expect(text).toContain('任务大厅等人抢');
    expect(text).toContain('差 10 待处理');
    const rowBoxes = document.querySelectorAll('tbody input[type="checkbox"]');
    expect(rowBoxes).toHaveLength(3);

    for (const box of rowBoxes) (box as HTMLInputElement).click();
    await flush();
    buttons('退回任务大厅')[0]!.click();
    await flush();
    expect(document.body.textContent).toContain('把 1 个任务退回任务大厅？');
    const ok = buttons('退回任务大厅');
    ok[ok.length - 1]!.click();
    await flush();
    expect(mocks.returnToHall).toHaveBeenCalledWith([2]);

    buttons('PB20261020-001')[0]!.click();
    expect(opened).toEqual([9]);
  });
});
