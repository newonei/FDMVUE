import type { BatchDetailLine } from './batch-detail';

import { describe, expect, it } from 'vitest';

import { planBatchDetails } from './batch-detail';

const blankLine: BatchDetailLine = {
  aux: [],
  key: 'blank',
  quantity: null,
  remark: '',
  route: { steps: [] },
  unit: '条',
};
const route = { routeId: 3, steps: ['SLICE', 'PUNCH'] };

describe('生产需求批量设置预览', () => {
  it('按字段补空白，不覆盖同一行的既有数量和路线', () => {
    const lines = [
      { ...blankLine, key: 'filled', quantity: 3, remark: '  ', route },
      blankLine,
    ];
    const plan = planBatchDetails(lines, { quantity: 8, remark: '同批', route }, false);

    expect(plan.changes).toEqual([
      { key: 'filled', remark: '同批' },
      { key: 'blank', quantity: 8, remark: '同批', route },
    ]);
    expect(plan.overwritten).toBe(0);
    expect(plan.counts).toEqual({ quantity: 1, remark: 2, route: 1 });
  });

  it('覆盖行数去重，不计算相同值，也不清除未填字段', () => {
    const lines = [
      { ...blankLine, key: 'existing', quantity: 3, remark: '旧备注', route: { steps: ['PACK'] } },
      { ...blankLine, key: 'unchanged', quantity: 8, remark: '保留备注', route: { ...route, steps: [...route.steps] } },
    ];
    const plan = planBatchDetails(lines, { quantity: 8, route }, true);

    expect(plan.changes).toEqual([{ key: 'existing', quantity: 8, route }]);
    expect(plan.overwritten).toBe(1);
  });

  it('按实际需要修改数量的行检查单位', () => {
    const lines = [blankLine, { ...blankLine, key: 'box', quantity: 2, unit: '箱' }];
    expect(planBatchDetails(lines, { quantity: 8 }, false).mixedUnits).toBe(false);
    expect(planBatchDetails(lines, { quantity: 8 }, true).mixedUnits).toBe(true);
  });

  it('预警新路线移除已有辅料的领用工序，但不修改辅料', () => {
    const aux = [{ perUnit: 1, process: 'PACK', productId: 'carton' }];
    const line = { ...blankLine, aux, route: { steps: ['PACK'] } };

    expect(planBatchDetails([line], { route }, false).auxConflicts).toBe(0);
    const plan = planBatchDetails([line], { route }, true);
    expect(plan.auxConflicts).toBe(1);
    expect(plan.changes).toEqual([{ key: line.key, route }]);
    expect(line.aux[0]?.process).toBe('PACK');
  });
});
