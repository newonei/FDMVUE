import type { Contract } from './index';
import type { ProcurementWorkItem } from './procurement-workbench';

import { requestClient } from '#/api/request';

export type PortalDepartment = 'finance' | 'purchase' | 'stock' | 'trade';
/** Amounts per currency; currencies are never added together. */
export type CurrencyAmounts = Record<string, number | string>;
export interface PortalTodo {
  key: string;
  count: number;
  preview: string;
  contractId?: string;
  recordId?: string;
}
export interface PortalTrend {
  months: string[];
  series: Record<string, (number | string)[]>;
}
export interface PortalPayment {
  type: 'RECEIPT' | 'REQUEST';
  id: string;
  contractId?: string;
  contractCode?: string;
  party?: string;
  name?: string;
  time?: string;
  amount?: number | string;
  currency?: string;
  rmbAmount?: number | string;
}
export interface PortalMovement {
  kind: 'OUTBOUND' | 'RETURN';
  contractId: string;
  contractCode: string;
  product: string;
  unit: string;
  quantity: number | string;
  time: string;
}
export interface PortalSummary {
  department: PortalDepartment;
  generatedAt: string;
  month: string;
  todos: PortalTodo[];
  metrics: Record<string, CurrencyAmounts | number | string>;
  trend: PortalTrend;
  contracts?: Contract[];
  openContracts?: number;
  tasks?: ProcurementWorkItem[];
  taskTotal?: number;
  payments?: PortalPayment[];
  movements?: PortalMovement[];
}

export function getPortalSummary(department: PortalDepartment) {
  return requestClient.get<PortalSummary>(
    `/fdmplatform/v1/portal/${department}`,
  );
}
