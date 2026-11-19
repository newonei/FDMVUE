import type { PageResult } from '@vben/request';

import type { FdmgongchangProductionOrderApi as OrderApi } from '../production-order';

import { requestClient } from '#/api/request';

import { factoryHeaders } from '../factory';

export namespace FactoryOrderBoardApi {
  export type StepState =
    | 'COMPLETED'
    | 'IN_PROGRESS'
    | 'NOT_STARTED'
    | 'PARTIAL'
    | 'REPORTED'
    | 'WAITING';

  export interface Step extends OrderApi.Step {
    claimedTaskCount?: number;
    completedOrderCount?: number;
    completedTaskCount?: number;
    pendingTaskCount?: number;
    sharedTaskCount?: number;
    state?: StepState;
    taskCount?: number;
  }

  export interface Item extends OrderApi.Item {
    steps?: Step[];
    warehouseShippedQuantity?: number | string;
  }

  export interface Order extends OrderApi.Order {
    items: Item[];
    ownerName?: null | string;
    ownerUserId?: null | number;
  }

  export interface PageReq extends OrderApi.PageReq {
    ownerUserId?: number;
  }

  export interface Owner {
    name: string;
    userId: number;
  }
}

const base = '/fdmgongchang/order-board';

export function getOrderBoardShortageCount(
  factoryId: null | number,
  signal: AbortSignal,
) {
  return requestClient.get<number>(`${base}/shortage-count`, {
    headers: factoryHeaders(factoryId),
    signal,
    silent: true,
  });
}

export function getOrderBoardPage(params: FactoryOrderBoardApi.PageReq) {
  return requestClient.get<PageResult<FactoryOrderBoardApi.Order>>(
    `${base}/page`,
    {
      headers: factoryHeaders(),
      params,
    },
  );
}

export function getOrderBoardOrder(id: number) {
  return requestClient.get<FactoryOrderBoardApi.Order>(`${base}/get`, {
    headers: factoryHeaders(),
    params: { id },
  });
}

export function getOrderBoardOwners() {
  return requestClient.get<FactoryOrderBoardApi.Owner[]>(`${base}/owners`, {
    headers: factoryHeaders(),
  });
}

export function setOrderBoardOwner(data: {
  orderId: number;
  ownerUserId: null | number;
}) {
  return requestClient.put<boolean>(`${base}/owner`, data, {
    headers: factoryHeaders(),
  });
}
