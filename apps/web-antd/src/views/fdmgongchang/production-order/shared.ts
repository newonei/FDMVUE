import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import dayjs from 'dayjs';

export const ORDER_STATUS: Record<Api.Status, { color: string; label: string }> = {
  ACCEPTED: { color: 'processing', label: '生产中' },
  CANCELLED: { color: 'default', label: '已撤回' },
  COMPLETED: { color: 'green', label: '已完成' },
  REJECTED: { color: 'red', label: '已退回' },
  SUBMITTED: { color: 'orange', label: '待接单' },
};

export function dateText(value: null | number[] | string | undefined) {
  if (!value) return '';
  if (Array.isArray(value)) {
    const [y, m, d] = value;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

export function timeText(value: null | number | string | undefined) {
  return value ? dayjs(value).format('MM-DD HH:mm') : '';
}

export function num(value: null | number | string | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** 规格一行：尺寸 · 材质 · 颜色，没有时用规格原文。 */
export function specText(p: {
  color?: null | string;
  material?: null | string;
  size?: null | string;
  specification?: null | string;
}) {
  const parts = [p.size, p.material, p.color].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : (p.specification ?? '').replaceAll('\n', ' ');
}

export interface RouteDraft {
  routeId?: number;
  steps: string[];
}

/** 按本厂工序的生产链顺序排好，去掉本厂没启用的工序。 */
export function sortSteps(steps: string[], processes: RouteApi.ProcessOption[]) {
  return processes.map((p) => p.code).filter((code) => steps.includes(code));
}

/** 工艺的问题：没选工序，或跳过工序后下一道领不到上一道的产出（以工厂设置的领料来源为准）。 */
export function routeProblem(steps: string[], processes: RouteApi.ProcessOption[]) {
  const picked = processes.filter((p) => steps.includes(p.code));
  if (picked.length === 0) return '请选择要走的工序';
  for (let i = 1; i < picked.length; i++) {
    const prev = picked[i - 1]!;
    const next = picked[i]!;
    if (!next.sources.includes(prev.outputStage)) {
      return `「${next.label}」不能直接领「${prev.outputStageLabel}」，中间还要经过其他工序`;
    }
  }
  return '';
}

/** 选了路线又调整过工序时，名称后面带「已调整」。 */
export function routeLabel(draft: RouteDraft, options?: RouteApi.Options) {
  const route = options?.routes.find((r) => r.id === draft.routeId);
  if (!route) return '自选工序';
  const same = route.steps.length === draft.steps.length && route.steps.every((s) => draft.steps.includes(s));
  return same ? route.name : `${route.name}（已调整）`;
}

/** 订单明细工艺的最后一道工序（交货从它的产出阶段出）；旧单没有工艺，按包装。 */
export function finalProcess(item: Pick<Api.Item, 'processes'>) {
  return item.processes?.at(-1) ?? 'PACK';
}

/** 这道工序在不在订单明细的工艺里；旧单没有工艺，哪道都能关联。 */
export function routeIncludes(item: Pick<Api.Item, 'processes'>, process: string) {
  return (item.processes ?? []).length === 0 || item.processes!.includes(process);
}
