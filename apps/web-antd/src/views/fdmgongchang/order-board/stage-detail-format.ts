import type { Stage } from './model';

import type { FactoryOrderBoardApi as Api } from '#/api/fdmgongchang/order-board';

import { num } from '../production-order/shared';
import { TASK_STATUS } from '../shared/schedule';

const quantities = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });

export const stateColors: Record<Stage['state'], string> = {
  done: 'success',
  idle: 'default',
  partial: 'warning',
  reported: 'purple',
  running: 'processing',
  skipped: 'default',
  waiting: 'warning',
};

export function quantityText(value: null | number | string | undefined, unit?: null | string) {
  return [quantities.format(num(value)), unit].filter(Boolean).join(' ');
}

export function taskStatus(task: Api.StepTask) {
  if (task.attained) return { color: 'success', label: '已达标' };
  if (task.status === 'DONE') return { color: 'warning', label: '良品未达标' };
  return TASK_STATUS[task.status];
}
