import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { describe, expect, it } from 'vitest';

import { finishedSize, groupWorkshopOrders, orderFocus, orderMatches, taskFocus, uniqueTasks } from './order-model';

const task: Api.Task = { id: 1, scheduleId: 2, process: 'CUT', actualQuantity: 0, quantity: 10, orderCount: 0, unit: '片', workDate: '2026-11-12', status: 'OPEN',
  output: { stage: 'CUT', side: 'FRONT', attrs: { length: 192, width: 66, thickness: 0.3, color: 'PU' } },
};
const first: Api.RelatedOrderItem = { orderId: 10, orderNo: 'GC-10', itemId: 100, productCode: 'SKU-A', productName: '双色垫', targetColorMode: 'DUAL', targetLength: 183, targetWidth: 61, targetThickness: 0.6, targetFrontColor: 'PU', targetBackColor: 'GY' };
const second: Api.RelatedOrderItem = { ...first, orderId: 20, orderNo: 'GC-20', itemId: 200, productCode: 'SKU-B', targetLength: 200 };
const options: StockApi.Options = { colors: [{ value: 'PU', label: '紫色' }, { value: 'GY', label: '灰色' }], textures: [{ value: 'AD', label: '安达圆点纹' }, { value: 'BL', label: '波浪纹' }], patterns: [{ value: 'TTXL', label: '体态训练' }], materials: [], stages: [], recipes: [], processes: [], rawMaterials: [] };

describe('workshop order grouping and process focus', () => {
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
  it('shows only finished dimensions for punching and highlights pattern for engraving', () => {
    expect(taskFocus({ ...task, process: 'PUNCH', relatedOrderItems: [first] }, options).map((field) => field.label)).toEqual(['成品规格']);
    expect(taskFocus({ ...task, process: 'ENGRAVE', relatedOrderItems: [{ ...first, targetPattern: 'TTXL' }] }, options)[0]).toEqual({ label: '雕刻图案', value: '体态训练', side: undefined });
  });
});
