import type { PageParam, PageResult } from '@vben/request';

import type { FdmgongchangRouteApi } from '../factory';

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
    /** 要走的工序编码，按生产链顺序；旧单为空。 */
    processes?: string[];
    routeId?: null | number;
    /** 路线名称快照；调整过工序时带「已调整」。 */
    routeName?: null | string;
    size?: null | string;
    specification?: null | string;
    /** 每道工序的进度（不含作废的工序单）。 */
    steps?: Step[];
    /** 交货从哪个库存阶段出：工艺最后一道的产出阶段，旧单为已包装成品。 */
    deliveryStage?: string;
    deliveryStageLabel?: string;
    /** 交货阶段的库存单位，交货时按 1:1 计入订单单位。 */
    deliveryUnit?: string;
    unit?: null | string;
  }

  export interface Step {
    /** 附加工序（不改变规格）。 */
    custom?: boolean;
    defectQuantity: number | string;
    goodQuantity: number | string;
    inProgressCount: number;
    label: string;
    orderCount: number;
    outputStage: string;
    /** 订单工艺里的工序；旧单关联过的工序为 false。 */
    planned: boolean;
    process: string;
    unit: string;
  }

  /** 这个产品上次向这家工厂下单用的工艺。 */
  export interface LastRoute {
    orderNo: string;
    routeId?: null | number;
    routeName?: null | string;
    steps: string[];
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
    /** 交货单（含作废的），新的在前。 */
    deliveries?: Delivery[];
  }

  export interface PageReq extends PageParam {
    keyword?: string;
    status?: Status;
  }

  export interface CreateReq {
    factoryId: number;
    items: Array<{
      productId: string;
      quantity: number;
      remark?: string;
      routeId?: number;
      /** 这个产品要走的工序编码。 */
      steps: string[];
    }>;
    purpose?: string;
    remark?: string;
    requiredDate: string;
  }

  export interface HandleReq {
    id: number;
    promisedDate?: string;
    reply?: string;
  }

  /** 交货单：工厂把内部订单的成品交到采购仓库，订单完成数量 = 净交货数量。 */
  export interface Delivery {
    createTime?: number | string;
    deliveredDate: number[] | string;
    deliveryNo: string;
    id: number;
    lines: Array<{
      batchNo: string;
      itemCode: string;
      location?: string;
      quantity: number | string;
      stage: string;
      stockId: number;
    }>;
    operatorName?: null | string;
    productName?: null | string;
    productionOrderItemId: number;
    quantity: number | string;
    remark?: null | string;
    status: 'DELIVERED' | 'VOIDED';
    /** 采购仓库的生产入库单号。 */
    stockInCode?: null | string;
    unit?: null | string;
    voidReason?: null | string;
    warehouseName?: null | string;
  }

  export interface DeliveryReq {
    deliveredDate?: string;
    lines: Array<{ quantity: number; stockId: number }>;
    productionOrderItemId: number;
    remark?: string;
    warehouseId: string;
  }

  export interface Warehouse {
    id: string;
    isDefault: boolean;
    name: string;
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

/** 下单选工艺：这家工厂启用的工序和工艺路线。 */
export function getRouteOptions(factoryId: number) {
  return requestClient.get<FdmgongchangRouteApi.Options>(
    `${BASE}/route-options`,
    { params: { factoryId } },
  );
}

/** 这个产品上次向这家工厂下单用的工艺，没有时为空。 */
export function getLastRoute(factoryId: number, productId: string) {
  return requestClient.get<FdmgongchangProductionOrderApi.LastRoute | null>(
    `${BASE}/last-route`,
    { params: { factoryId, productId } },
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

/** 结束这张单（完成数量按交货单自动累加，没交够也可以结束）。 */
export function completeProductionOrder(id: number) {
  return requestClient.post<boolean>(`${BASE}/complete`, undefined, {
    headers: factoryHeaders(),
    params: { id },
  });
}

/** 交货可选的采购仓库，默认仓库在前。 */
export function getDeliveryWarehouses() {
  return requestClient.get<FdmgongchangProductionOrderApi.Warehouse[]>(
    `${BASE}/delivery/warehouses`,
    { headers: factoryHeaders() },
  );
}

/** 交货：从工厂库存扣，交到采购仓库（生产入库）。 */
export function createDelivery(
  data: FdmgongchangProductionOrderApi.DeliveryReq,
) {
  return requestClient.post<number>(`${BASE}/delivery/create`, data, {
    headers: factoryHeaders(),
  });
}

/** 作废交货单：采购仓库扣回、工厂库存退回、扣回完成数量。 */
export function voidDelivery(data: { id: number; reason: string }) {
  return requestClient.post<boolean>(`${BASE}/delivery/void`, data, {
    headers: factoryHeaders(),
  });
}
