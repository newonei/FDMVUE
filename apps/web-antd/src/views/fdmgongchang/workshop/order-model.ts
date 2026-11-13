import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { dimensionTextInMm } from '../shared/dimensions';
import { makeLabels, sizeText } from '../stage-stock/model';
import { relatedProductSearch } from './order-details';

export interface WorkshopOrder {
  key: string;
  orderNo: string;
  customer: string;
  items: Api.RelatedOrderItem[];
  tasks: Api.Task[];
}

export interface FocusField { label: string; value: string; side?: 'BACK' | 'FRONT' }

export const WORKSHOP_OUTPUT: Record<string, string> = {
  MIX: '板材', SLICE: '已开片板材', CUT: '已开片片材', LAMINATE: '已复合片材',
  EMBOSS: '已压花片材', PUNCH: '成品', ENGRAVE: '已雕刻成品', FOLD: '已折叠成品',
};

export const WORKSHOP_FOCUS: Record<string, string> = {
  MIX: '克重 · 成品规格 · 颜色', SLICE: '颜色 · 成品规格 · 单双色', CUT: '颜色 · 成品规格',
  LAMINATE: '正反面颜色 · 成品规格', EMBOSS: '正反花纹 · 正反面颜色',
  PUNCH: '成品规格', ENGRAVE: '雕刻图案 · 成品规格', FOLD: '成品规格 · 折叠类型',
};

export function taskOrderNos(task: Api.Task) {
  return [...new Set([
    ...(task.relatedOrderItems ?? []).map((item) => item.orderNo),
    ...(task.relatedOrderNos ?? []),
    ...(!task.relatedOrderNos?.length && !task.relatedOrderItems?.length && task.contractCode ? [task.contractCode] : []),
  ].filter(Boolean))];
}

/** 合并任务可关联多张订单，展示共享任务；草稿、勾选及正式提交始终以任务 ID 去重。 */
export function groupWorkshopOrders(tasks: Api.Task[]): WorkshopOrder[] {
  const groups = new Map<string, WorkshopOrder>();
  for (const task of uniqueTasks(tasks)) {
    const numbers = taskOrderNos(task);
    for (const number of numbers.length > 0 ? numbers : ['']) {
      const key = number || `stock:${task.scheduleId}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, orderNo: number || `备货任务 · 排单 #${task.scheduleId}`, customer: '', items: [], tasks: [] };
        groups.set(key, group);
      }
      group.tasks.push(task);
      for (const item of (task.relatedOrderItems ?? []).filter((entry) => entry.orderNo === number)) {
        if (!group.items.some((entry) => entry.orderId === item.orderId && entry.itemId === item.itemId)) group.items.push(item);
      }
      group.customer = [...new Set(group.items.map((item) => item.customerName).filter(Boolean))].join('、');
    }
  }
  return [...groups.values()];
}

export function uniqueTasks(tasks: Api.Task[]) {
  return [...new Map(tasks.map((task) => [task.id, task])).values()];
}

export function isTaskCompleted(task: Api.Task) { return task.status === 'DONE' || task.status === 'CLOSED'; }

export function orderMatches(order: WorkshopOrder, keyword: string) {
  const value = keyword.trim().toLocaleLowerCase();
  return !value || [order.orderNo, order.customer, ...order.items.flatMap((item) => relatedProductSearch(item)),
    ...order.tasks.flatMap((task) => [task.id, task.product, task.spec, task.workerNames, task.scheduleNo])]
    .some((text) => String(text ?? '').toLocaleLowerCase().includes(value));
}

/** 成品规格来自订单生产参数/快照；绝不使用本工序半成品尺寸顶替。 */
export function finishedSize(item: Api.RelatedOrderItem) {
  if (item.targetLength !== null && item.targetLength !== undefined
    && item.targetWidth !== null && item.targetWidth !== undefined
    && item.targetThickness !== null && item.targetThickness !== undefined) {
    return sizeText({ length: item.targetLength, width: item.targetWidth, thickness: item.targetThickness }, 'mm');
  }
  return dimensionTextInMm(item.size?.trim() || item.specification) || '未填写';
}

export function taskFocus(task: Api.Task, options?: StockApi.Options): FocusField[] {
  const labels = makeLabels(options);
  const attrs = task.output?.attrs ?? {};
  const items = task.relatedOrderItems ?? [];
  const join = (values: Array<null | string | undefined>) => [...new Set(values.filter((value): value is string => !!value))].join('、') || '未填写';
  const fields: FocusField[] = [];
  const add = (label: string, value: string, side?: FocusField['side']) => fields.push({ label, value, side });
  if (task.process === 'MIX') add('克重', join(items.map((item) => item.weight)));
  if (task.process === 'EMBOSS') {
    add('正面纹路', labels.texture(attrs.textureFront) || join(items.map((item) => labels.texture(item.targetTextureFront))), 'FRONT');
    add('反面纹路', labels.texture(attrs.textureBack) || join(items.map((item) => labels.texture(item.targetTextureBack))), 'BACK');
  }
  if (task.process === 'ENGRAVE') add('雕刻图案', labels.pattern(attrs.pattern) || join(items.map((item) => labels.pattern(item.targetPattern))));
  if (!['EMBOSS'].includes(task.process)) add('成品规格', join(items.map((item) => finishedSize(item))));
  if (['CUT', 'EMBOSS', 'LAMINATE', 'MIX', 'SLICE'].includes(task.process)) {
    if (['EMBOSS', 'LAMINATE'].includes(task.process)) {
      add('正面颜色', labels.color(attrs.frontColor || attrs.color) || join(items.map((item) => labels.color(item.targetFrontColor))), 'FRONT');
      add('反面颜色', labels.color(attrs.backColor || attrs.color) || join(items.map((item) => labels.color(item.targetBackColor))), 'BACK');
    } else {
      const side = task.output?.side;
      const sideLabel = { FRONT: '正面颜色', BACK: '反面颜色', BOTH: '颜色' };
      add(sideLabel[side ?? 'BOTH'],
        labels.color(attrs.color) || join(items.map((item) => item.color)), side === 'FRONT' || side === 'BACK' ? side : undefined);
    }
  }
  if (task.process === 'SLICE') add('单双色', join(items.map((item) => ({ DUAL: '双色', SINGLE: '单色' } as Record<string, string>)[item.targetColorMode ?? ''])));
  return fields;
}

export function orderFocus(order: WorkshopOrder, options?: StockApi.Options) {
  const fields = new Map<string, FocusField & { values: Set<string> }>();
  for (const task of order.tasks) {
    const scoped = { ...task, relatedOrderItems: order.items.filter((item) => task.relatedOrderItems?.some((entry) => entry.itemId === item.itemId && entry.orderId === item.orderId)) };
    for (const field of taskFocus(scoped, options)) {
      const current = fields.get(field.label);
      if (current) current.values.add(field.value);
      else fields.set(field.label, { ...field, values: new Set([field.value]) });
    }
  }
  return [...fields.values()].map(({ values, ...field }) => ({ ...field, value: [...values].join('、') }));
}
