import { describe, expect, it } from 'vitest';

import { rescaleMaterials, stageTaskPlan, taskMaterials } from './schedule';

describe('stageTaskPlan', () => {
  const choice = {
    boards: 12,
    boardSpec: '板材 210×136×4.8cm · TPE · 配方 REC-001',
    name: '单色TPE瑜伽垫',
    remaining: 180,
    sheets: 96,
    sheetSpec: '片材 210×136×0.6cm · TPE',
    spec: '183*61*0.6cm · TPE',
  };

  it('mixing makes boards and slicing makes sheets, not the finished product', () => {
    expect(stageTaskPlan('MIX', choice)).toEqual({
      hint: '订单还要做 180 条成品，按用料逆推要 12 张板',
      kind: 'board',
      spec: '板材 210×136×4.8cm · TPE · 配方 REC-001',
      suggested: 12,
    });
    expect(stageTaskPlan('SLICE', choice)).toMatchObject({ kind: 'sheet', spec: '片材 210×136×0.6cm · TPE', suggested: 96 });
    expect(stageTaskPlan('CUT', choice)).toMatchObject({ hint: '', kind: undefined, spec: '183*61*0.6cm · TPE', suggested: 180 });
  });

  it('says it is a board for the product when the board cannot be worked out', () => {
    const plan = stageTaskPlan('MIX', { name: '单色TPE瑜伽垫', spec: '183*61*0.6cm · TPE' });
    expect(plan.spec).toBe('板材（成品 183*61*0.6cm · TPE）');
    expect(plan.suggested).toBeNull();
    expect(plan.hint).toContain('发泡做的是板材，不是成品');
  });
});

describe('task materials', () => {
  const slice = {
    inputs: [{ name: '板材 132×192×4.5cm 雾霾蓝', quantity: 10, stage: 'BOARD', unit: '张' }],
    output: { name: '片材 132×192×0.6cm 雾霾蓝', quantity: 70, stage: 'SHEET', unit: '片' },
    quantity: 70,
  };

  it('writes what to pick and what comes out', () => {
    expect(taskMaterials(slice)).toEqual({
      input: '板材 132×192×4.5cm 雾霾蓝 10张',
      output: '片材 132×192×0.6cm 雾霾蓝 70片',
    });
    expect(taskMaterials({ quantity: 5 })).toBeNull();
  });

  it('follows a changed quantity', () => {
    // 排单员把 70 片改成 35 片：板材 5 张
    const half = rescaleMaterials(slice, 70, 35);
    expect(half.inputs[0]!.quantity).toBe(5);
    expect(half.output!.quantity).toBe(35);
    // 接单时按上道良品改成 63 片：板材按比例向上取整
    expect(taskMaterials({ ...slice, plannedQuantity: 70, quantity: 63 })!.input).toBe('板材 132×192×4.5cm 雾霾蓝 9张');
    const mix = rescaleMaterials({ inputs: [{ name: '原材料 REC-001', quantity: 1701.54, stage: 'RAW', unit: 'kg' }] }, 92, 46);
    expect(mix.inputs[0]!.quantity).toBe(850.77);
  });
});
