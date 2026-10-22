import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

/** 工序名称，和后端 FactoryProcess 一致。 */
export const PROCESS_LABELS: Record<string, string> = {
  CUT: '立切',
  EMBOSS: '压花',
  ENGRAVE: '雕刻',
  FOLD: '折叠',
  LAMINATE: '贴合',
  MIX: '密炼挤出发泡',
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

/** 选中的产品：订单成品规格，加上用料逆推带出的板材、片材和还要做多少。 */
export interface StageChoice {
  boards?: null | number;
  boardSpec?: null | string;
  name: string;
  remaining?: null | number;
  sheets?: null | number;
  sheetSpec?: null | string;
  spec: string;
}

/** 产出板材、片材的工序（不是订单成品）。 */
const STAGE_OUTPUT: Record<string, 'board' | 'sheet'> = { MIX: 'board', SLICE: 'sheet' };

/**
 * 一道工序的任务做什么：密炼做板材、开片做片材，其他工序就是订单成品。
 * spec 是任务规格（算不出板材时写明是给哪个成品做的），suggested 是建议数量，hint 是给排单员看的说明。
 */
export function stageTaskPlan(process: null | string | undefined, choice: StageChoice) {
  const kind = process ? STAGE_OUTPUT[process] : undefined;
  if (!kind) {
    return { hint: '', kind, spec: choice.spec, suggested: positive(choice.remaining) };
  }
  const board = kind === 'board';
  const spec = (board ? choice.boardSpec : choice.sheetSpec) || `${board ? '板材' : '片材'}（成品 ${choice.spec || choice.name}）`;
  const suggested = positive(board ? choice.boards : choice.sheets);
  const remaining = choice.remaining ? `订单还要做 ${choice.remaining} 条成品，` : '';
  let hint: string;
  if (board) {
    hint = suggested
      ? `${remaining}按用料逆推要 ${suggested} 张板`
      : '密炼做的是板材，不是成品；这张单还算不出要几张板（订单规格没有长宽厚或本厂没填出板规格），请按实际填张数';
  } else {
    hint = suggested ? `${remaining}按用料逆推要开 ${suggested} 片` : '开片做的是片材，不是成品；这张单还算不出要开几片，请按实际填片数';
  }
  return { hint, kind, spec, suggested };
}

function positive(value: null | number | undefined) {
  return value && value > 0 ? value : null;
}
