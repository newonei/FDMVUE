import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { describe, expect, it } from 'vitest';

import { finishedQuantity, finishedSize, groupWorkshopOrders, mixPlanLines, orderFocus, orderMatches, taskFocus, uniqueTasks } from './order-model';

const task: Api.Task = { id: 1, scheduleId: 2, process: 'CUT', actualQuantity: 0, quantity: 10, orderCount: 0, unit: '片', workDate: '2026-11-12', status: 'OPEN',
  output: { stage: 'CUT', side: 'FRONT', attrs: { length: 192, width: 66, thickness: 0.3, color: 'PU' } },
};
const first: Api.RelatedOrderItem = { orderId: 10, orderNo: 'GC-10', itemId: 100, productCode: 'SKU-A', productName: '双色垫', quantity: '1000', unit: '张', targetColorMode: 'DUAL', targetLength: 183, targetWidth: 61, targetThickness: 0.6, targetFrontColor: 'PU', targetBackColor: 'GY' };
const second: Api.RelatedOrderItem = { ...first, orderId: 20, orderNo: 'GC-20', itemId: 200, productCode: 'SKU-B', targetLength: 200 };
const options: StockApi.Options = { colors: [{ value: 'PU', label: '紫色' }, { value: 'GY', label: '灰色' }], textures: [{ value: 'AD', label: '安达圆点纹' }, { value: 'BL', label: '波浪纹' }], patterns: [{ value: 'TTXL', label: '体态训练' }], materials: [], stages: [], recipes: [], processes: [], rawMaterials: [] };

describe('workshop order grouping and process focus', () => {
  it('shows the mould, charge weight and whole-batch output on mixing tasks only', () => {
    const mix: Api.Task = { ...task, process: 'MIX', unit: '张', output: { stage: 'BOARD', recipeBatches: 3,
      mixPlan: { mouldName: '620×910×23 / 净板2100×1360×48', chargeKg: 17.2, kgPerBoard: 17.2, batchKg: 122.06, wholeBatchBoards: 21, surplusBoards: 6 } } };
    expect(mixPlanLines(mix)).toEqual([
      { label: '密炼锅数', value: '3 锅（每锅 122.06 kg）' },
      { label: '模具', value: '620×910×23 / 净板2100×1360×48' },
      { label: '每张入模', value: '17.2 kg' },
      { label: '整锅可出', value: '21 张，多出 6 张报工后入库' },
    ]);
    expect(mixPlanLines({ ...mix, output: { stage: 'BOARD', recipeBatches: 2 } })).toEqual([{ label: '密炼锅数', value: '2 锅' }]);
    expect(mixPlanLines({ ...mix, output: { stage: 'BOARD' } })).toEqual([]);
    expect(mixPlanLines(task)).toEqual([]);
  });
  it('keeps each order in one row and deduplicates repeated task and order product IDs', () => {
    const merged = { ...task, relatedOrderItems: [first, second], relatedOrderNos: ['GC-10', 'GC-20'] };
    const other = { ...task, id: 2, relatedOrderItems: [first], relatedOrderNos: ['GC-10'], status: 'DONE' as const };
    const groups = groupWorkshopOrders([merged, merged, other]);
    expect(groups.map((group) => group.orderNo)).toEqual(['GC-10', 'GC-20']);
    expect(groups[0]!.tasks.map((row) => row.id)).toEqual([1, 2]);
    expect(groups[0]!.items).toEqual([first]);
    expect(groups[1]!.items).toEqual([second]);
    expect(uniqueTasks(groups.flatMap((group) => group.tasks))).toHaveLength(2);
    expect(orderMatches(groups[1]!, 'sku-b')).toBe(true);
    expect(orderMatches(groups[0]!, 'sku-b')).toBe(false);
  });
  it('shows the finished product size independently of the intermediate cut dimensions', () => {
    const fields = taskFocus({ ...task, relatedOrderItems: [first] }, options);
    expect(fields).toContainEqual({ label: '成品规格', value: '1830×610×6 mm', side: undefined });
    expect(fields).toContainEqual({ label: '正面颜色', value: '紫色', side: 'FRONT' });
    expect(fields.some((field) => field.value.includes('1920'))).toBe(false);
    expect(finishedSize({ orderId: 1, itemId: 1, orderNo: 'EMPTY' })).toBe('未填写');
  });
  it('does not show another order finished size in the merged order summary', () => {
    const group = groupWorkshopOrders([{ ...task, relatedOrderItems: [first, second] }])[0]!;
    expect(orderFocus(group, options).find((field) => field.label === '成品规格')?.value).toBe('1830×610×6 mm');
    expect(orderFocus(group, options).find((field) => field.label === '成品数量')?.value).toBe('1,000 张');
  });
  it.each(['MIX', 'SLICE', 'CUT', 'LAMINATE', 'PUNCH', 'ENGRAVE', 'FOLD'])('shows order finished quantity next to finished size for %s', (process) => {
    const fields = taskFocus({ ...task, process, relatedOrderItems: [first] }, options);
    const sizeIndex = fields.findIndex((field) => field.label === '成品规格');
    expect(fields[sizeIndex + 1]).toEqual({ label: '成品数量', value: '1,000 张', side: undefined });
  });
  it('sums distinct order lines of the same size without counting repeated sides or tasks twice', () => {
    const extra = { ...first, itemId: 101, quantity: '200' };
    const group = groupWorkshopOrders([
      { ...task, relatedOrderItems: [first, extra] },
      { ...task, id: 2, relatedOrderItems: [first] },
    ])[0]!;
    expect(finishedQuantity([first, first, extra])).toBe('1,200 张');
    expect(orderFocus(group, options).find((field) => field.label === '成品数量')?.value).toBe('1,200 张');
  });
  it('keeps multiple finished sizes and units identifiable in merged tasks', () => {
    expect(finishedQuantity([first, { ...second, quantity: 500 }])).toBe('1830×610×6 mm：1,000 张；2000×610×6 mm：500 张');
    expect(finishedQuantity([first, { ...first, itemId: 101, quantity: 2, unit: '套' }])).toBe('1830×610×6 mm：1,000 张；1830×610×6 mm：2 套');
  });
  it('preserves zero and makes missing quantity explicit without substituting the task quantity', () => {
    expect(finishedQuantity([{ ...first, quantity: 0 }])).toBe('0 张');
    expect(finishedQuantity([{ ...first, quantity: undefined }])).toBe('未填写');
    expect(finishedQuantity([first, { ...first, itemId: 101, quantity: undefined }])).toBe('1,000 张（另有数量未填写）');
    expect(finishedQuantity([{ ...first, unit: undefined }])).toBe('1,000 单位未填写');
    expect(taskFocus(task, options).find((field) => field.label === '成品数量')?.value).toBe('未填写');
  });
  it('aggregates all colors in the order focus without hiding the reverse texture or color', () => {
    const group = groupWorkshopOrders([
      { ...task, relatedOrderItems: [first] },
      { ...task, id: 2, relatedOrderItems: [first], output: { stage: 'CUT', side: 'FRONT', attrs: { color: 'GY' } } },
    ])[0]!;
    expect(orderFocus(group, options).find((field) => field.label === '正面颜色')?.value).toBe('紫色、灰色');
  });
  it('emphasizes both textures and both colors for embossing without irrelevant dimensions', () => {
    const fields = taskFocus({ ...task, process: 'EMBOSS', relatedOrderItems: [first], output: { stage: 'EMBOSSED', attrs: { frontColor: 'PU', backColor: 'GY', textureFront: 'AD', textureBack: 'BL' } } }, options);
    expect(fields.map((field) => [field.label, field.value])).toEqual([
      ['正面纹路', '安达圆点纹'], ['反面纹路', '波浪纹'], ['正面颜色', '紫色'], ['反面颜色', '灰色'],
    ]);
  });
  it('shows foaming gram weight from the order and makes missing weight explicit', () => {
    const fields = taskFocus({ ...task, process: 'MIX', relatedOrderItems: [{ ...first, weight: '900g' }] }, options);
    expect(fields.find((field) => field.label === '克重')?.value).toBe('900g');
    expect(taskFocus({ ...task, process: 'MIX', relatedOrderItems: [first] }, options).find((field) => field.label === '克重')?.value).toBe('未填写');
    expect(taskFocus({ ...task, process: 'SLICE', relatedOrderItems: [first] }, options).map((field) => field.label)).not.toContain('克重');
  });
  it.each([
    ['PUNCH', 'PUNCHED'], ['ENGRAVE', 'ENGRAVED'], ['FOLD', 'FOLDED'], ['PACK', 'PACKED'],
  ])('shows the planned front and back colors for %s in both task and order focus', (process, stage) => {
    const downstream: Api.Task = {
      ...task,
      process,
      output: { stage, attrs: { frontColor: 'GY', backColor: 'PU' } },
      relatedOrderItems: [first],
    };
    const [order] = groupWorkshopOrders([downstream]);
    const expectedColors = [
      { label: '正面颜色', value: '灰色', side: 'FRONT' },
      { label: '反面颜色', value: '紫色', side: 'BACK' },
    ];
    const taskFields = taskFocus(downstream, options);
    expect(taskFields).toEqual(expect.arrayContaining(expectedColors));
    expect(orderFocus(order!, options)).toEqual(expect.arrayContaining(expectedColors));
    expect(taskFields).toContainEqual({ label: '成品规格', value: '1830×610×6 mm', side: undefined });
  });
  it('uses order target colors when a punching task has no output color', () => {
    const fields = taskFocus({
      ...task, process: 'PUNCH', output: { stage: 'PUNCHED' }, relatedOrderItems: [first],
    }, options);
    expect(fields).toEqual(expect.arrayContaining([
      { label: '正面颜色', value: '紫色', side: 'FRONT' },
      { label: '反面颜色', value: '灰色', side: 'BACK' },
    ]));
  });
  it('uses the order color on older tasks with no front or back color', () => {
    const legacyOrder = { ...first, targetFrontColor: undefined, targetBackColor: undefined, color: 'GY' };
    const fields = taskFocus({
      ...task, process: 'FOLD', output: { stage: 'FOLDED' }, relatedOrderItems: [legacyOrder],
    }, options);
    expect(fields.filter((field) => field.label.endsWith('颜色'))).toEqual([
      { label: '颜色', value: '灰色', side: undefined },
    ]);
  });
  it('shows the single output color for a stock task without an order', () => {
    const [order] = groupWorkshopOrders([{
      ...task, process: 'PACK', output: { stage: 'PACKED', attrs: { color: 'PU' } },
    }]);
    expect(orderFocus(order!, options)).toContainEqual({ label: '颜色', value: '紫色', side: undefined });
  });
  it('highlights the engraving pattern', () => {
    expect(taskFocus({ ...task, process: 'ENGRAVE', relatedOrderItems: [{ ...first, targetPattern: 'TTXL' }] }, options)[0]).toEqual({ label: '雕刻图案', value: '体态训练', side: undefined });
  });
});
