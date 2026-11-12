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

function orderCards() {
  return [...document.querySelectorAll<HTMLElement>('[data-order-key]')];
}

const progress = (
  over: Partial<NonNullable<Api.Task['orderProgress']>> = {},
): NonNullable<Api.Task['orderProgress']> => ({
  completed: false,
  processes: [{ actualQuantity: 30, completed: false, process: 'SLICE', quantity: 160, unit: '片' }],
  taskCount: 4,
  ...over,
});

describe('schedule task management', () => {
  let unmount: (() => void) | undefined;

  async function mount() {
    const host = document.createElement('div');
    document.body.append(host);
    const opened: number[] = [];
    const app = createApp(TaskManage, { factoryId: 1, onOpenSchedule: (id: number) => opened.push(id) });
    app.mount(host);
    unmount = () => app.unmount();
    await flush();
    return { opened };
  }

  beforeEach(() => {
    const orderProgress = progress();
    mocks.list.mockResolvedValue([
      task({ id: 1, orderProgress }),
      task({ id: 2, orderProgress, status: 'CLAIMED', workerIds: '2', workerNames: '张三' }),
      task({ id: 3, orderCount: 1, orderProgress, status: 'CLAIMED', workerIds: '3', workerNames: '李四' }),
      task({ actualQuantity: 30, id: 4, orderProgress, status: 'DONE', workerIds: '2', workerNames: '张三', shortage: 10 }),
    ]);
    mocks.returnToHall.mockResolvedValue(1);
  });
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('lists tasks across schedules and only lets unfinished ones be returned to the hall', async () => {
    const { opened } = await mount();

    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));
    expect(orderCards()).toHaveLength(1);
    const text = document.body.textContent ?? '';
    expect(text).toContain('待领取');
    expect(text).toContain('已报工');
    expect(text).toContain('任务大厅等人抢');
    expect(text).toContain('差 10 待处理');
    const rowBoxes = document.querySelectorAll('tbody input[type="checkbox"]');
    expect(rowBoxes).toHaveLength(3);

    for (const box of rowBoxes) (box as HTMLInputElement).click();
    await flush();
    const groupBox = orderCards()[0]!.querySelector<HTMLInputElement>('header input[type="checkbox"]')!;
    expect(groupBox.checked).toBe(true);
    groupBox.click();
    await flush();
    expect([...rowBoxes].some((box) => (box as HTMLInputElement).checked)).toBe(false);
    groupBox.click();
    await flush();
    expect(document.body.textContent).toContain('已选 3 个任务');
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

  it('merges the same order across dates and schedules without adding the repeated order summary twice', async () => {
    const orderProgress = progress({
      completed: true,
      processes: [{ actualQuantity: '125', completed: true, process: 'SLICE', quantity: '100', unit: '片' }],
      taskCount: 2,
    });
    mocks.list.mockResolvedValue([
      task({ actualQuantity: 50, id: 1, orderProgress, quantity: 40, status: 'DONE' }),
      task({ actualQuantity: 75, id: 2, orderProgress, quantity: 60, scheduleId: 10, scheduleNo: 'PB20261021-002', status: 'DONE', workDate: [2026, 10, 21] }),
      task({ contractCode: 'HT-002', id: 3, orderProgress: progress({ taskCount: 1 }) }),
    ]);
    const { opened } = await mount();

    expect(orderCards()).toHaveLength(2);
    const merged = orderCards().find((card) => card.textContent?.includes('HT-001'))!;
    expect(merged.textContent).toContain('订单已完成');
    expect(merged.querySelectorAll('details tbody tr')).toHaveLength(2);
    const summaries = merged.querySelectorAll('[data-process-key]');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.textContent).toMatch(/125\s*\/\s*100\s*片/);
    expect(summaries[0]!.textContent).not.toContain('250');
    expect(merged.textContent).toContain('10-20');
    expect(merged.textContent).toContain('10-21');

    buttons('PB20261020-001')[0]!.click();
    buttons('PB20261021-002')[0]!.click();
    expect(opened).toEqual([9, 10]);
  });

  it.each([
    { completed: false, packed: 50, statusText: '订单进行中' },
    { completed: true, packed: 100, statusText: '订单已完成' },
  ])('shows $statusText only when every process reaches its own target', async ({ completed, packed, statusText }) => {
    const orderProgress = progress({
      completed,
      processes: [
        { actualQuantity: 120, completed: true, process: 'MIX', quantity: 100, unit: '张' },
        { actualQuantity: packed, completed, process: 'PACK', quantity: 100, unit: '条' },
      ],
      taskCount: 2,
    });
    mocks.list.mockResolvedValue([
      task({ actualQuantity: 120, id: 1, orderProgress, process: 'MIX', quantity: 100, status: 'DONE', unit: '张' }),
      task({ actualQuantity: packed, id: 2, orderProgress, process: 'PACK', quantity: 100, status: 'DONE', unit: '条' }),
    ]);
    await mount();

    const card = orderCards()[0]!;
    expect(card.textContent).toContain(statusText);
    expect(card.textContent).not.toContain(completed ? '订单进行中' : '订单已完成');
    const summaries = [...card.querySelectorAll('[data-process-key]')];
    expect(summaries).toHaveLength(2);
    expect(summaries.find((summary) => summary.textContent?.includes('发泡'))!.textContent).toMatch(/120\s*\/\s*100\s*张/);
    expect(summaries.find((summary) => summary.textContent?.includes('包装'))!.textContent).toMatch(new RegExp(`${packed}\\s*\\/\\s*100\\s*条`));
  });

  it('keeps the order in progress when filtered tasks are complete but another process in the full order is unfinished', async () => {
    mocks.list.mockResolvedValue([
      task({
        actualQuantity: 40,
        id: 7,
        orderProgress: progress({
          processes: [
            { actualQuantity: 40, completed: true, process: 'SLICE', quantity: 40, unit: '片' },
            { actualQuantity: 15, completed: false, process: 'PACK', quantity: 40, unit: '条' },
          ],
          taskCount: 3,
        }),
        status: 'DONE',
      }),
    ]);
    await mount();

    const card = orderCards()[0]!;
    expect(card.querySelectorAll('details tbody tr')).toHaveLength(1);
    expect(card.textContent).toContain('订单进行中');
    expect(card.textContent).not.toContain('订单已完成');
    expect(card.querySelectorAll('[data-process-key]')).toHaveLength(2);
    expect(card.textContent).toContain('包装');
    expect(card.textContent).toMatch(/15\s*\/\s*40\s*条/);
    expect(card.querySelectorAll('tbody input[type="checkbox"]')).toHaveLength(0);
  });

  it('keeps unlinked stock tasks separate instead of merging all of them as one order', async () => {
    mocks.list.mockResolvedValue([
      task({ contractCode: null, id: 1 }),
      task({ contractCode: '', id: 2 }),
      task({ contractCode: 'HT-001', id: 3, orderProgress: progress({ taskCount: 1 }) }),
    ]);
    await mount();

    expect(orderCards()).toHaveLength(3);
    expect(new Set(orderCards().map((card) => card.dataset.orderKey)).size).toBe(3);
    for (const card of orderCards()) expect(card.querySelectorAll('details tbody tr')).toHaveLength(1);
  });

  it('does not infer whole-order completion from a completed task when the full order summary is unavailable', async () => {
    mocks.list.mockResolvedValue([
      task({ actualQuantity: 80, id: 1, quantity: 40, status: 'DONE' }),
    ]);
    await mount();

    expect(orderCards()).toHaveLength(1);
    expect(orderCards()[0]!.textContent).not.toContain('订单已完成');
    expect(orderCards()[0]!.querySelectorAll('details tbody tr')).toHaveLength(1);
  });
});
