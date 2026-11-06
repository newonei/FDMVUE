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
    /** 来源采购明细对应的合同明细；有就从工厂出货登记到合同。 */
    sourceContractItemId?: null | string;
    /** 已出货数量（采购单生成的单从工厂出货）。 */
    shippedQuantity?: number | string;
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
    /** 工厂选的模具档案；空 = 本厂发泡出板规格。 */
    mouldProfileId?: null | number;
    /** 工厂确认的结构化规格（#154）：确认后库存匹配、排单按它比对正反面色、压纹、图案。 */
    targetMaterial?: null | string;
    targetFrontColor?: null | string;
    targetBackColor?: null | string;
    targetLength?: null | number | string;
    targetWidth?: null | number | string;
    targetThickness?: null | number | string;
    targetTextureFront?: null | string;
    targetTextureBack?: null | string;
    targetPattern?: null | string;
    targetConfirmedBy?: null | string;
    targetConfirmedAt?: null | string;
    /** 没确认时从规格文本解析出的建议值。 */
    targetSuggested?: FdmgongchangSupplyMatchApi.TargetReq | null;
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
    sourceType?: 'MANUAL' | 'PURCHASE_ORDER' | 'RESTOCK';
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

  /** 产品中心还没有、提交时新建的规格。 */
  export interface NewProduct {
    category: string;
    color?: string;
    material?: string;
    model?: string;
    name: string;
    packaging?: string;
    printing?: string;
    specification: string;
    unit: string;
  }

  /** AI 识别需求的一行明细。 */
  export interface FillLine {
    candidates: Product[];
    category?: null | string;
    color?: null | string;
    material?: null | string;
    model?: null | string;
    name?: null | string;
    packaging?: null | string;
    printing?: null | string;
    /** 产品中心里对得上的产品；为空是没找到。 */
    product?: null | Product;
    productCode?: null | string;
    quantity?: null | number;
    remark?: null | string;
    specification?: null | string;
    unit?: null | string;
  }

  export interface Fill {
    errorMessage?: null | string;
    files: Array<{
      name: string;
      note?: null | string;
      status: 'PARTIAL' | 'READ' | 'SKIPPED';
    }>;
    id: number;
    result?: null | {
      lines: FillLine[];
      notes: string[];
      purpose?: null | string;
      remark?: null | string;
      requiredDate?: null | string;
    };
    status: 'DONE' | 'FAILED' | 'GENERATING';
  }

  export interface CreateReq {
    factoryId: number;
    items: Array<{
      auxUsages?: AuxUsage[];
      newProduct?: NewProduct;
      /** 产品中心的产品；新规格不填，改填 newProduct。 */
      productId?: string;
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

  /** 交货单（生产入库）：工厂把订单的成品交到仓库，订单完成数量 = 净交货数量。 */
  export interface Delivery {
    /** WAREHOUSE 内部订单交到仓库 / PURCHASE 采购单生成的单生产入库 / FACTORY 早期完工登记，货留在工厂。 */
    kind?: 'FACTORY' | 'PURCHASE' | 'WAREHOUSE';
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
    /** 交到哪个仓库；采购单生成的单一般入本厂仓库。 */
    warehouseId: string;
  }

  /** 采购单生成的单的辅料：采购单要求的辅料建议、每条明细的用量和齐套。 */
  export interface OrderAux {
    accessoryNote?: null | string;
    items: Array<{
      itemId: number;
      process?: null | string;
      processLabel?: null | string;
      productName: string;
      ready: boolean;
      remaining: number | string;
      suggestions: Array<{
        basis?: null | string;
        name: string;
        perUnit: number | string;
        productId?: null | string;
        productName?: null | string;
        remark?: null | string;
        unit?: null | string;
      }>;
      unit?: null | string;
      usages: Array<{
        inbound: number | string;
        need: number | string;
        perUnit: number | string;
        process?: null | string;
        processLabel?: null | string;
        productCode?: null | string;
        productId: string;
        productName?: null | string;
        shortage: number | string;
        stock: number | string;
        unit?: null | string;
      }>;
    }>;
    ready: boolean;
  }

  export interface OrderAuxSaveReq {
    itemId: number;
    names?: Array<{ name: string; productId: string }>;
    usages: AuxUsage[];
  }

  export interface Warehouse {
    /** 所属工厂；工厂的货默认入本厂仓库。 */
    factoryId?: null | number;
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
    /** SETTING 本厂发泡出板规格 / MOULD 模具档案 */
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

/** 采购单生成的单的辅料：建议、用量和齐套。 */
export function getOrderAux(id: number) {
  return requestClient.get<FdmgongchangProductionOrderApi.OrderAux>(
    `${BASE}/aux`,
    {
      headers: factoryHeaders(),
      params: { id },
    },
  );
}

/** 工厂确认辅料用量（整体覆盖），并记住辅料名称对应的产品。 */
export function saveOrderItemAux(
  data: FdmgongchangProductionOrderApi.OrderAuxSaveReq,
) {
  return requestClient.post<boolean>(`${BASE}/item-aux`, data, {
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

/** 交货（生产入库）：从工厂库存扣，交到仓库。 */
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

export namespace FdmgongchangSupplyMatchApi {
  /** 工厂确认的规格；长宽厚单位 cm，压纹、图案空 = 不要。 */
  export interface TargetReq {
    backColor?: null | string;
    frontColor?: null | string;
    itemId?: null | number;
    length?: null | number | string;
    material?: null | string;
    pattern?: null | string;
    textureBack?: null | string;
    textureFront?: null | string;
    thickness?: null | number | string;
    width?: null | number | string;
  }

  export interface DictOption {
    label: string;
    value: string;
  }

  export interface TargetOptions {
    colors: DictOption[];
    materials: DictOption[];
    patterns: DictOption[];
    textures: DictOption[];
  }

  export interface Line {
    /** 任务的计划日期；库存为空。 */
    availableDate?: null | string;
    code: string;
    /** 折成多少件成品。 */
    covers: number | string;
    /** 后面还要做的工序。 */
    nextProcesses: string[];
    perUnit: number;
    /** STOCK 现成库存 / OWN 已锁给这张单的库存 / TASK 已下发任务的预计产出。 */
    source: 'OWN' | 'STOCK' | 'TASK';
    stage: string;
    stageLabel: string;
    unit?: null | string;
    /** 用多少（这一段的单位）。 */
    used: number | string;
  }

  /** 一条明细的库存匹配：现成库存和已排任务能覆盖多少、还要新做多少、每道工序要做多少。 */
  export interface Match {
    covered: number | string;
    itemId: number;
    lines: Line[];
    /** 现成料覆盖不了的成品数：工艺从发泡开始时要新做，否则是缺料。 */
    newProduction: number | string;
    notes: string[];
    /** 不为空时规格不全，不能匹配和排单。 */
    pending?: null | string;
    processes: Array<{
      label: string;
      process: string;
      quantity: number | string;
    }>;
    productName: string;
    remaining: number | string;
    targetConfirmed: boolean;
  }
}

/** 库存匹配：本厂全部已接单订单按交期一起算，返回这张单每条明细的结果。 */
export function getSupplyMatch(id: number) {
  return requestClient.get<FdmgongchangSupplyMatchApi.Match[]>(
    `${BASE}/supply-match`,
    { headers: factoryHeaders(), params: { id } },
  );
}

/** 确认规格用的字典选项。 */
export function getTargetOptions() {
  return requestClient.get<FdmgongchangSupplyMatchApi.TargetOptions>(
    `${BASE}/target-options`,
    { headers: factoryHeaders() },
  );
}

/** 工厂确认明细规格。 */
export function saveItemTarget(data: FdmgongchangSupplyMatchApi.TargetReq) {
  return requestClient.post<boolean>(`${BASE}/item-target`, data, {
    headers: factoryHeaders(),
  });
}

// ========== AI 识别需求 ==========

/** AI 识别需求的默认提示词（工厂设置里改过的优先）。 */
export function getDefaultFillPrompt(factoryId?: number) {
  return requestClient.get<string>(`${BASE}/ai-fill/default-prompt`, {
    params: { factoryId },
  });
}

/** 上传附件、提示词和粘贴的文字交给 AI 识别，返回识别记录编号。 */
export function submitDemandFill(data: {
  factoryId: number;
  files: File[];
  prompt?: string;
  text?: string;
}) {
  const form = new FormData();
  form.append('factoryId', String(data.factoryId));
  if (data.prompt) form.append('prompt', data.prompt);
  if (data.text) form.append('text', data.text);
  for (const file of data.files) form.append('files', file);
  return requestClient.post<number>(`${BASE}/ai-fill`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180_000,
  });
}

export function getDemandFill(id: number) {
  return requestClient.get<FdmgongchangProductionOrderApi.Fill>(
    `${BASE}/ai-fill/get`,
    { params: { id } },
  );
}

/** 产品中心启用中的分类（新规格建档时选）。 */
export function getProductCategories() {
  return requestClient.get<string[]>(`${BASE}/product-categories`);
}
