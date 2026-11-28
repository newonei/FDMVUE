import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import PlanTable from './plan-table.vue';

vi.mock('ant-design-vue', async (importOriginal) => ({
  ...await importOriginal<typeof import('ant-design-vue')>(),
  DatePicker: defineComponent({
    props: ['value'],
    emits: ['update:value'],
    setup: (props, { emit }) => () => h('input', {
      type: 'date',
      value: props.value ?? '',
      onInput: (event: Event) => emit('update:value', (event.target as HTMLInputElement).value || null),
    }),
  }),
}));

const baseTask: Api.Task = {
  actualQuantity: 0,
  id: 1,
  orderCount: 0,
  process: 'MIX',
  quantity: 10,
  scheduleId: 2,
  status: 'OPEN',
  unit: '张',
  workDate: '2026-11-26',
};

let unmount: (() => void) | undefined;

async function mount(canEditWorkDate: boolean, initialTasks: Api.Task[] = [
  baseTask,
  { ...baseTask, id: 2, actualQuantity: 10, status: 'DONE' },
  { ...baseTask, id: 3, undated: true },
]) {
  const tasks = ref(initialTasks);
  const onUpdateDeadlineDate = vi.fn<(ids: number[], date: null | string, done: (success: boolean) => void) => void>();
  const onUpdateWorkDate = vi.fn<(ids: number[], date: string, done: (success: boolean) => void) => void>();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(PlanTable, { canEditWorkDate, onUpdateDeadlineDate, onUpdateWorkDate, process: 'MIX', tasks: tasks.value }),
  });
  app.mount(host);
  unmount = () => app.unmount();
  await nextTick();
  return { onUpdateDeadlineDate, onUpdateWorkDate, tasks };
}

function buttonWithText(text: string, scope: ParentNode = document) {
  return [...scope.querySelectorAll('button')].find((button) => button.textContent?.replaceAll(/\s/g, '') === text);
}

function taskRow(id: number) {
  return document.querySelector<HTMLTableRowElement>(`[data-task-id="${id}"]`)!;
}

async function enterDeadlineDate(value: string) {
  const picker = document.querySelector<HTMLInputElement>('input[type="date"]')!;
  picker.value = value;
  picker.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

afterEach(() => {
  unmount?.();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('workshop production date editor', () => {
  it('keeps shared dates grouped for read-only users', async () => {
    await mount(false);

    expect(document.querySelector('[data-task-id="1"] .plan-date-cell')?.getAttribute('rowspan')).toBe('2');
    expect(document.querySelector('button[aria-label$="的生产日期"]')).toBeNull();
    expect(document.querySelector('.workshop-plan-table input[type="checkbox"]')).toBeNull();
    expect(buttonWithText('批量设置生产日期')).toBeUndefined();
    expect(buttonWithText('批量设置截止日期')).toBeUndefined();
    expect(buttonWithText('设置截止日期', taskRow(1))).toBeUndefined();
  });

  it('edits an individual completed task within a shared date and retains the draft on failure', async () => {
    const { onUpdateWorkDate, tasks } = await mount(true);
    expect(document.querySelector('button[aria-label="设置任务 3 的生产日期"]')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('button[aria-label="调整任务 2 的生产日期"]')!.click();
    await nextTick();

    const picker = document.querySelector<HTMLInputElement>('#workshop-task-work-date')!;
    expect(picker.value).toBe('2026-11-26');
    picker.value = '2026-11-25';
    picker.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    const save = buttonWithText('保存');
    expect(save).toBeTruthy();
    save!.click();
    expect(onUpdateWorkDate).toHaveBeenCalledWith([2], '2026-11-25', expect.any(Function));
    onUpdateWorkDate.mock.lastCall![2](false);
    await nextTick();
    expect(document.querySelector<HTMLInputElement>('#workshop-task-work-date')?.value).toBe('2026-11-25');

    save!.click();
    tasks.value = tasks.value.map((task) => task.id === 2 ? { ...task, workDate: '2026-11-25' } : task);
    onUpdateWorkDate.mock.lastCall![2](true);
    await nextTick();
    expect(document.querySelector('#workshop-task-work-date')).toBeNull();
    expect(document.querySelector('[data-task-id="2"] .plan-date-cell')?.textContent).toContain('2026-11-25');
    expect(document.querySelector('[data-task-id="1"] .plan-date-cell')?.textContent).toContain('2026-11-26');
  });

  it('submits one date for the selected tasks and keeps their selection on failure', async () => {
    const { onUpdateWorkDate, tasks } = await mount(true);
    expect(buttonWithText('批量设置生产日期')?.disabled).toBe(true);

    document.querySelector<HTMLInputElement>('[data-task-id="2"] input[type="checkbox"]')!.click();
    await nextTick();
    document.querySelector<HTMLInputElement>('[data-task-id="3"] input[type="checkbox"]')!.click();
    await nextTick();
    expect(document.body.textContent).toMatch(/已选\s*2\s*项/);
    buttonWithText('批量设置生产日期')!.click();
    await nextTick();

    const picker = document.querySelector<HTMLInputElement>('#workshop-task-work-date')!;
    expect(buttonWithText('保存')?.disabled).toBe(true);
    picker.value = '2026-11-25';
    picker.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    buttonWithText('保存')!.click();
    expect(onUpdateWorkDate).toHaveBeenCalledExactlyOnceWith([2, 3], '2026-11-25', expect.any(Function));
    onUpdateWorkDate.mock.lastCall![2](false);
    await nextTick();
    expect(picker.value).toBe('2026-11-25');
    expect(document.body.textContent).toMatch(/已选\s*2\s*项/);

    buttonWithText('保存')!.click();
    tasks.value = tasks.value.map((task) => task.id === 1 ? task : { ...task, undated: false, workDate: '2026-11-25' });
    onUpdateWorkDate.mock.lastCall![2](true);
    await nextTick();
    expect(document.querySelector('#workshop-task-work-date')).toBeNull();
    expect(buttonWithText('批量设置生产日期')?.disabled).toBe(true);
    expect(document.querySelectorAll('.workshop-plan-table tbody input[type="checkbox"]:checked')).toHaveLength(0);
    expect(document.querySelector('[data-task-id="3"] .plan-date-cell')?.textContent).toContain('2026-11-25');
    expect(document.querySelector('[data-task-id="1"] .plan-date-cell')?.textContent).toContain('2026-11-26');
  });

  it('selects the current page, keeps that selection through pagination and clears it on search', async () => {
    await mount(true, Array.from({ length: 21 }, (_, index) => ({ ...baseTask, id: index + 1 })));

    document.querySelector<HTMLInputElement>('.workshop-plan-table thead input[type="checkbox"]')!.click();
    await nextTick();
    expect(document.body.textContent).toMatch(/已选\s*20\s*项/);

    document.querySelector<HTMLElement>('.ant-pagination-item[title="2"]')!.click();
    await nextTick();
    const secondPageCheckbox = document.querySelector<HTMLInputElement>('[data-task-id="21"] input[type="checkbox"]')!;
    expect(secondPageCheckbox.checked).toBe(false);
    expect(document.body.textContent).toMatch(/已选\s*20\s*项/);
    secondPageCheckbox.click();
    await nextTick();
    expect(document.body.textContent).toMatch(/已选\s*21\s*项/);

    const search = document.querySelector<HTMLInputElement>('input[aria-label="搜索日计划"]')!;
    search.value = '#21';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(document.querySelectorAll('.workshop-plan-table tbody [data-task-id]')).toHaveLength(1);
    expect(document.querySelector<HTMLInputElement>('[data-task-id="21"] input[type="checkbox"]')?.checked).toBe(false);
    expect(buttonWithText('批量设置生产日期')?.disabled).toBe(true);
  });
});

describe('workshop production deadline', () => {
  it('sets and clears a task deadline independently from its production date', async () => {
    const { onUpdateDeadlineDate, onUpdateWorkDate, tasks } = await mount(true, [baseTask]);
    buttonWithText('设置截止日期', taskRow(1))!.click();
    await nextTick();
    await enterDeadlineDate('2026-11-28');
    buttonWithText('保存')!.click();
    expect(onUpdateDeadlineDate).toHaveBeenCalledExactlyOnceWith([1], '2026-11-28', expect.any(Function));
    tasks.value = [{ ...baseTask, deadlineDate: '2026-11-28' }];
    onUpdateDeadlineDate.mock.lastCall![2](true);
    await nextTick();

    expect(taskRow(1).textContent).toContain('2026-11-28');
    expect(taskRow(1).querySelector('.plan-date-cell')?.textContent).toContain('2026-11-26');
    buttonWithText('调整截止日期', taskRow(1))!.click();
    await nextTick();
    expect(document.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe('2026-11-28');
    await enterDeadlineDate('');
    buttonWithText('保存')!.click();
    expect(onUpdateDeadlineDate).toHaveBeenLastCalledWith([1], null, expect.any(Function));
    tasks.value = [{ ...baseTask, deadlineDate: null }];
    onUpdateDeadlineDate.mock.lastCall![2](true);
    await nextTick();

    expect(buttonWithText('设置截止日期', taskRow(1))).toBeTruthy();
    expect(taskRow(1).querySelector('.plan-date-cell')?.textContent).toContain('2026-11-26');
    expect(onUpdateWorkDate).not.toHaveBeenCalled();
  });

  it('sets a common deadline for the checked tasks and keeps selection and draft on failure', async () => {
    const { onUpdateDeadlineDate, onUpdateWorkDate, tasks } = await mount(true, [
      { ...baseTask, deadlineDate: '2026-11-26' },
      { ...baseTask, id: 2 },
      { ...baseTask, id: 3, undated: true },
    ]);
    expect(buttonWithText('批量设置截止日期')?.disabled).toBe(true);
    taskRow(1).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await nextTick();
    taskRow(3).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await nextTick();

    buttonWithText('批量设置截止日期')!.click();
    await nextTick();
    expect(buttonWithText('保存')?.disabled).toBe(true);
    await enterDeadlineDate('2026-11-28');
    buttonWithText('保存')!.click();
    expect(onUpdateDeadlineDate).toHaveBeenCalledExactlyOnceWith([1, 3], '2026-11-28', expect.any(Function));
    onUpdateDeadlineDate.mock.lastCall![2](false);
    await nextTick();
    expect(document.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe('2026-11-28');
    expect(document.body.textContent).toMatch(/已选\s*2\s*项/);

    buttonWithText('保存')!.click();
    tasks.value = tasks.value.map((task) => task.id === 2 ? task : { ...task, deadlineDate: '2026-11-28' });
    onUpdateDeadlineDate.mock.lastCall![2](true);
    await nextTick();
    expect(buttonWithText('批量设置截止日期')?.disabled).toBe(true);
    expect(taskRow(1).textContent).toContain('2026-11-28');
    expect(taskRow(3).textContent).toContain('2026-11-28');
    expect(taskRow(3).querySelector('.plan-date-cell')?.textContent).toContain('未定日期');
    expect(taskRow(2).textContent).not.toContain('2026-11-28');

    taskRow(1).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await nextTick();
    taskRow(3).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await nextTick();
    buttonWithText('批量设置截止日期')!.click();
    await nextTick();
    buttonWithText('清除所选任务的截止日期')!.click();
    await nextTick();
    buttonWithText('保存')!.click();
    expect(onUpdateDeadlineDate).toHaveBeenLastCalledWith([1, 3], null, expect.any(Function));
    expect(onUpdateWorkDate).not.toHaveBeenCalled();
  });

  it('highlights only unfinished tasks due by today in Shanghai', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-26T16:00:00Z'));
    const today = '2026-11-27';
    await mount(false, [
      { ...baseTask, id: 1, deadlineDate: [2026, 11, 27] },
      { ...baseTask, id: 2, deadlineDate: '2026-11-26', status: 'DONE' },
      { ...baseTask, id: 3, deadlineDate: today, actualQuantity: 10, status: 'DONE' },
      { ...baseTask, id: 4, deadlineDate: today, shortageHandledAt: today, status: 'DONE' },
      { ...baseTask, id: 5, deadlineDate: today, status: 'CLOSED' },
      { ...baseTask, id: 6, deadlineDate: '2026-11-28' },
      { ...baseTask, id: 7, deadlineDate: null },
    ]);

    const flagged = [...document.querySelectorAll<HTMLElement>('[data-task-id].plan-overdue')];
    expect(flagged.map((row) => row.dataset.taskId).toSorted((a, b) => Number(a) - Number(b))).toEqual(['1', '2']);
    expect(taskRow(1).textContent).toContain(today);
    expect(taskRow(1).querySelector('.plan-date-cell')?.getAttribute('rowspan')).toBe('2');
    expect(taskRow(3).querySelector('.plan-date-cell')?.getAttribute('rowspan')).toBe('5');
  });
});
