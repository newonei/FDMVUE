import type { FdmgongchangStageStockApi } from '#/api/fdmgongchang/stage-stock';

import { requestClient } from '#/api/request';

import { factoryHeaders } from '../factory';

export namespace FdmgongchangDashboardApi {
  type Decimal = number | string;
  type DateValue = number[] | string;

  export type Range = '7d' | '30d' | 'month' | 'today';

  export interface Kpi {
    defect: Decimal;
    defectPrev: Decimal;
    good: Decimal;
    goodPrev: Decimal;
    openOrders: number;
    overdueOrders: number;
    packedGood: Decimal;
    packedGoodPrev: Decimal;
    packedUnit?: string;
    pendingOrders: number;
    pendingRecords: number;
    planRate?: Decimal | null;
    planRatePrev?: Decimal | null;
    planTaskCount: number;
    staleCount: number;
    wageAmount: Decimal;
    wageAmountPrev: Decimal;
    wipCount: number;
  }

  export interface TrendPoint {
    date: DateValue;
    defect: Decimal;
    good: Decimal;
    process: string;
  }

  export interface ProcessStat {
    defect: Decimal;
    good: Decimal;
    goodPrev: Decimal;
    label: string;
    process: string;
    stock: Decimal;
    unit: string;
    wip: number;
  }

  export interface StageStock {
    label: string;
    quantity: Decimal;
    stage: string;
    unit: string;
  }

  export interface OrderProgress {
    completed: Decimal;
    dueDate?: DateValue | null;
    id?: null | number;
    orderNo: string;
    party?: null | string;
    product?: null | string;
    quantity: Decimal;
    status: string;
    statusLabel: string;
    type: 'CONTRACT' | 'FACTORY';
    unit?: null | string;
  }

  export interface Top {
    amount: Decimal;
    name: string;
    records: number;
    team?: null | string;
    userId: number;
  }

  export interface Dashboard {
    from: DateValue;
    generatedAt: number | string;
    kpi: Kpi;
    orders: OrderProgress[];
    people: {
      active: number;
      reported: number;
      top: Top[];
      unassigned: number;
    };
    prevFrom: DateValue;
    prevTo: DateValue;
    processes: ProcessStat[];
    stocks: StageStock[];
    to: DateValue;
    today: FdmgongchangStageStockApi.Today;
    trend: TrendPoint[];
  }
}

export function getFactoryDashboard(range: FdmgongchangDashboardApi.Range) {
  return requestClient.get<FdmgongchangDashboardApi.Dashboard>(
    '/fdmgongchang/dashboard/get',
    {
      headers: factoryHeaders(),
      params: { range },
    },
  );
}
