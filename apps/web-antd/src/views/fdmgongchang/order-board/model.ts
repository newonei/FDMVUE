import type { FactoryOrderBoardApi as Api } from '#/api/fdmgongchang/order-board';

import { dateText, num } from '../production-order/shared';
import { factoryTodayText } from '../shared/factory-date';

export interface Stage {
  code: string;
  detail: string;
  label: string;
  state: 'done' | 'idle' | 'partial' | 'reported' | 'running' | 'skipped' | 'waiting';
  text: string;
}

const PROCESS_CHAIN = [
  ['MIX', '发泡'], ['SLICE', '开片'], ['CUT', '立切'], ['LAMINATE', '贴合'],
  ['EMBOSS', '压花'], ['PUNCH', '冲裁'], ['ENGRAVE', '雕刻'], ['FOLD', '折叠'], ['PACK', '包装'],
] as const;

function summarizeStep(code: string, label: string, items: Api.Item[]): Stage {
  const steps = items.flatMap((item) => (item.steps ?? []).filter((step) => step.process === code));
  const required = items.some((item) => (item.processes ?? []).includes(code)) || steps.length > 0;
  const detail = steps.map((step) => [
    `${step.label}：${num(step.goodQuantity)}${step.unit || ''}良品`,
    `${step.orderCount}张工序单`,
    step.taskCount ? `${step.completedTaskCount || 0}/${step.taskCount}个任务达标` : '',
    step.sharedTaskCount ? `${step.sharedTaskCount}个合并生产任务，产量不重复分摊` : '',
  ].filter(Boolean).join('，')).join('；');
  if (!required) return { code, label, state: 'skipped', text: '未关联', detail: '当前工艺和任务没有关联此环节；可能使用现有库存。' };
  if (steps.some((step) => step.state === 'IN_PROGRESS' || num(step.inProgressCount) > 0 || num(step.claimedTaskCount) > 0)) {
    return { code, label, detail, state: 'running', text: '生产中' };
  }
  const requiredItems = items.filter((item) => (item.processes ?? []).includes(code) || item.steps?.some((step) => step.process === code));
  const allCompleted = requiredItems.length > 0 && requiredItems.every((item) => item.steps?.some((step) => step.process === code && step.state === 'COMPLETED'));
  if (allCompleted) return { code, label, detail, state: 'done', text: '已达标' };
  if (steps.some((step) => ['COMPLETED', 'PARTIAL', 'REPORTED'].includes(step.state || '') || num(step.goodQuantity) > 0)) {
    const onlyReported = requiredItems.every((item) => item.steps?.some((step) => step.process === code && step.state === 'REPORTED'));
    return { code, label, detail, state: onlyReported ? 'reported' : 'partial', text: onlyReported ? '已报工' : '部分完成' };
  }
  if (steps.some((step) => num(step.taskCount) > 0 || step.state === 'WAITING')) {
    return { code, label, detail, state: 'waiting', text: '待生产' };
  }
  return { code, label, detail: detail || '尚无关联的排单任务或工序单', state: 'idle', text: '未下发' };
}

function deliveryStage(items: Api.Item[], outbound: boolean): Stage {
  const active = items.filter((item) => num(item.quantity) > 0);
  const quantity = (item: Api.Item) => num(outbound ? item.shippedQuantity : item.completedQuantity);
  const all = active.length > 0 && active.every((item) => quantity(item) >= num(item.quantity));
  const any = active.some((item) => quantity(item) > 0);
  let state: Stage['state'] = 'idle';
  let text = outbound ? '待出库' : '待交货';
  if (all) {
    state = 'done';
    text = '全部完成';
  } else if (any) {
    state = 'partial';
    text = '部分完成';
  }
  return {
    code: outbound ? 'OUTBOUND' : 'STOCK_IN',
    label: outbound ? '出库' : '交货 / 入库',
    state,
    text,
    detail: active.map((item) => `${item.productName}：${quantity(item)}/${num(item.quantity)}${item.unit || ''}`).join('；')
      + (outbound ? '。仅统计明确关联本单的有效出库，历史未关联出库不推算归属。' : '。按净交货 / 入库记录统计。'),
  };
}

export function orderStages(order: Api.Order): Stage[] {
  const items = order.items.filter((item) => num(item.quantity) > 0);
  const stages = PROCESS_CHAIN.map(([code, label]) => summarizeStep(code, label, items));
  const known = new Set<string>(PROCESS_CHAIN.map(([code]) => code));
  for (const step of items.flatMap((item) => item.steps ?? [])) {
    if (known.has(step.process)) continue;
    known.add(step.process);
    stages.push(summarizeStep(step.process, step.label, items));
  }
  return [...stages, deliveryStage(items, false), deliveryStage(items, true)];
}

export function currentStage(order: Api.Order) {
  if (order.status === 'SUBMITTED') return '等待工厂接单';
  if (order.status === 'REJECTED') return '需求已退回';
  if (order.status === 'CANCELLED') return '需求已撤回';
  const stages = orderStages(order);
  if (stages.at(-1)?.state === 'done') return '已全部出库';
  const running = stages.filter((stage) => stage.state === 'running');
  if (running.length > 0) return `${running.map((stage) => stage.label).join('、')}生产中`;
  const next = stages.find((stage) => ['idle', 'partial', 'waiting'].includes(stage.state));
  if (order.status === 'COMPLETED') return stages.at(-2)?.state === 'done' ? '生产订单已结束 · 待出库' : '生产订单已结束';
  return next ? `${next.label} · ${next.text}` : '工序已报工，待交货';
}

export function dueHint(order: Api.Order, today = factoryTodayText()) {
  const due = dateText(order.promisedDate) || dateText(order.requiredDate);
  const active = order.items.filter((item) => num(item.quantity) > 0);
  if (!due || !['ACCEPTED', 'SUBMITTED'].includes(order.status) || (active.length > 0 && active.every((item) => num(item.completedQuantity) >= num(item.quantity)))) return '';
  const days = Math.round((Date.parse(`${due}T00:00:00+08:00`) - Date.parse(`${today}T00:00:00+08:00`)) / 86_400_000);
  if (days < 0) return `逾期 ${-days} 天`;
  if (days === 0) return '今天交货';
  return days <= 3 ? `${days} 天后交货` : '';
}
