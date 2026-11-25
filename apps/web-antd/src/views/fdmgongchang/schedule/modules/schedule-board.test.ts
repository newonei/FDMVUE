/* eslint-disable vue/one-component-per-file -- Cached route fixtures exercise activation and deactivation. */
import type { App } from 'vue';

import { createApp, defineComponent, h, KeepAlive, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ScheduleBoard from './schedule-board.vue';

const api = vi.hoisted(() => ({
  createManualSchedule: vi.fn(),
  getMixQueue: vi.fn().mockResolvedValue([]),
  getSchedule: vi.fn(),
  getSchedules: vi.fn(),
}));
const access = vi.hoisted(() => vi.fn(() => false));
vi.mock('#/api/fdmgongchang/schedule', () => api);
vi.mock('#/api/fdmgongchang/factory', () => ({
  getWorkerList: vi.fn().mockResolvedValue([]),
}));
vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: access }),
}));
vi.mock('ant-design-vue', () => ({
  Button: 'button', DatePicker: 'input', Empty: 'div', Input: 'input',
  message: {}, Result: 'div', Select: 'select', Spin: 'div', Tag: 'span',
}));
vi.mock('./mix-batch-modal.vue', () => ({ default: { render: () => null } }));
vi.mock('./package-release-modal.vue', () => ({ default: { render: () => null } }));
vi.mock('./schedule-detail.vue', () => ({ default: { render: () => null } }));

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await nextTick();
}

describe('schedule board', () => {
  let app: App | undefined;
  let host: HTMLDivElement | undefined;

  afterEach(() => {
    app?.unmount();
    app = undefined;
    host?.remove();
    host = undefined;
    access.mockReset().mockReturnValue(false);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('pauses when hidden, ignores late responses and resumes on return', async () => {
    vi.useFakeTimers();
    const schedule = { id: 1, scheduleNo: 'SC-1', status: 'GENERATING' };
    api.getSchedules.mockResolvedValue([schedule]);
    api.getSchedule.mockResolvedValue(schedule);
    const visible = ref(true);
    const other = defineComponent({ render: () => h('div') });
    app = createApp({
      render: () => h(KeepAlive, null, {
        default: () => visible.value
          ? h(ScheduleBoard, { factoryId: 1 })
          : h(other),
      }),
    });
    app.mount(document.createElement('div'));
    await flush();
    expect(api.getSchedule).toHaveBeenCalledOnce();

    let finishPolling!: (value: typeof schedule) => void;
    api.getSchedule.mockImplementationOnce(() => new Promise((resolve) => {
      finishPolling = resolve;
    }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(api.getSchedule).toHaveBeenCalledTimes(2);
    visible.value = false;
    await nextTick();
    finishPolling(schedule);
    await flush();
    await vi.advanceTimersByTimeAsync(9000);
    expect(api.getSchedule).toHaveBeenCalledTimes(2);

    visible.value = true;
    await nextTick();
    await flush();
    expect(api.getSchedule).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(3000);
    expect(api.getSchedule).toHaveBeenCalledTimes(4);
    visible.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(9000);
    expect(api.getSchedule).toHaveBeenCalledTimes(4);
  });

  it('focuses manual planning from a shortage without creating a draft', async () => {
    access.mockReturnValue(true);
    api.getSchedules.mockResolvedValue([]);
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(ScheduleBoard, { factoryId: 1, focusManualPlanning: true });
    app.mount(host);
    await flush();

    const button = host.querySelector<HTMLButtonElement>('#factory-manual-planning');
    expect(button?.closest('details')?.open).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(api.createManualSchedule).not.toHaveBeenCalled();
  });
});
