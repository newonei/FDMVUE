import type { DocumentKind } from '../../documents/model';

import type { ProcurementWorkItem } from '#/api/fdmplatform/procurement-workbench';

export const procurementStages = [
  { key: 'all', label: '全部待办' },
  { key: 'intake', label: '待接单' },
  { key: 'quote', label: '待报价' },
  { key: 'plan', label: '待编方案' },
  { key: 'order', label: '待下单' },
  { key: 'arrival', label: '待到货' },
  { key: 'production', label: '自产跟进' },
] as const;
export interface WorkbenchAction {
  title: string;
  kind: DocumentKind;
  action?: string;
}

/** Stage selects a shortcut; the existing modal reloads and validates the source. */
export function workbenchAction(entry: ProcurementWorkItem): WorkbenchAction {
  const view = {
    title: entry.stage === 'review' ? '办理方案生效' : '查看详情',
    kind: entry.kind,
  };
  if (
    entry.row.blockReasons?.length ||
    !['CONFIRMED', 'EXECUTING'].includes(entry.row.contractStatus)
  )
    return view;
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
      launch = {
        title: '分派任务',
        kind: 'tasks',
        action: 'ASSIGN_FULFILLMENT',
      };
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
        launch = { title: '比较报价', kind: entry.kind };
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
          ? { title: '录入报价', kind: 'quotes', action: 'CREATE_QUOTE' }
          : { title: '核对报价', kind: entry.kind };
      break;
    }
  }
  return launch.action && !entry.row.allowedActions?.includes(launch.action)
    ? view
    : launch;
}
export function procurementStageLabel(stage: string) {
  return procurementStages.find((item) => item.key === stage)?.label ?? stage;
}
