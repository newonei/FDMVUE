import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ReportStep from './modules/report-step.vue';
import { changeReportDefect, changeReportGood, prefillReportQuantity } from './report-quantity';
import { createJob, outputPayload, provideJob } from './use-job';

vi.mock('#/components/upload/image-upload.vue', () => ({ default: { render: () => null } }));

function jobFor(process = 'SLICE') {
  const job = createJob();
  job.process = { code: process, label: process, sources: ['BOARD'], outputStage: 'SHEET', outputLabel: '片材', outputUnit: '片' };
  job.task = { id: 1, scheduleId: 1, process, workDate: '2026-11-16', quantity: 270, actualQuantity: 0, orderCount: 1 };
  job.outputs = [{ key: 'test', batchNo: '', attrs: { material: 'TPE', color: 'BL', length: 132, width: 192, thickness: 0.3 } }];
  job.options = { stages: [], processes: [], materials: [], colors: [], textures: [], patterns: [], recipes: [], rawMaterials: [] } as unknown as NonNullable<typeof job.options>;
  return job;
}

describe('planned workbench report quantities', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => { unmount?.(); unmount = undefined; document.body.innerHTML = ''; });

  it.each(['MIX', 'SLICE', 'CUT', 'LAMINATE', 'EMBOSS', 'PUNCH', 'ENGRAVE', 'FOLD', 'PACK'])('prefills %s and deducts defects without accumulating deductions', (process) => {
    const job = jobFor(process);
    prefillReportQuantity(job);
    const line = job.outputs[0]!;
    expect(line.goodQuantity).toBe(270);
    changeReportDefect(line, 3);
    expect(line.goodQuantity).toBe(267);
    changeReportDefect(line, 5);
    expect(line.goodQuantity).toBe(265);
    changeReportDefect(line, 1);
    expect(line.goodQuantity).toBe(269);
    changeReportDefect(line, null);
    expect(line.goodQuantity).toBe(270);
    expect(outputPayload(job)[0]).not.toHaveProperty('reportTotal');
  });

  it('subtracts earlier good and defective reports once, using current order data if the task list is stale', () => {
    const job = jobFor();
    job.task!.actualQuantity = 100;
    job.task!.defectQuantity = 3;
    job.order = { goodQuantity: 120, defectQuantity: 5 } as typeof job.order;
    prefillReportQuantity(job);
    expect(job.outputs[0]!.goodQuantity).toBe(145);
    job.order!.goodQuantity = 270;
    prefillReportQuantity(job);
    expect(job.outputs[0]!.goodQuantity).toBe(0);
  });

  it('uses whole-batch foaming output and preserves a manually reduced partial batch', () => {
    const job = jobFor('MIX');
    job.task!.output = { mixPlan: { wholeBatchBoards: 300 } } as NonNullable<typeof job.task>['output'];
    prefillReportQuantity(job);
    const line = job.outputs[0]!;
    expect(line.goodQuantity).toBe(300);
    changeReportGood(line, 100);
    changeReportDefect(line, 3);
    expect(line.goodQuantity).toBe(97);
    changeReportDefect(line, 110);
    expect(line.goodQuantity).toBe(0);
    changeReportDefect(line, 2);
    expect(line.goodQuantity).toBe(98);
  });

  it('does not duplicate a task total across different output rows or invent a plan for independent production', () => {
    const job = jobFor();
    job.outputs.push({ key: 'other', batchNo: '', attrs: { color: 'RD' } });
    prefillReportQuantity(job);
    expect(job.outputs.every((line) => line.goodQuantity === undefined)).toBe(true);
    job.outputs.pop();
    job.task = undefined;
    prefillReportQuantity(job);
    expect(job.outputs[0]!.goodQuantity).toBeUndefined();
  });

  it('updates the visible counters when the worker types or clicks defects, and keeps edits when revisiting', async () => {
    const job = jobFor('PACK');
    prefillReportQuantity(job);
    const mount = () => {
      const host = document.createElement('div'); document.body.append(host);
      const app = createApp(defineComponent({ setup() { provideJob(job); return () => h(ReportStep); } }));
      app.mount(host); unmount = () => { app.unmount(); host.remove(); };
    };
    const flush = async () => { for (let i = 0; i < 5; i++) await nextTick(); };
    mount(); await flush();
    expect(document.querySelector<HTMLInputElement>('#good-test')!.value).toBe('270');
    const bad = document.querySelector<HTMLInputElement>('#bad-test')!;
    bad.value = '3'; bad.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(job.outputs[0]!.goodQuantity).toBe(267);
    document.querySelector<HTMLButtonElement>('[aria-label="坏的数量加 1"]')!.click();
    await flush();
    expect(job.outputs[0]!.goodQuantity).toBe(266);
    unmount?.(); mount(); await flush();
    expect(document.querySelector<HTMLInputElement>('#good-test')!.value).toBe('266');
  });
});
