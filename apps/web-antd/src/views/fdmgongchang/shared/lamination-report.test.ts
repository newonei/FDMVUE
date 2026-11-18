import { describe, expect, it } from 'vitest';

import { createJob, outputPayload } from '../workbench/use-job';
import { changeLaminationDefect, changeLaminationGood, laminationDefects, laminationLayers } from './lamination-report';

function draft() {
  return { attrs: { frontColor: 'GRAY', backColor: 'BLUE' }, batchNo: '', key: 'test', goodQuantity: 540, defectQuantity: 0 };
}

describe('lamination report quantities', () => {
  it('deducts each color independently and pairs only usable sheets', () => {
    const line = draft();
    laminationLayers(line);
    changeLaminationDefect(line, 'FRONT', 40);
    expect(line.goodQuantity).toBe(500);
    expect(laminationLayers(line).map((layer) => layer.goodQuantity)).toEqual([500, 540]);
    changeLaminationDefect(line, 'BACK', 10);
    expect(line.goodQuantity).toBe(500);
    expect(line.defectQuantity).toBe(40);
    changeLaminationDefect(line, 'FRONT', 5);
    expect(line.goodQuantity).toBe(530);
    expect(line.defectQuantity).toBe(10);
    expect(laminationDefects(line)).toEqual([
      { side: 'FRONT', color: 'GRAY', quantity: 5 },
      { side: 'BACK', color: 'BLUE', quantity: 10 },
    ]);
  });

  it('retains partial report edits and distinguishes two sides of the same color', () => {
    const line = draft();
    line.attrs.backColor = 'GRAY';
    changeLaminationGood(line, 'FRONT', 100);
    changeLaminationDefect(line, 'FRONT', 3);
    expect(line.goodQuantity).toBe(97);
    expect(laminationLayers(line)[1]!.goodQuantity).toBe(540);
    changeLaminationDefect(line, 'FRONT', 2);
    expect(line.goodQuantity).toBe(98);
    expect(laminationLayers(line).map((layer) => layer.side)).toEqual(['FRONT', 'BACK']);
  });

  it('includes per-color losses in the workbench request while keeping draft fields local', () => {
    const job = createJob();
    job.process = { code: 'LAMINATE', label: '贴合', sources: ['CUT'], outputStage: 'LAMINATED', outputLabel: '已复合片材', outputUnit: '片' };
    job.outputs = [draft()];
    changeLaminationDefect(job.outputs[0]!, 'FRONT', 40);
    const payload = outputPayload(job)[0]!;
    expect(payload.goodQuantity).toBe(500);
    expect(payload.defectQuantity).toBe(40);
    expect(payload.laminateDefects).toEqual([
      { side: 'FRONT', color: 'GRAY', quantity: 40 },
      { side: 'BACK', color: 'BLUE', quantity: 0 },
    ]);
    expect(payload).not.toHaveProperty('laminateLayers');
  });

  it('does not retain old color losses when one output color is cleared', () => {
    const line = draft();
    changeLaminationDefect(line, 'FRONT', 40);
    line.attrs.backColor = '';
    expect(laminationLayers(line)).toEqual([]);
    expect(laminationDefects(line)).toBeUndefined();
    expect(line).not.toHaveProperty('laminateLayers');
  });

  it('keeps an old fractional estimate out of integer sheet report requests', () => {
    const line = draft();
    line.goodQuantity = 540.5;
    expect(laminationLayers(line).map((layer) => layer.goodQuantity)).toEqual([540, 540]);
    expect(line.goodQuantity).toBe(540);
  });
});
