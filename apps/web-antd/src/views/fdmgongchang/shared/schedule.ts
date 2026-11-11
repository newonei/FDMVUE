import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi } from '#/api/fdmgongchang/stage-stock';

import { attrSummary, makeLabels, normalizeForStage } from '../stage-stock/model';
import { dimensionTextInMm } from './dimensions';

/** 工序名称，和后端 FactoryProcess 一致。 */
export const PROCESS_LABELS: Record<string, string> = {
  CUT: '立切',
  EMBOSS: '压花',
  ENGRAVE: '雕刻',
  FOLD: '折叠',
  LAMINATE: '贴合',
  MIX: '发泡',
  PACK: '包装',
  PUNCH: '冲裁',
  SLICE: '开片',
};

export const SCHEDULE_STATUS: Record<Api.Status, { color: string; label: string }> = {
  CONFIRMED: { color: 'green', label: '已下发' },
  DISCARDED: { color: 'default', label: '已作废' },
  DRAFT: { color: 'blue', label: '待确认' },
  FAILED: { color: 'red', label: '生成失败' },
  GENERATING: { color: 'processing', label: 'AI 生成中' },
};

/** 排单任务：没派人的待领取，抢单或派单后已接单，报工后已报工；管理员可以关闭没报工的任务。 */
export const TASK_STATUS: Record<Api.TaskStatus, { color: string; label: string }> = {
  CLAIMED: { color: 'processing', label: '已接单' },
  CLOSED: { color: 'default', label: '已关闭' },
  DONE: { color: 'success', label: '已报工' },
  OPEN: { color: 'warning', label: '待领取' },
};

export const RISK_TYPES: Record<string, 'error' | 'info' | 'warning'> = {
  HIGH: 'error',
  LOW: 'info',
  MEDIUM: 'warning',
};

export function dateText(value: Api.DateValue | undefined) {
  if (!value) return '';
  if (Array.isArray(value)) {
    const [y, m, d] = value;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

/** 按任务数量的变化换算领料、产出数量；kg 留两位小数，张、片、件向上取整。 */
function scaled(quantity: Api.Decimal | null | undefined, unit: null | string | undefined, ratio: number) {
  if (quantity === null || quantity === undefined || quantity === '') return null;
  const v = Number(quantity) * ratio;
  if (!Number.isFinite(v)) return null;
  return unit === 'kg' ? Math.round(v * 100) / 100 : Math.ceil(v - 1e-9);
}

/** 「板材 132×192×4.5cm 雾霾蓝 13张」；数量算不出来时只写规格。 */
export function materialText(m: Api.Material, ratio = 1) {
  let q = scaled(m.quantity, m.unit, ratio);
  if (ratio === 1 && q !== null) q = Number(m.quantity);
  const name = m.attrs ? taskMaterialText(m) : m.name || m.code || TASK_STAGE_LABELS[m.stage] || m.stage || '待确认物料';
  return q === null ? name : `${name} ${q}${m.unit ?? ''}`;
}

/**
 * 任务的领料、产出两行文字；旧任务没有时为空。
 * 接单时按上道良品改小了数量（plannedQuantity）的，按比例换算显示。
 */
export function taskMaterials(task: {
  inputs?: Api.Material[] | null;
  output?: Api.Material | null;
  plannedQuantity?: Api.Decimal | null;
  quantity: Api.Decimal;
}) {
  if (!task.output && !(task.inputs?.length)) return null;
  const ratio = task.plannedQuantity ? Number(task.quantity) / Number(task.plannedQuantity) : 1;
  return {
    input: (task.inputs ?? []).map((m) => materialText(m, ratio)).join('；'),
    output: task.output ? materialText({ ...task.output, quantity: task.quantity }) : '',
  };
}

/** 领料、产出逐份列出：文字、物料编码、产品档案编码、提示。 */
export interface MaterialRow {
  code?: null | string;
  kind: '产出' | '领料';
  newItem?: boolean | null;
  note?: null | string;
  productCode?: null | string;
  text: string;
}

export function materialRows(task: Parameters<typeof taskMaterials>[0]): MaterialRow[] {
  const ratio = task.plannedQuantity ? Number(task.quantity) / Number(task.plannedQuantity) : 1;
  const row = (kind: MaterialRow['kind'], m: Api.Material, text: string): MaterialRow => ({
    code: m.code,
    kind,
    newItem: m.newItem,
    note: m.note,
    productCode: m.productCode && m.productCode !== m.code ? m.productCode : null,
    text,
  });
  return [
    ...(task.inputs ?? []).map((m) => row('领料', m, materialText(m, ratio))),
    ...(task.output ? [row('产出', task.output, materialText({ ...task.output, quantity: task.quantity }))] : []),
  ];
}

/** 改了任务数量：领料、产出跟着按比例变（贴合、压花之后 1 进 1 出，后端下发时还会再算一遍）。 */
export function rescaleMaterials<T extends Pick<Api.PlanTask, 'inputs' | 'output'>>(task: T, from: Api.Decimal, to: Api.Decimal) {
  const ratio = Number(from) > 0 ? Number(to) / Number(from) : 1;
  return {
    ...task,
    inputs: (task.inputs ?? []).map((m) => ({ ...m, quantity: scaled(m.quantity, m.unit, ratio) })),
    output: task.output ? { ...task.output, quantity: Number(to) } : task.output,
  };
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 「10-11 周六」 */
export function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return `${date.slice(5)} 周${WEEKDAYS[d.getDay()]}`;
}

/** 按日期分组，组内按工序顺序、当天顺序排列。 */
export function groupByDate<T>(items: T[], dateOf: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = dateOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].toSorted(([a], [b]) => a.localeCompare(b));
}

/** 选中的产品：订单成品规格，加上用料逆推带出的板材、已开片板材和还要做多少。 */
export interface StageChoice {
  boardAttrs?: FdmgongchangStageStockApi.ItemAttrs | null;
  boards?: null | number;
  boardSpec?: null | string;
  name: string;
  remaining?: null | number;
  sheets?: null | number;
  sheetAttrs?: FdmgongchangStageStockApi.ItemAttrs | null;
  sheetSpec?: null | string;
  spec: string;
  sourceStagesByProcess?: Record<string, string[]>;
  targetAttrs?: FdmgongchangStageStockApi.ItemAttrs | null;
}

/** 库存阶段代码保持不变，面向现场按实际产物显示。 */
export const TASK_OUTPUT_STAGES: Record<string, string> = {
  CUT: 'CUT', EMBOSS: 'EMBOSSED', ENGRAVE: 'ENGRAVED', FOLD: 'FOLDED',
  LAMINATE: 'LAMINATED', MIX: 'BOARD', PACK: 'PACKED', PUNCH: 'PUNCHED', SLICE: 'SHEET',
};

export const TASK_STAGE_LABELS: Record<string, string> = {
  RAW: '原材料', BOARD: '板材（发泡）', SHEET: '已开片板材', CUT: '片材（立切）',
  LAMINATED: '贴合垫', EMBOSSED: '压花垫', PUNCHED: '冲裁垫', ENGRAVED: '雕刻垫', FOLDED: '折叠垫', PACKED: '已包装成品',
};

/** 单色中间物料不能默认拿双色成品的正面色代替。 */
export function taskOutputAttrs(stage: string, attrs?: FdmgongchangStageStockApi.ItemAttrs | null) {
  const source = { ...attrs };
  if (['BOARD', 'CUT', 'SHEET'].includes(stage)) {
    source.frontColor = null;
    source.backColor = null;
  }
  return normalizeForStage(stage, source);
}

export function taskMaterialText(material?: Api.Material | null, fallback?: null | string) {
  if (!material) return dimensionTextInMm(fallback) || '待确认产出规格';
  const attributes = attrSummary(material.stage, material.attrs, makeLabels(), [], 'mm');
  return attributes
    ? [TASK_STAGE_LABELS[material.stage] ?? material.stage, attributes].join(' · ')
    : dimensionTextInMm(material.name || fallback) || TASK_STAGE_LABELS[material.stage] || material.stage;
}

/** 产出板材、片材的工序。 */
const STAGE_OUTPUT: Record<string, 'board' | 'sheet'> = { MIX: 'board', SLICE: 'board', CUT: 'sheet' };

/**
 * 发泡做板材，开片仍做板材，立切做片材；订单成品只用于说明用途。
 * 规格算不出时留空，让排单员明确填写，不能把成品规格当成中间产物规格。
 */
export function stageTaskPlan(process: null | string | undefined, choice: StageChoice) {
  const kind = process ? STAGE_OUTPUT[process] : undefined;
  if (!kind) {
    return { hint: '', kind, spec: dimensionTextInMm(choice.spec), suggested: positive(choice.remaining) };
  }
  const mixing = process === 'MIX';
  const slicing = process === 'SLICE';
  const spec = dimensionTextInMm(mixing || slicing ? choice.boardSpec : choice.spec);
  const suggested = positive(mixing || slicing ? choice.boards : choice.remaining);
  const remaining = choice.remaining ? `订单还要做 ${choice.remaining} 条成品，` : '';
  let hint: string;
  if (mixing) {
    hint = suggested
      ? `${remaining}按用料逆推要 ${suggested} 张板`
      : '请确认本次发泡板材的尺寸、配方、单一颜色及计划张数';
  } else if (slicing) {
    hint = suggested ? `${remaining}建议安排 ${suggested} 片已开片板材，规格沿用领料板材` : '请选择领料板材，自动沿用其厚度，并确认计划片数';
  } else {
    hint = suggested ? `${remaining}请按实际裁切方案确认 ${suggested} 片的建议数量` : '请确认立切后片材的长、宽、厚、颜色及计划片数';
  }
  return { hint, kind, spec, suggested };
}

function positive(value: null | number | undefined) {
  return value && value > 0 ? value : null;
}
