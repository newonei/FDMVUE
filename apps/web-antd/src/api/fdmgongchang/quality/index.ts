import { requestClient } from '#/api/request';

import { factoryHeaders } from '../factory';

const BASE = '/fdmgongchang/quality';

export namespace FdmgongchangQualityApi {
  export type HoldStatus = 'HELD' | 'RELEASED' | 'SCRAPPED';

  /** 质量冻结：某张工序单某行产出冻结的数量。冻结中的不参与库存匹配。 */
  export interface Hold {
    contractCode?: null | string;
    heldAt?: null | number | string;
    heldBy?: null | string;
    id: number;
    itemCode?: null | string;
    itemId: number;
    outputId: number;
    process?: null | string;
    processOrderId: number;
    processOrderNo?: null | string;
    quantity: number | string;
    reason: string;
    resolveNote?: null | string;
    resolvedAt?: null | number | string;
    resolvedBy?: null | string;
    scrappedQuantity?: null | number | string;
    stage: string;
    status: HoldStatus;
  }

  export interface TraceOrder {
    contractCode?: null | string;
    /** 第几层下游，1 是直接领了冻结物料的。 */
    depth: number;
    goodQuantity?: null | number | string;
    id: number;
    issuedAt?: null | number | string;
    operatorName?: null | string;
    orderNo: string;
    process?: null | string;
    processLabel?: null | string;
    status?: null | string;
    usedQuantity?: null | number | string;
  }

  export interface TraceDelivery {
    deliveredDate?: null | number[] | string;
    deliveryNo: string;
    id: number;
    orderNo?: null | string;
    productName?: null | string;
    quantity?: null | number | string;
    unit?: null | string;
    warehouseName?: null | string;
  }

  export interface Trace {
    deliveries: TraceDelivery[];
    orders: TraceOrder[];
    truncated?: boolean | null;
  }

  export type ExceptionType =
    | 'DUE_RISK'
    | 'MANUAL'
    | 'NEGATIVE_STOCK'
    | 'QUALITY_HOLD'
    | 'SHORTAGE'
    | 'SOURCE_CHANGED';

  /** 异常台账一行。看过不等于关闭，关闭要写处理结果。 */
  export interface Exception {
    closedAt?: null | number | string;
    closedBy?: null | string;
    createTime?: null | number | string;
    detail?: null | string;
    id: number;
    objectNo?: null | string;
    orderNo?: null | string;
    resolution?: null | string;
    risk: 'HIGH' | 'LOW';
    status: 'CLOSED' | 'OPEN';
    title: string;
    type: ExceptionType;
    typeLabel?: null | string;
    viewedAt?: null | number | string;
    viewedBy?: null | string;
  }
}

export function getHolds(params: { processOrderId?: number; status?: string }) {
  return requestClient.get<FdmgongchangQualityApi.Hold[]>(`${BASE}/hold/list`, {
    headers: factoryHeaders(),
    params: {
      processOrderId: params.processOrderId,
      status: params.status || undefined,
    },
  });
}

export function createHold(data: {
  outputId: number;
  quantity: number;
  reason: string;
}) {
  return requestClient.post<number>(`${BASE}/hold`, data, {
    headers: factoryHeaders(),
  });
}

export function releaseHold(data: { id: number; note?: string }) {
  return requestClient.put<boolean>(`${BASE}/hold/release`, data, {
    headers: factoryHeaders(),
  });
}

export function scrapHold(data: {
  id: number;
  note?: string;
  quantity?: number;
}) {
  return requestClient.put<boolean>(`${BASE}/hold/scrap`, data, {
    headers: factoryHeaders(),
  });
}

export function getHoldTrace(id: number) {
  return requestClient.get<FdmgongchangQualityApi.Trace>(`${BASE}/hold/trace`, {
    headers: factoryHeaders(),
    params: { id },
  });
}

export function getExceptions(params: { status?: string; type?: string }) {
  return requestClient.get<FdmgongchangQualityApi.Exception[]>(
    `${BASE}/exception/list`,
    {
      headers: factoryHeaders(),
      params: {
        status: params.status || undefined,
        type: params.type || undefined,
      },
    },
  );
}

export function viewException(id: number) {
  return requestClient.put<boolean>(`${BASE}/exception/view`, undefined, {
    headers: factoryHeaders(),
    params: { id },
  });
}

export function closeException(data: { id: number; resolution: string }) {
  return requestClient.put<boolean>(`${BASE}/exception/close`, data, {
    headers: factoryHeaders(),
  });
}

export function createException(data: {
  detail?: string;
  high?: boolean;
  orderNo?: string;
  title: string;
}) {
  return requestClient.post<number>(`${BASE}/exception`, data, {
    headers: factoryHeaders(),
  });
}
