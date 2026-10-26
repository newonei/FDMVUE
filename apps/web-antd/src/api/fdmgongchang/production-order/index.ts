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
    auxUsages?: AuxUsage[];
    /** 来源采购单的明细行（采购单生成的单才有）。 */
    sourceLineId?: null | string;
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
    /** 工厂选的配方（用料逆推）。 */
    recipeCode?: null | string;
    /** 工厂选的模具档案；空 = 本厂密炼出板规格。 */
    mouldProfileId?: null | number;
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

  /** 辅料用量：每做一件成品要用多少这种辅料，在哪道工序领。 */
  export interface AuxUsage {
    perUnit: number | string;
    process?: null | string;
    productCode?: null | string;
    productId: string;
    productName?: null | string;
    unit?: null | string;
  }

  /** 这个产品上次向这家工厂下单用的工艺。 */
  export interface LastRoute {
    auxUsages?: AuxUsage[];
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
    /** 希望交货日期；采购单没填交期时为空。 */
    requiredDate?: null | number[] | string;
    /** MANUAL 内部下单 / PURCHASE_ORDER 供应商是本厂的采购单自动生成。 */
    sourceType?: 'MANUAL' | 'PURCHASE_ORDER';
    sourceOrderId?: null | string;
    sourceOrderCode?: null | string;
    sourceContractId?: null | string;
    sourceContractCode?: null | string;
    customerName?: null | string;
    /** 接单后采购单改了数量、交期或取消了，等工厂确认。 */
    sourceChanged?: boolean | null;
    sourceChangeNote?: null | string;
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
      auxUsages?: AuxUsage[];
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
    /** 采购单生成的单接单时，每条明细的工艺（工厂定）。 */
    routes?: RouteReq[];
  }

  export interface RouteReq {
    itemId: number;
    routeId?: number;
    steps: string[];
  }

  /** 采购单生成的单的生产要求：采购单本身和下单资料（实时读采购单）。 */
  export interface PurchaseSheet {
    details: {
      accessories?: Array<{
        checked?: boolean;
        name: string;
        remark?: null | string;
      }>;
      accessoryNote?: null | string;
      deliveryAddress?: null | string;
      deliveryDate?: null | string;
      lineExtras?: Record<
        string,
        {
          customerColor?: string;
          imageId?: string;
          model?: string;
          packQty?: number;
          weight?: string;
        }
      >;
      lineNotes?: Record<string, { gift?: boolean; remark?: null | string }>;
      packagingSteps?: Array<{
        imageIds?: string[];
        text?: null | string;
        title: string;
      }>;
      purchaseDate?: null | string;
      revision?: number;
      sharedColumns?: Array<{
        imageIds?: string[];
        text?: null | string;
        title: string;
      }>;
      status?: 'CONFIRMED' | 'DRAFT';
      subject?: null | string;
    };
    order: {
      code: string;
      contractCode?: null | string;
      customerName?: null | string;
      id: string;
      lines: Array<{
        cancelledQuantity?: number | string;
        color?: null | string;
        id: string;
        material?: null | string;
        packaging?: null | string;
        printing?: null | string;
        quantity: number | string;
        size?: null | string;
        skuCode?: null | string;
        skuName?: null | string;
        specification?: null | string;
        unit?: null | string;
      }>;
      status?: null | string;
      supplierName?: null | string;
    };
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

/** 用料逆推：按订单规格倒推板材规格、张数、原料 kg。 */
export namespace FdmgongchangMaterialPlanApi {
  export interface Board {
    boards: number;
    /** 每张板要多少原料 kg；没选配方或档案没填投料量时为空。 */
    kg?: null | number | string;
    kgPerBoard?: null | number | string;
    layers: number;
    mouldProfileId?: null | number;
    name: string;
    perBoard: number;
    piecesPerLayer: number;
    size: string;
    /** SETTING 本厂密炼出板规格 / MOULD 模具档案 */
    source: 'MOULD' | 'SETTING';
    utilization?: null | number | string;
  }

  export interface RawLine {
    available: number | string;
    rawMaterialCode: string;
    rawMaterialName?: null | string;
    required: number | string;
    shortage: number | string;
  }

  export interface StockCover {
    itemCode: string;
    perUnit: number;
    pieces: number | string;
    quantity: number | string;
    stage: string;
    stageLabel: string;
    unit?: null | string;
  }

  export interface ItemPlan {
    batches?: null | number | string;
    batchKg?: null | number | string;
    board?: Board | null;
    candidates: Board[];
    itemId: number;
    mouldProfileId?: null | number;
    productName: string;
    productType?: null | string;
    quantity: number | string;
    raws: RawLine[];
    rawKg?: null | number | string;
    recipeCode?: null | string;
    recipeName?: null | string;
    /** 配方是按这个产品上次用的建议的，还没选过。 */
    recipeSuggested?: boolean | null;
    remaining: number | string;
    stock: StockCover[];
    stockPieces?: null | number | string;
    targetSize?: null | string;
    unit?: null | string;
    warnings: string[];
  }

  export interface Plan {
    items: ItemPlan[];
    orderId: number;
    orderNo: string;
    shortage: boolean;
    totals: RawLine[];
  }

  export interface RecipeOption {
    density?: null | string;
    productType?: null | string;
    recipeCode: string;
    recipeName: string;
    yieldRate?: null | number | string;
  }

  export interface ItemMaterialReq {
    itemId: number;
    mouldProfileId?: null | number;
    recipeCode?: null | string;
  }
}

const BASE = '/fdmgongchang/production-order';

export function getOrderableFactories() {
  return requestClient.get<FdmgongchangProductionOrderApi.Factory[]>(
    `${BASE}/factories`,
  );
}

/** 搜辅料（产品中心分类含「辅料」「纸箱」），定辅料用量用。 */
export function searchAuxProducts(keyword: string) {
  return requestClient.get<FdmgongchangProductionOrderApi.Product[]>(
    `${BASE}/aux-products`,
    { params: { keyword } },
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

/** 工厂给采购单生成的订单明细定工艺（开过工序单后不能再改）。 */
export function saveItemRoute(data: FdmgongchangProductionOrderApi.RouteReq) {
  return requestClient.post<boolean>(`${BASE}/item-route`, data, {
    headers: factoryHeaders(),
  });
}

/** 确认采购单的变更，去掉「有变更」标记。 */
export function confirmProductionOrderChange(id: number) {
  return requestClient.post<boolean>(`${BASE}/confirm-change`, undefined, {
    headers: factoryHeaders(),
    params: { id },
  });
}

/** 采购单生成的单的生产要求（采购单下单资料）。 */
export function getPurchaseSheet(id: number) {
  return requestClient.get<FdmgongchangProductionOrderApi.PurchaseSheet>(
    `${BASE}/purchase-sheet`,
    { headers: factoryHeaders(), params: { id } },
  );
}

/** 下单资料里的配图。 */
export function getPurchaseImage(id: number, imageId: string) {
  return requestClient.download<Blob>(`${BASE}/purchase-image`, {
    headers: factoryHeaders(),
    params: { id, imageId },
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

/** 用料逆推：每条明细用什么板材、几张、多少原料，以及整张单的原料合计。 */
export function getMaterialPlan(id: number) {
  return requestClient.get<FdmgongchangMaterialPlanApi.Plan>(
    `${BASE}/material-plan`,
    { headers: factoryHeaders(), params: { id } },
  );
}

/** 用料逆推可选的配方（启用的）。 */
export function getRecipeOptions() {
  return requestClient.get<FdmgongchangMaterialPlanApi.RecipeOption[]>(
    `${BASE}/recipe-options`,
    { headers: factoryHeaders() },
  );
}

/** 给明细选配方和板材规格。 */
export function saveItemMaterial(
  data: FdmgongchangMaterialPlanApi.ItemMaterialReq,
) {
  return requestClient.post<boolean>(`${BASE}/item-material`, data, {
    headers: factoryHeaders(),
  });
}
