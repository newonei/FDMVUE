import type { PageResult } from '@vben/request';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWageApi } from '#/api/fdmgongchang/wage';

import { factoryHeaders } from '#/api/fdmgongchang/factory';
import { requestClient } from '#/api/request';

const BASE = '/fdmgongchang/workbench';
const headers = () => ({ headers: factoryHeaders() });

export namespace FdmgongchangWorkbenchApi {
  export type Decimal = number | string;

  export interface Process {
    code: string;
    label: string;
    outputLabel: string;
    outputStage: string;
    outputUnit: string;
    /** 领料来源，第一个是常规上道。 */
    sources: string[];
  }

  export interface Order {
    contractCode?: null | string;
    goodQuantity: Decimal;
    id: number;
    inputQuantity: Decimal;
    inputSummary?: null | string;
    inputUnit: string;
    issuedAt?: null | number | string;
    orderNo: string;
    outputStage: string;
    process: string;
    reportCount?: null | number;
    returnedQuantity?: Decimal | null;
    scheduleTaskId?: null | number;
    sourceStage: string;
  }

  export interface My {
    factoryName: string;
    inProgress: Order[];
    processes: Process[];
    tasks: FdmgongchangScheduleApi.Task[];
    team?: null | string;
    today: FdmgongchangScheduleApi.DateValue;
    todayAmount: Decimal;
    userId: number;
    userName?: null | string;
  }
}

export function getWorkbench() {
  return requestClient.get<FdmgongchangWorkbenchApi.My>(
    `${BASE}/my`,
    headers(),
  );
}

export function getWorkbenchOptions() {
  return requestClient.get<FdmgongchangStageStockApi.Options>(
    `${BASE}/options`,
    headers(),
  );
}

export function getWorkbenchStock(stage: string) {
  return requestClient.get<PageResult<FdmgongchangStageStockApi.Stock>>(
    `${BASE}/stock`,
    { ...headers(), params: { stage } },
  );
}

/** 领料（可同时报数量和计件），操作人固定是自己。 */
export function createWorkbenchOrder(
  data: FdmgongchangStageStockApi.OrderCreateReq,
) {
  return requestClient.post<number>(`${BASE}/order/create`, data, headers());
}

export function getWorkbenchOrder(id: number) {
  return requestClient.get<FdmgongchangStageStockApi.Order>(
    `${BASE}/order/get`,
    { ...headers(), params: { id } },
  );
}

export function reportWorkbenchOrder(
  data: FdmgongchangStageStockApi.OrderReportReq,
) {
  return requestClient.post<boolean>(`${BASE}/order/report`, data, headers());
}

export function returnWorkbenchMaterial(
  data: FdmgongchangStageStockApi.OrderReturnReq,
) {
  return requestClient.post<boolean>(`${BASE}/order/return`, data, headers());
}

export function getWorkbenchMates(process: string) {
  return requestClient.get<FdmgongchangFactoryApi.Operator[]>(`${BASE}/mates`, {
    ...headers(),
    params: { process },
  });
}

export function matchWorkbenchWage(params: {
  length?: FdmgongchangWorkbenchApi.Decimal | null;
  process: string;
  thickness?: FdmgongchangWorkbenchApi.Decimal | null;
  width?: FdmgongchangWorkbenchApi.Decimal | null;
}) {
  return requestClient.get<FdmgongchangWageApi.Match[]>(`${BASE}/wage-match`, {
    ...headers(),
    params,
  });
}
