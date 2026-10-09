import type { DocumentKind } from '../../documents/model';

import type { ProcurementWorkItem } from '#/api/fdmplatform/procurement-workbench';

export const procurementStages = [
  { key: 'all', label: '全部待办', hint: '按交期排序' },
  { key: 'intake', label: '待接单', hint: '外贸提交的申请' },
  { key: 'quote', label: '待报价', hint: '找供应商询价' },
  { key: 'plan', label: '待下单', hint: '有报价，选价下单' },
  { key: 'order', label: '待生成采购单', hint: '方案已确认' },
  { key: 'review', label: '待确认方案', hint: '旧方案待确认' },
  { key: 'arrival', label: '待到货', hint: '' },
  { key: 'production', label: '自产跟进', hint: '' },
] as const;
/**
 * Arrivals and production progress moved to 工序库存, so those stages never fill;
 * 待生成采购单 / 待确认方案 only matter for plans made the old way.
 */
const OPTIONAL_STAGES = new Set(['order', 'review']);
const RETIRED_STAGES = new Set(['arrival', 'production']);
export function visibleStages(counts?: Partial<Record<string, number>>) {
  return procurementStages.filter(
    (item) =>
      !RETIRED_STAGES.has(item.key) &&
      (!OPTIONAL_STAGES.has(item.key) || Number(counts?.[item.key] ?? 0) > 0),
  );
}

export interface WorkbenchAction {
  title: string;
  kind: DocumentKind;
  action?: string;
  /** Flows with their own dialog instead of the generic action form. */
  mode?: 'claim' | 'compare' | 'quote';
  /** A second, less common way to handle the same step. */
  secondary?: { action: string; kind: DocumentKind; title: string };
}

/** Stage selects a shortcut; the existing modal reloads and validates the source. */
export function workbenchAction(entry: ProcurementWorkItem): WorkbenchAction {
  const view = {
    title: entry.stage === 'review' ? '确认方案' : '查看详情',
    kind: entry.kind,
  };
  if (
    entry.row.blockReasons?.length ||
    !['CONFIRMED', 'EXECUTING'].includes(entry.row.contractStatus)
  )
    return view;
  const allowed = entry.row.allowedActions ?? [];
  let launch: WorkbenchAction = view;
  switch (entry.stage) {
    case 'arrival': {
      launch = {
        title: '登记到货',
        kind: 'arrivals',
        action: 'RECORD_ARRIVAL',
      };
      break;
    }
    case 'intake': {
      const assign = {
        title: '分派…',
        kind: 'tasks' as const,
        action: 'ASSIGN_FULFILLMENT',
      };
      launch = allowed.includes('CLAIM_REQUEST')
        ? {
            title: '我来接单',
            kind: 'requests',
            action: 'CLAIM_REQUEST',
            mode: 'claim',
            secondary: allowed.includes(assign.action) ? assign : undefined,
          }
        : { ...assign, title: '分派任务' };
      break;
    }
    case 'order': {
      launch = {
        title: '生成采购单',
        kind: 'orders',
        action: 'GENERATE_ORDERS',
      };
      break;
    }
    case 'plan': {
      if (entry.kind === 'plans')
        launch = { title: '完善并生效', kind: entry.kind };
      else if (entry.kind === 'quotes')
        launch = { title: '选价下单', kind: entry.kind, mode: 'compare' };
      else launch = { title: '编制方案', kind: 'plans', action: 'SAVE_PLAN' };
      break;
    }
    case 'production': {
      launch = {
        title: '登记进度',
        kind: 'production',
        action: 'UPDATE_PRODUCTION',
      };
      break;
    }
    case 'quote': {
      launch =
        entry.kind === 'tasks'
          ? {
              title: '录入报价',
              kind: 'quotes',
              action: 'CREATE_QUOTE',
              mode: 'quote',
            }
          : { title: '核对报价', kind: entry.kind };
      break;
    }
  }
  return launch.action && !allowed.includes(launch.action) ? view : launch;
}
export function procurementStageLabel(stage: string) {
  return procurementStages.find((item) => item.key === stage)?.label ?? stage;
}

export interface DueBadge {
  text: string;
  tone: '' | 'danger' | 'muted' | 'warn';
}
/** Countdown for the expected arrival date; 3 days ahead counts as due soon, as on the server. */
export function dueBadge(dueDate: string | undefined, today: string): DueBadge {
  if (!dueDate) return { text: '未约定', tone: 'muted' };
  const days = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  if (!Number.isFinite(days)) return { text: dueDate, tone: '' };
  if (days < 0) return { text: `超期 ${-days} 天`, tone: 'danger' };
  if (days === 0) return { text: '今天到期', tone: 'warn' };
  if (days <= 3) return { text: `${days} 天后到期`, tone: 'warn' };
  return { text: dueDate, tone: '' };
}

/** The five steps a buyer walks through, for the small main line on each row. */
export const MAINLINE_STEPS = ['接单', '报价', '下单', '到货', '付款'] as const;
export function mainlineStates(stage: string): ('active' | 'done' | 'todo')[] {
  const current =
    {
      intake: 0,
      quote: 1,
      plan: 2,
      review: 2,
      order: 2,
      arrival: 3,
      production: 3,
    }[stage] ?? 0;
  return MAINLINE_STEPS.map((_, index) => {
    if (index < current) return 'done';
    return index === current ? 'active' : 'todo';
  });
}

/** Long multi-product requests show the first product and a count; the full list stays in the tooltip. */
export function shortTitle(title: string) {
  const parts = title.split('、').filter(Boolean);
  return parts.length > 1 ? `${parts[0]} 等 ${parts.length} 项` : title;
}
