import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

import { factoryHeaders } from '../factory';

export namespace FdmgongchangProductionOrderApi {
  export type Status =
    | 'ACCEPTED'
    | 'CANCELLED'
    | 'COMPLETED'
    | 'REJECTED'
    | 'SUBMITTED';

  export interface Factory {
    code: string;
    deptId: number;
    id: number;
    name: string;
  }

  /** 产品中心的 SKU。 */
  export interface Product {
    category?: null | string;
    code?: null | string;
    color?: null | string;
    displayName?: null | string;
    id: string;
    imageUrl?: null | string;
    material?: null | string;
    name: string;
    packaging?: null | string;
    printing?: null | string;
    size?: null | string;
    specification?: null | string;
    unit?: null | string;
  }

  export interface Item {
    color?: null | string;
    completedQuantity: number | string;
    id: number;
    material?: null | string;
    packaging?: null | string;
    printing?: null | string;
    productCode?: null | string;
    productId: string;
    productName: string;
    quantity: number | string;
    remark?: null | string;
    size?: null | string;
    specification?: null | string;
    unit?: null | string;
  }

  export interface Order {
    completedAt?: null | number | string;
    completedQuantity: number | string;
    createTime?: number | string;
    factoryId: number;
    factoryName?: null | string;
    handledAt?: null | number | string;
    handlerName?: null | string;
    id: number;
    items: Item[];
    orderNo: string;
    promisedDate?: null | number[] | string;
    purpose?: null | string;
    remark?: null | string;
    reply?: null | string;
    requesterDeptName?: null | string;
    requesterName?: null | string;
    requesterUserId: number;
    requiredDate: number[] | string;
    status: Status;
    statusLabel: string;
    totalQuantity: number | string;
  }

  export interface PageReq extends PageParam {
    keyword?: string;
    status?: Status;
  }

  export interface CreateReq {
    factoryId: number;
    items: Array<{ productId: string; quantity: number; remark?: string }>;
    purpose?: string;
    remark?: string;
    requiredDate: string;
  }

  export interface HandleReq {
    id: number;
    promisedDate?: string;
    reply?: string;
  }

  export interface ProgressReq {
    complete?: boolean;
    id: number;
    items: Array<{ completedQuantity: number; itemId: number }>;
  }
}

const BASE = '/fdmgongchang/production-order';

export function getOrderableFactories() {
  return requestClient.get<FdmgongchangProductionOrderApi.Factory[]>(
    `${BASE}/factories`,
  );
}

export function searchOrderProducts(keyword: string) {
  return requestClient.get<FdmgongchangProductionOrderApi.Product[]>(
    `${BASE}/products`,
    {
      params: { keyword },
    },
  );
}

export function createProductionOrder(
  data: FdmgongchangProductionOrderApi.CreateReq,
) {
  return requestClient.post<number>(`${BASE}/create`, data);
}

export function getMyProductionOrders(
  params: FdmgongchangProductionOrderApi.PageReq,
) {
  return requestClient.get<PageResult<FdmgongchangProductionOrderApi.Order>>(
    `${BASE}/my-page`,
    {
      params,
    },
  );
}

export function cancelProductionOrder(id: number) {
  return requestClient.post<boolean>(`${BASE}/cancel`, undefined, {
    params: { id },
  });
}

export function getProductionOrder(id: number) {
  return requestClient.get<FdmgongchangProductionOrderApi.Order>(
    `${BASE}/get`,
    {
      headers: factoryHeaders(),
      params: { id },
    },
  );
}

export function getFactoryProductionOrders(
  params: FdmgongchangProductionOrderApi.PageReq,
) {
  return requestClient.get<PageResult<FdmgongchangProductionOrderApi.Order>>(
    `${BASE}/factory-page`,
    {
      headers: factoryHeaders(),
      params,
    },
  );
}

/** 本厂正在生产的单，开包装工序单时选关联。 */
export function getOpenProductionOrders() {
  return requestClient.get<FdmgongchangProductionOrderApi.Order[]>(
    `${BASE}/open`,
    {
      headers: factoryHeaders(),
    },
  );
}

export function acceptProductionOrder(
  data: FdmgongchangProductionOrderApi.HandleReq,
) {
  return requestClient.post<boolean>(`${BASE}/accept`, data, {
    headers: factoryHeaders(),
  });
}

export function rejectProductionOrder(
  data: FdmgongchangProductionOrderApi.HandleReq,
) {
  return requestClient.post<boolean>(`${BASE}/reject`, data, {
    headers: factoryHeaders(),
  });
}

export function progressProductionOrder(
  data: FdmgongchangProductionOrderApi.ProgressReq,
) {
  return requestClient.post<boolean>(`${BASE}/progress`, data, {
    headers: factoryHeaders(),
  });
}
