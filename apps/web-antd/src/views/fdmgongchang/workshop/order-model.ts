import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { dimensionTextInMm } from '../shared/dimensions';
import { formatQty, makeLabels, roundQty, sizeText, sumQty, toNumber } from '../stage-stock/model';
import { relatedProductSearch } from './order-details';

export interface WorkshopOrder {
  key: string;
  orderNo: string;
  customer: string;
  items: Api.RelatedOrderItem[];
  tasks: Array<Api.Task & { progress: WorkshopTaskProgress }>;
  counts: Record<WorkshopTaskProgress['group'], number>;
}

interface WorkshopTaskProgress {
  group: 'closed' | 'completed' | 'handled' | 'pending';
  label: string;
  color?: 'gold' | 'green';
  shortage?: number;
  targetLabel?: string;
}

export function workshopTaskProgress(task: Api.Task): WorkshopTaskProgress {
  if (task.status === 'CLOSED') return { group: 'closed', label: '已关闭' };
  if (task.completedBySupplement) {
    return { group: 'completed', label: '已完成', color: 'green', targetLabel: '良品已补齐' };
  }
  const good = toNumber(task.actualQuantity);
  if (task.status === 'DONE') {
    const label = '报工已结束';
    const planned = toNumber(task.quantity);
    if (planned === undefined || planned <= 0 || good === undefined) {
      return { group: 'pending', label, color: 'gold', targetLabel: '良品数量待核对' };
    }
    if (good >= planned) {
      return { group: 'completed', label, color: 'green', targetLabel: '良品已达计划' };
    }
    return {
      group: task.shortageHandledAt ? 'handled' : 'pending',
      label,
      color: 'gold',
      shortage: roundQty(planned - good - (toNumber(task.supplementGoodQuantity) ?? 0)),
      targetLabel: '良品未达计划',
    };
  }
  if (task.activeOrderId) return { group: 'pending', label: '已领料 · 在做', color: 'gold' };
  const reported = (good ?? 0) + (toNumber(task.defectQuantity) ?? 0) > 0;
  return reported
    ? { group: 'pending', label: '部分报工', color: 'gold', shortage: toNumber(task.shortage) }
    : { group: 'pending', label: '待报工' };
}

export interface FocusField { label: string; value: string; side?: 'BACK' | 'FRONT' }

export const WORKSHOP_OUTPUT: Record<string, string> = {
  MIX: '板材', SLICE: '已开片板材', CUT: '已开片片材', LAMINATE: '已复合片材',
  EMBOSS: '已压花片材', PUNCH: '成品', ENGRAVE: '已雕刻成品', FOLD: '已折叠成品', PACK: '已包装成品',
};

export const WORKSHOP_FOCUS: Record<string, string> = {
  MIX: '克重 · 成品规格 · 成品数量 · 颜色', SLICE: '颜色 · 成品规格 · 成品数量 · 单双色', CUT: '颜色 · 成品规格 · 成品数量',
  LAMINATE: '正反面颜色 · 成品规格 · 成品数量', EMBOSS: '正反花纹 · 正反面颜色',
  PUNCH: '成品规格 · 成品数量 · 颜色', ENGRAVE: '雕刻图案 · 成品规格 · 成品数量 · 颜色',
  FOLD: '成品规格 · 成品数量 · 颜色 · 折叠类型', PACK: '包装要求 · 成品规格 · 成品数量 · 颜色',
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
    const row = { ...task, progress: workshopTaskProgress(task) };
    for (const number of numbers.length > 0 ? numbers : ['']) {
      const key = number || `stock:${task.scheduleId}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, orderNo: number || `备货任务 · 排单 #${task.scheduleId}`, customer: '', items: [], tasks: [],
          counts: { closed: 0, completed: 0, handled: 0, pending: 0 } };
        groups.set(key, group);
      }
      group.tasks.push(row);
      group.counts[row.progress.group]++;
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

/** 订单成品需求按明细去重，再按规格和单位汇总，不能用工序板材/片材数量代替。 */
export function finishedQuantity(items: Api.RelatedOrderItem[]) {
  const groups = new Map<string, { missing: boolean; quantities: number[]; size: string; unit: string; }>();
  const uniqueItems = new Map(items.map((item) => [`${item.orderId}:${item.itemId}`, item]));
  for (const item of uniqueItems.values()) {
    const size = finishedSize(item);
    const unit = item.unit?.trim() || '单位未填写';
    const key = JSON.stringify([size, unit]);
    let group = groups.get(key);
    if (!group) {
      group = { size, unit, quantities: [], missing: false };
      groups.set(key, group);
    }
    const quantity = toNumber(item.quantity);
    if (quantity === undefined) group.missing = true;
    else group.quantities.push(quantity);
  }
  return [...groups.values()].map((group) => {
    const known = group.quantities.length > 0 ? `${formatQty(sumQty(group.quantities))} ${group.unit}` : '';
    let value = known;
    if (group.missing) value = known ? `${known}（另有数量未填写）` : '未填写';
    return groups.size > 1 ? `${group.size}：${value}` : value;
  }).join('；') || '未填写';
}

/** 发泡车间看的整锅密炼要求：几锅、哪个模具、每张入模多少、整锅能出几张；旧任务没有时为空。 */
export function mixPlanLines(task: Api.Task): FocusField[] {
  if (task.process !== 'MIX') return [];
  const plan = task.output?.mixPlan;
  const batches = Number(task.output?.recipeBatches);
  const num = (value: unknown) => String(Number(Number(value).toFixed(3)));
  const lines: FocusField[] = [];
  if (batches > 0) lines.push({ label: '密炼锅数', value: `${num(batches)} 锅${Number(plan?.batchKg) > 0 ? `（每锅 ${num(plan!.batchKg)} kg）` : ''}` });
  if (plan?.mouldName) lines.push({ label: '模具', value: plan.mouldName });
  if (Number(plan?.chargeKg) > 0) lines.push({ label: '每张入模', value: `${num(plan!.chargeKg)} kg` });
  else if (Number(plan?.kgPerBoard) > 0) lines.push({ label: '每张用料', value: `约 ${num(plan!.kgPerBoard)} kg（没有对应模具档案）` });
  if (Number(plan?.wholeBatchBoards) > 0) {
    const surplus = Number(plan!.surplusBoards ?? 0);
    lines.push({ label: '整锅可出', value: `${num(plan!.wholeBatchBoards)} 张${surplus > 0 ? `，多出 ${num(surplus)} 张报工后入库` : ''}` });
  }
  return lines;
}

export function taskColors(task: Api.Task, options?: StockApi.Options): FocusField[] {
  const color = makeLabels(options).color;
  const { attrs, side } = task.output ?? {};
  const items = task.relatedOrderItems ?? [];
  const orderColors = (key: 'color' | 'targetBackColor' | 'targetFrontColor') =>
    [...new Set(items.map((item) => color(item[key]?.trim()).trim()).filter(Boolean))].join('、');
  const fields: FocusField[] = [];
  const add = (label: string, value: string, face?: FocusField['side']) => {
    if (value) fields.push({ label, value, side: face });
  };
  if (side === 'FRONT') {
    add('正面颜色', color(attrs?.color || attrs?.frontColor) || orderColors('targetFrontColor') || orderColors('color'), 'FRONT');
  } else if (side === 'BACK') {
    add('反面颜色', color(attrs?.color || attrs?.backColor) || orderColors('targetBackColor') || orderColors('color'), 'BACK');
  } else if (attrs?.color && !attrs.frontColor && !attrs.backColor) {
    add(side === 'BOTH' ? '正反颜色' : '颜色', color(attrs.color));
  } else {
    add('正面颜色', color(attrs?.frontColor) || orderColors('targetFrontColor'), 'FRONT');
    add('反面颜色', color(attrs?.backColor) || orderColors('targetBackColor'), 'BACK');
    if (fields.length === 0) add('颜色', orderColors('color'));
  }
  return fields;
}

export function taskFocus(task: Api.Task, options?: StockApi.Options): FocusField[] {
  const labels = makeLabels(options);
  const attrs = task.output?.attrs ?? {};
  const items = task.relatedOrderItems ?? [];
  const join = (values: Array<null | string | undefined>) => [...new Set(values.filter((value): value is string => !!value))].join('、') || '未填写';
  const fields: FocusField[] = [];
  const add = (label: string, value: string, side?: FocusField['side']) => fields.push({ label, value, side });
  if (task.process === 'MIX') add('克重', join(items.map((item) => item.weight)));
  if (task.process === 'PACK') add('包装要求', join(items.map((item) => item.packaging)));
  if (task.process === 'EMBOSS') {
    add('正面纹路', labels.texture(attrs.textureFront) || join(items.map((item) => labels.texture(item.targetTextureFront))), 'FRONT');
    add('反面纹路', labels.texture(attrs.textureBack) || join(items.map((item) => labels.texture(item.targetTextureBack))), 'BACK');
  }
  if (task.process === 'ENGRAVE') {
    const patterns = items.map((item) => labels.pattern(item.targetPattern)).filter(Boolean);
    add('雕刻图案', labels.pattern(attrs.pattern) || (patterns.length > 0 ? join(patterns) : '按订单图纸'));
  }
  if (!['EMBOSS'].includes(task.process)) {
    add('成品规格', join(items.map((item) => finishedSize(item))));
    add('成品数量', finishedQuantity(items));
  }
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
  } else if (['ENGRAVE', 'FOLD', 'PACK', 'PUNCH'].includes(task.process)) {
    fields.push(...taskColors(task, options));
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
  return [...fields.values()].map(({ values, ...field }) => {
    let value = [...values].join('、');
    if (field.label === '成品数量') value = finishedQuantity(order.items);
    else if (field.label === '成品规格') value = [...new Set(order.items.map((item) => finishedSize(item)))].join('、') || '未填写';
    return { ...field, value };
  });
}
