import { describe, expect, it } from 'vitest';

import { materialRows, materialText, rescaleMaterials, stageTaskPlan, taskMaterials, taskMaterialText, taskOutputAttrs } from './schedule';

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
    expect(stageTaskPlan('SLICE', choice)).toMatchObject({ kind: 'sheet', spec: '已开片板材 2100×1360×6 mm · TPE', suggested: 96 });
    expect(stageTaskPlan('CUT', choice)).toMatchObject({ kind: 'sheet', spec: '1830×610×6 mm · TPE', suggested: 180 });
  });

  it('uses the single-layer sheet specification and count for slicing', () => {
    const plan = stageTaskPlan('SLICE', { name: '历史规格', spec: '183×61×0.3cm', sheets: 96, sheetSpec: '210×136×0.3cm' });
    expect(plan.suggested).toBe(96);
    expect(plan.spec).toBe('2100×1360×3 mm');
    expect(plan.hint).toContain('按订单单层厚度开片');
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

describe('task materials', () => {
  const slice = {
    inputs: [{ name: '板材 132×192×4.5cm 雾霾蓝', quantity: 10, stage: 'BOARD', unit: '张' }],
    output: { name: '片材 132×192×0.6cm 雾霾蓝', quantity: 70, stage: 'SHEET', unit: '片' },
    quantity: 70,
  };

  it('uses precise output attributes and falls back for unnamed legacy materials', () => {
    const text = materialText({ stage: 'BOARD', name: '过时规格', attrs: { material: 'TPE', color: 'ZI', length: 210, width: 136, thickness: 4.5 }, quantity: 8, unit: '张' });
    expect(text).toContain('2100×1360×45 mm');
    expect(text).toContain('8张');
    expect(text).not.toContain('过时规格');
    expect(materialText({ stage: 'RAW', code: 'RAW-1' })).toBe('RAW-1');
    expect(materialText({ stage: 'BOARD', name: null })).toBe('板材（发泡）');
  });

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

  it('lists each material with its semi-product code', () => {
    const rows = materialRows({
      inputs: [{ ...slice.inputs[0]!, code: 'BC-TPE-REC001-WB-132X192X4.5', productCode: 'BCP0001' }],
      output: { ...slice.output, code: 'PC-TPE-WB-132X192X0.6', newItem: true, note: '新规格，第一次报工时自动建档' },
      quantity: 70,
    });
    expect(rows).toEqual([
      expect.objectContaining({ code: 'BC-TPE-REC001-WB-132X192X4.5', kind: '领料', productCode: 'BCP0001' }),
      expect.objectContaining({ code: 'PC-TPE-WB-132X192X0.6', kind: '产出', newItem: true, text: '片材 132×192×0.6cm 雾霾蓝 70片' }),
    ]);
  });
});
