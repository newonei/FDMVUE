import type { FocusField } from './order-model';

import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { factoryTodayText } from '../shared/factory-date';
import { dateText, TASK_STAGE_LABELS } from '../shared/schedule';
import { attrSummary, formatQty, makeLabels, sizeText, sumQty, toNumber } from '../stage-stock/model';
import { finishedQuantity, finishedSize, mixPlanLines, taskFocus, taskOrderNos, uniqueTasks, workshopTaskProgress } from './order-model';

export interface WorkshopPlanRow {
  /** 本任务累计良品 / 当前任务计划，1 表示 100%。 */
  achievement: number | undefined;
  colors: FocusField[];
  completed: string;
  customer: string;
  date: string;
  due: string;
  materials: FocusField[];
  notes: string[];
  order: string;
  orderQuantity: string;
  product: string;
  progress: ReturnType<typeof workshopTaskProgress>;
  requirements: FocusField[];
  size: string;
  task: Api.Task;
}

const requirementLabels: Record<string, string[]> = {
  EMBOSS: ['正面纹路', '反面纹路'],
  ENGRAVE: ['雕刻图案'],
  MIX: ['克重'],
  PACK: ['包装要求'],
  SLICE: ['单双色'],
};

function uniqueText(values: Array<null | string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))];
}

function planDate(value: Api.Task['doneAt']) {
  const date = typeof value === 'number' ? factoryTodayText(new Date(value)) : dateText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function planColors(task: Api.Task, items: Api.RelatedOrderItem[], options?: StockApi.Options) {
  const color = makeLabels(options).color;
  const { attrs, side } = task.output ?? {};
  const front = uniqueText(items.map((item) => color(item.targetFrontColor))).join('、');
  const back = uniqueText(items.map((item) => color(item.targetBackColor))).join('、');
  const general = uniqueText(items.map((item) => color(item.color))).join('、');
  const fields: FocusField[] = [];
  const add = (label: string, value: string, face?: FocusField['side']) => {
    if (value) fields.push({ label, value, side: face });
  };
  if (side === 'FRONT') {
    add('正面颜色', color(attrs?.color || attrs?.frontColor) || front || general, 'FRONT');
  } else if (side === 'BACK') {
    add('反面颜色', color(attrs?.color || attrs?.backColor) || back || general, 'BACK');
  } else if (attrs?.color && !attrs.frontColor && !attrs.backColor) {
    add(side === 'BOTH' ? '正反颜色' : '颜色', color(attrs.color));
  } else {
    add('正面颜色', color(attrs?.frontColor) || front, 'FRONT');
    add('反面颜色', color(attrs?.backColor) || back, 'BACK');
    if (fields.length === 0) add('颜色', general);
  }
  return fields;
}

function planRequirements(task: Api.Task, options?: StockApi.Options) {
  const labels = requirementLabels[task.process];
  const fields = (labels ? taskFocus(task, options) : [])
    .filter((field) => labels?.includes(field.label)
      && !['按订单图纸', '未填写'].includes(field.value));
  if (task.process === 'MIX') fields.push(...mixPlanLines(task));
  if (task.process === 'FOLD' && task.output?.foldingType?.trim()) {
    fields.push({ label: '折叠类型', value: task.output.foldingType.trim() });
  }
  return fields;
}

function planMaterials(task: Api.Task, options?: StockApi.Options) {
  const output = task.output;
  const outputSize = sizeText(output?.attrs, 'mm');
  if (task.process === 'MIX') {
    const board = outputSize || output?.name?.trim() || output?.code?.trim();
    return board ? [{ label: '产出版材', value: board }] : [];
  }

  const fields: FocusField[] = [];
  const labels = makeLabels(options);
  for (const material of task.inputs ?? []) {
    const stage = TASK_STAGE_LABELS[material.stage] || material.stage;
    const spec = attrSummary(material.stage, material.attrs, labels, [], 'mm') || material.name || material.code;
    const quantity = toNumber(material.quantity);
    const amount = quantity === undefined ? '' : [formatQty(quantity), material.unit].filter(Boolean).join(' ');
    const value = [amount, spec].filter(Boolean).join(' · ');
    if (value) fields.push({ label: material.stage === 'BOARD' ? '用板' : stage, value });
  }
  if (task.process === 'SLICE' && toNumber(task.sliceBoardYield) !== undefined) {
    fields.push({ label: '预计可开', value: [formatQty(task.sliceBoardYield), task.unit].filter(Boolean).join(' ') });
  }
  if (outputSize) fields.push({ label: '本工序规格', value: outputSize });
  return fields;
}

function planAchievement(task: Api.Task) {
  const planned = toNumber(task.quantity);
  const actual = toNumber(task.actualQuantity);
  if (task.status === 'CLOSED' || planned === undefined || planned <= 0 || actual === undefined) return undefined;
  const good = sumQty([actual, task.supplementGoodQuantity]);
  return good / planned;
}

export function buildWorkshopPlanRows(tasks: Api.Task[], options?: StockApi.Options): WorkshopPlanRow[] {
  return uniqueTasks(tasks).map((task) => {
    const items = task.relatedOrderItems ?? [];
    const orderQuantity = finishedQuantity(items);
    return {
      achievement: planAchievement(task),
      colors: planColors(task, items, options),
      completed: planDate(task.doneAt),
      customer: uniqueText(items.map((item) => item.customerName)).join('、'),
      date: task.undated ? '' : planDate(task.workDate),
      due: uniqueText(items.map((item) => planDate(item.promisedDate) || planDate(item.requiredDate))).toSorted().join('、'),
      materials: planMaterials(task, options),
      notes: uniqueText([task.closedReason, task.shortageNote, task.upstreamNote, task.reason, ...items.map((item) => item.remark)]),
      order: uniqueText(taskOrderNos(task)).join('、') || `备货任务 · 排单 #${task.scheduleId}`,
      orderQuantity: orderQuantity === '未填写' ? '' : orderQuantity,
      product: uniqueText(items.map((item) => item.productName?.trim() || item.productCode)).join('、') || task.product?.trim() || '',
      progress: workshopTaskProgress(task),
      requirements: planRequirements(task, options),
      size: uniqueText(items.map((item) => finishedSize(item)).filter((size) => size !== '未填写')).join('、'),
      task,
    };
  }).toSorted((first, second) => (first.date || '9999').localeCompare(second.date || '9999')
    || (first.task.sequence ?? Number.MAX_SAFE_INTEGER) - (second.task.sequence ?? Number.MAX_SAFE_INTEGER));
}
