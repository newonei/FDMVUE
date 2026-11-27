import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { describe, expect, it } from 'vitest';

import { buildWorkshopPlanRows } from './plan-model';

const task: Api.Task = {
  actualQuantity: 0,
  id: 1,
  orderCount: 0,
  process: 'MIX',
  quantity: 10,
  scheduleId: 2,
  status: 'OPEN',
  unit: '张',
  workDate: [2026, 11, 26],
};

const item: Api.RelatedOrderItem = {
  customerName: '张三',
  itemId: 1,
  orderId: 1,
  orderNo: 'FDM-1',
  productName: '双色垫',
  promisedDate: [2026, 12, 1],
  quantity: 240,
  targetBackColor: 'GY',
  targetFrontColor: 'PU',
  targetLength: 183,
  targetThickness: 0.6,
  targetWidth: 61,
  unit: '条',
};

const options: StockApi.Options = {
  colors: [{ label: '紫色', value: 'PU' }, { label: '灰色', value: 'GY' }],
  materials: [],
  patterns: [],
  processes: [],
  rawMaterials: [],
  recipes: [],
  stages: [],
  textures: [{ label: '圆点纹', value: 'DOT' }],
};

describe('workshop plan rows', () => {
  it('deduplicates merged tasks and order items and keeps stock and undated tasks visible', () => {
    const merged = {
      ...task,
      relatedOrderItems: [item, item, { ...item, itemId: 2, orderId: 2, orderNo: 'FDM-2', promisedDate: null, quantity: 20, requiredDate: '2026-12-02' }],
    };
    const rows = buildWorkshopPlanRows([
      { ...task, id: 5, sequence: 2, undated: true, workDate: '2026-11-15' },
      merged,
      { ...task, id: 3, workDate: '2026-11-25' },
      merged,
      { ...task, id: 4, sequence: 1, undated: true, workDate: '2026-11-24' },
    ], undefined, '2026-11-27');
    expect(rows.map((row) => row.task.id)).toEqual([3, 1, 4, 5]);
    expect(rows[1]).toMatchObject({
      customer: '张三', date: '2026-11-26', due: '2026-12-01、2026-12-02',
      order: 'FDM-1、FDM-2', orderQuantity: '260 条', product: '双色垫', size: '1830×610×6 mm',
    });
    expect(rows[2]).toMatchObject({ date: '', order: '备货任务 · 排单 #2', orderQuantity: '', size: '' });
  });

  it('puts today first, keeps same-day tasks in sequence and leaves undated tasks at the end', () => {
    const rows = buildWorkshopPlanRows([
      { ...task, id: 1, sequence: 4, workDate: '2026-11-27' },
      { ...task, id: 2, sequence: 1, workDate: '2026-11-28' },
      { ...task, id: 3, sequence: 2, workDate: '2026-11-26' },
      { ...task, id: 4, sequence: 1, undated: true, workDate: '2026-11-27' },
      { ...task, id: 5, sequence: 1, undated: false, workDate: '2026-11-27' },
    ], undefined, '2026-11-27');
    expect(rows.map((row) => row.task.id)).toEqual([5, 1, 3, 2, 4]);
  });

  it('calculates good rate from actual output and keeps supplemental credit in plan progress', () => {
    const rows = buildWorkshopPlanRows([
      {
        ...task, actualQuantity: '8', completedBySupplement: true, defectQuantity: '4',
        doneAt: [2026, 11, 27, 19, 0, 0], plannedQuantity: 20, status: 'DONE', supplementGoodQuantity: 3,
      },
      { ...task, id: 2, actualQuantity: 6, defectQuantity: 0, quantity: 5, status: 'DONE' },
      { ...task, id: 3, defectQuantity: 4, quantity: 0 },
      { ...task, id: 4 },
      { ...task, id: 5, actualQuantity: '' },
      { ...task, id: 6, actualQuantity: 6, status: 'CLOSED' },
    ]);
    expect(rows[0]!.completed).toBe('2026-11-27');
    expect(rows[0]!.goodRate).toBeCloseTo(8 / 12);
    expect(rows[0]!.progress.targetLabel).toBe('良品已补齐');
    expect(rows[1]!.progress.targetLabel).toBe('良品已达计划');
    expect(rows.slice(1).map((row) => row.goodRate)).toEqual([1, 0, undefined, undefined, undefined]);
  });

  it('shows the factory date for completion timestamps near midnight', () => {
    const [row] = buildWorkshopPlanRows([
      { ...task, doneAt: Date.UTC(2026, 10, 26, 16, 10) },
    ]);
    expect(row!.completed).toBe('2026-11-27');
  });

  it('keeps colors, textures and material plan quantities in their own fields', () => {
    const embossing: Api.Task = {
      ...task, id: 2, process: 'EMBOSS', relatedOrderItems: [item], output: { attrs: { textureFront: 'DOT' }, stage: 'EMBOSSED' },
    };
    const slicing: Api.Task = {
      ...task, actualBatchAvailable: 9, available: 8, id: 3, process: 'SLICE', sliceBoardYield: 11, unit: '片',
      inputs: [{ attrs: { color: 'GY', length: 192, thickness: 4.5, width: 100 }, quantity: 1, stage: 'BOARD', unit: '张' }],
      output: { attrs: { color: 'GY' }, side: 'BACK', stage: 'SHEET' },
      relatedOrderItems: [item],
    };
    const punching: Api.Task = { ...task, id: 4, process: 'PUNCH', relatedOrderItems: [item] };
    const [emboss, slice, punch] = buildWorkshopPlanRows([embossing, slicing, punching], options);
    expect(emboss!.colors).toEqual([
      { label: '正面颜色', side: 'FRONT', value: '紫色' },
      { label: '反面颜色', side: 'BACK', value: '灰色' },
    ]);
    expect(emboss!.requirements).toEqual([{ label: '正面纹路', side: 'FRONT', value: '圆点纹' }]);
    expect(slice!.colors).toEqual([{ label: '反面颜色', side: 'BACK', value: '灰色' }]);
    expect(slice!.materials).toEqual([
      { label: '用板', value: expect.stringMatching(/^1 张 · /) },
      { label: '预计可开', value: '11 片' },
    ]);
    expect(punch!.colors).toEqual(emboss!.colors);
    expect(punch!.requirements).toEqual([]);
  });
});
