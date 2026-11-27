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
      onInput: (event: Event) => emit('update:value', (event.target as HTMLInputElement).value),
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

async function mount(canEditWorkDate: boolean) {
  const tasks = ref<Api.Task[]>([
    baseTask,
    { ...baseTask, id: 2, actualQuantity: 10, status: 'DONE' },
    { ...baseTask, id: 3, undated: true },
  ]);
  const onUpdateWorkDate = vi.fn<(id: number, date: string, done: (success: boolean) => void) => void>();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(PlanTable, { canEditWorkDate, onUpdateWorkDate, process: 'MIX', tasks: tasks.value }),
  });
  app.mount(host);
  unmount = () => app.unmount();
  await nextTick();
  return { onUpdateWorkDate, tasks };
}

afterEach(() => {
  unmount?.();
  document.body.replaceChildren();
});

describe('workshop production date editor', () => {
  it('keeps shared dates grouped for read-only users', async () => {
    await mount(false);

    expect(document.querySelector('[data-task-id="1"] .plan-date-cell')?.getAttribute('rowspan')).toBe('2');
    expect(document.querySelector('button[aria-label$="的生产日期"]')).toBeNull();
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

    const save = [...document.querySelectorAll('button')].find((button) => button.textContent?.replaceAll(/\s/g, '') === '保存');
    expect(save).toBeTruthy();
    save!.click();
    expect(onUpdateWorkDate).toHaveBeenCalledWith(2, '2026-11-25', expect.any(Function));
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
});
