import type { Decimal, DocumentRow, PageResult } from './index';

import { requestClient } from '#/api/request';

export type ProcurementStage =
  | 'arrival'
  | 'intake'
  | 'order'
  | 'plan'
  | 'production'
  | 'quote'
  | 'review';
export type ProcurementSourceKind =
  | 'orders'
  | 'plans'
  | 'quotes'
  | 'requests'
  | 'tasks';
export interface ProcurementWorkItem {
  key: string;
  stage: ProcurementStage;
  kind: ProcurementSourceKind;
  row: DocumentRow;
  title: string;
  subtitle?: string;
  dueDate?: string;
  quantity?: Decimal;
  unit?: string;
  ownerUserIds: number[];
  hint?: string;
}
export interface ProcurementWorkbenchResult extends PageResult<ProcurementWorkItem> {
  counts: Record<'all' | ProcurementStage, number>;
}
export interface ProcurementWorkbenchQuery {
  stage: 'all' | ProcurementStage;
  keyword?: string;
  mine: boolean;
  contractId?: string;
  pageNo: number;
  pageSize: number;
}
export function getProcurementWorkbench(params: ProcurementWorkbenchQuery) {
  return requestClient.get<ProcurementWorkbenchResult>(
    '/fdmplatform/v1/procurement-workbench/page',
    { params },
  );
}
