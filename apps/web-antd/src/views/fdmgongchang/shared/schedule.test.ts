import { describe, expect, it } from 'vitest';

import { stageTaskPlan, taskMaterialText, taskOutputAttrs } from './schedule';

describe('stageTaskPlan', () => {
  const choice = {
    boards: 12,
    boardSpec: '板材 210×136×4.8cm · TPE · 配方 REC-001',
    name: '单色TPE瑜伽垫',
    remaining: 180,
    sheets: 96,
    sheetSpec: '已开片板材 210×136×0.6cm · TPE',
    spec: '183*61*0.6cm · TPE',
  };

  it('keeps foaming and slicing as boards and makes cut output a sheet', () => {
    expect(stageTaskPlan('MIX', choice)).toEqual({
      hint: '订单还要做 180 条成品，按用料逆推要 12 张板',
      kind: 'board',
      spec: '板材 2100×1360×48 mm · TPE · 配方 REC-001',
      suggested: 12,
    });
    expect(stageTaskPlan('SLICE', choice)).toMatchObject({ kind: 'board', spec: '板材 2100×1360×48 mm · TPE · 配方 REC-001', suggested: 12 });
    expect(stageTaskPlan('CUT', choice)).toMatchObject({ kind: 'sheet', spec: '1830×610×6 mm · TPE', suggested: 180 });
  });

  it('does not use an old layer count or thin sheet specification as a slicing target', () => {
    const plan = stageTaskPlan('SLICE', { name: '历史规格', spec: '183×61×0.3cm', sheets: 96, sheetSpec: '210×136×0.3cm' });
    expect(plan.suggested).toBeNull();
    expect(plan.spec).toBe('');
    expect(plan.hint).toContain('自动沿用其厚度');
  });

  it('leaves unknown board dimensions empty instead of substituting finished product dimensions', () => {
    const plan = stageTaskPlan('MIX', { name: '单色TPE瑜伽垫', spec: '183*61*0.6cm · TPE' });
    expect(plan.spec).toBe('');
    expect(plan.suggested).toBeNull();
    expect(plan.hint).toContain('本次发泡板材的尺寸');
  });

  it('requires an explicit single color for intermediate material of a two-color product', () => {
    expect(taskOutputAttrs('CUT', { material: 'TPE', frontColor: 'ZI', backColor: 'HUI', length: 183, width: 61, thickness: 0.3 }))
      .toEqual({ material: 'TPE', color: null, length: 183, width: 61, thickness: 0.3 });
    expect(taskOutputAttrs('SHEET', { color: 'ZI', frontColor: 'HUI', length: 210, width: 136, thickness: 0.3 }).color).toBe('ZI');
    expect(taskMaterialText({ stage: 'SHEET', attrs: { color: 'ZI', length: 210, width: 136, thickness: 0.3 } })).toContain('已开片板材');
  });
});
