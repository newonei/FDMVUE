import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { deriveOutputs } from '../stage-stock/model';
import ReportStep from './modules/report-step.vue';
import { changeReportDefect, changeReportTotal, prefillReportQuantity } from './report-quantity';
import { applyJobTarget, createJob, jobAllowsPlainEmboss, outputPayload, provideJob } from './use-job';

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

  it('uses frozen rule targets for laminate shrinkage while preserving blanks and legacy layer sums', () => {
    const job = jobFor('LAMINATE');
    job.process!.outputStage = 'LAMINATED';
    job.inputs = ['PU', 'GY'].map((color, i) => ({ quantity: 10, side: i === 0 ? 'FRONT' : 'BACK', stock: { id: i + 1, itemCode: `M${i}`, batchNo: `B${i}`, stage: 'CUT', location: 'A', quantity: 10,
      item: { material: 'TPE', color, length: 190, width: 65, thickness: 0.32 } } }));
    job.prepare = { task: job.task!, aux: [], picks: [], layerRule: 'COLOR_DERIVED_V1', targetAttrs: { length: 183, width: 61, thickness: 0.6 } };
    job.outputs = deriveOutputs('LAMINATE', job.inputs);
    applyJobTarget(job);
    expect(job.outputs[0]!.attrs).toMatchObject({ length: 190, width: 65, thickness: 0.6 });
    job.prepare.outputAttrs = { length: 188, width: 64, thickness: 0.6 };
    job.outputs = deriveOutputs('LAMINATE', job.inputs); applyJobTarget(job);
    expect(job.outputs[0]!.attrs).toMatchObject({ length: 188, width: 64, thickness: 0.6 });
    job.prepare.layerRule = null;
    job.outputs = deriveOutputs('LAMINATE', job.inputs); applyJobTarget(job);
    expect(job.outputs[0]!.attrs.thickness).toBe(0.64);
    job.prepare = undefined; job.task = undefined;
    job.productionItem = { id: 3, label: '新单', orderNo: 'PO3', layerRule: 'COLOR_DERIVED_V1', targetThickness: 0.6 };
    job.outputs = deriveOutputs('LAMINATE', job.inputs); applyJobTarget(job);
    expect(job.outputs[0]!.attrs).toMatchObject({ length: 190, width: 65, thickness: 0.6 });
  });

  it.each(['prepare', 'order', 'legacy', 'order-denies'] as const)('only accepts plain EMBOSS using the trusted %s context', async (context) => {
    const job = jobFor('EMBOSS');
    job.process!.outputStage = 'EMBOSSED';
    job.outputs[0]!.attrs = { material: 'TPE', frontColor: 'PU', backColor: 'PU', length: 190, width: 65, thickness: 0.6 };
    job.outputs[0]!.goodQuantity = 10;
    job.prepare = { task: job.task!, aux: [], picks: [], allowPlainEmboss: context !== 'legacy', layerRule: 'COLOR_DERIVED_V1', outputAttrs: { thickness: 0.6 } };
    if (context === 'order' || context === 'order-denies') job.order = { allowPlainEmboss: context === 'order', layerRule: context === 'order' ? 'COLOR_DERIVED_V1' : null } as typeof job.order;
    const next = vi.fn();
    const host = document.createElement('div'); document.body.append(host);
    const app = createApp(defineComponent({ setup() { provideJob(job); return () => h(ReportStep, { onNext: next }); } }));
    app.mount(host); unmount = () => app.unmount(); await nextTick();
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('下一步：核对本次报工'))!.click();
    await nextTick();
    const allowed = context === 'prepare' || context === 'order';
    expect(jobAllowsPlainEmboss(job)).toBe(allowed);
    expect(next).toHaveBeenCalledTimes(allowed ? 1 : 0);
    expect(document.body.textContent?.includes('请选择正面或反面纹路')).toBe(!allowed);
  });

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
    changeReportTotal(line, 100);
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

  it('shows total and defects separately, rejects excess defects and keeps edits when revisiting', async () => {
    const job = jobFor('PACK');
    prefillReportQuantity(job);
    const next = vi.fn();
    const mount = () => {
      const host = document.createElement('div'); document.body.append(host);
      const app = createApp(defineComponent({ setup() { provideJob(job); return () => h(ReportStep, { onNext: next }); } }));
      app.mount(host); unmount = () => { app.unmount(); host.remove(); };
    };
    const flush = async () => { for (let i = 0; i < 5; i++) await nextTick(); };
    mount(); await flush();
    const fill = (id: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const submit = () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(document.querySelector<HTMLInputElement>('#total-test')!.value).toBe('270');
    fill('#bad-test', '3');
    await flush();
    expect(job.outputs[0]!.goodQuantity).toBe(267);
    fill('#total-test', '4');
    fill('#bad-test', '5');
    await flush();
    submit();
    await flush();
    expect(next).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('瑕疵数量不能超过本次产量');
    fill('#bad-test', '4');
    await flush();
    unmount?.(); mount(); await flush();
    expect(document.querySelector<HTMLInputElement>('#total-test')!.value).toBe('4');
    expect(document.querySelector<HTMLInputElement>('#bad-test')!.value).toBe('4');
    submit();
    await flush();
    expect(next).toHaveBeenCalledOnce();
    expect(outputPayload(job)[0]).toMatchObject({ goodQuantity: 0, defectQuantity: 4 });
  });
});
