import type { PageParam, PageResult } from '@vben/request';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';

import { factoryHeaders } from '#/api/fdmgongchang/factory';
import { requestClient } from '#/api/request';

const BASE = '/fdmgongchang/stage-stock';

export namespace FdmgongchangStageStockApi {
  export type Decimal = number | string;
  export type LaminationSide = 'BACK' | 'FRONT';
  export type ReceiveType = 'OPENING' | 'RAW_RECEIPT';
  export type MaterialKind = 'AUX' | 'RAW';

  /** 物料属性：每个库存阶段只用到其中一部分。 */
  export interface ItemAttrs {
    backColor?: null | string;
    color?: null | string;
    /** 辅料：客户定制辅料所属合同；为空是通用辅料。 */
    contractCode?: null | string;
    contractId?: null | string;
    /** 辅料：产品中心的产品，单位跟产品走。 */
    productCode?: null | string;
    productId?: null | string;
    productName?: null | string;
    unit?: null | string;
    frontColor?: null | string;
    length?: Decimal | null;
    material?: null | string;
    pattern?: null | string;
    rawCategory?: null | string;
    rawMaterialCode?: null | string;
    rawMaterialName?: null | string;
    recipeCode?: null | string;
    recipeName?: null | string;
    textureBack?: null | string;
    textureFront?: null | string;
    thickness?: Decimal | null;
    width?: Decimal | null;
  }

  export interface StageOption {
    code: string;
    codePrefix?: null | string;
    defaultLocation: string;
    label: string;
    unit: string;
  }

  export interface ProcessOption {
    allowedSources: string[];
    code: string;
    label: string;
    outputStage: string;
    sources: string[];
  }

  export interface DictOption {
    label: string;
    value: string;
  }

  export interface RecipeOption {
    code: string;
    enabled: boolean;
    name: string;
  }

  export interface RawMaterialOption {
    category: string;
    code: string;
    enabled: boolean;
    name: string;
  }

  /** 附加工序：工厂自定义、不改变规格；从 stage 领、良品留在 stage。含停用的，用来显示旧单名称。 */
  export interface ExtraProcessOption {
    code: string;
    enabled: boolean;
    label: string;
    stage: string;
  }

  export interface ExtraOrderReq {
    lines: Array<{
      defectQuantity?: Decimal;
      quantity: Decimal;
      stockId: number;
    }>;
    operatorUserId?: number;
    pieceworks?: Piecework[];
    process: string;
    productionOrderItemId?: number;
    remark?: string;
  }

  export interface Options {
    colors: DictOption[];
    extraProcesses?: ExtraProcessOption[];
    materials: DictOption[];
    patterns: DictOption[];
    processes: ProcessOption[];
    rawMaterials: RawMaterialOption[];
    recipes: RecipeOption[];
    stages: StageOption[];
    textures: DictOption[];
  }

  export interface Summary {
    processes: Array<{
      inProgressCount: number;
      inProgressQuantity: Decimal;
      process: string;
    }>;
    stages: Array<{ quantity: Decimal; rowCount: number; stage: string }>;
  }

  /** 今日生产概览。 */
  export interface Today {
    defectTotal: Decimal;
    goodTotal: Decimal;
    lanes: Array<{
      defect: Decimal;
      done: Decimal;
      label: string;
      outputLabel: string;
      people: string[];
      plan: Decimal;
      process: string;
      stock: Decimal;
      unit: string;
      wip: number;
    }>;
    pendingRecords: number;
    shortages: Array<{
      available: Decimal;
      label: string;
      planned: Decimal;
      process: string;
      sourceLabel: string;
      unit: string;
    }>;
    staleOrders: Array<{
      id: number;
      inputQuantity: Decimal;
      issuedAt?: null | number | string;
      operatorName?: null | string;
      orderNo: string;
      process: string;
      unit: string;
    }>;
    startedTaskCount: number;
    taskCount: number;
    today: DateValue;
    unassignedWorkers: number;
    wipCount: number;
  }

  export interface Stock {
    batchNo: string;
    /** 库存中心跨厂查询时带上工厂 */
    factoryId?: number;
    factoryName?: null | string;
    id: number;
    item?: ItemAttrs | null;
    itemCode: string;
    itemId: number;
    location: string;
    quantity: Decimal;
    stage: string;
    updateTime?: number | string;
  }

  /** 库存中心：各工厂工序库存，工厂、阶段不填为全部 */
  export interface CenterStockPageReq extends PageParam {
    factoryId?: number;
    keyword?: string;
    stage?: string;
  }

  export interface StockPageReq extends PageParam {
    keyword?: string;
    showZero?: boolean;
    stage: string;
  }

  export interface ReceiveReq {
    attrs: ItemAttrs;
    batchNo: string;
    location?: string;
    quantity: Decimal;
    remark?: string;
    stage: string;
    type: ReceiveType;
  }

  export interface StocktakeReq {
    actualQuantity: Decimal;
    expectedQuantity: Decimal;
    remark?: string;
    stockId: number;
  }

  export interface Txn {
    balanceAfter: Decimal;
    batchNo: string;
    docId?: null | number;
    docNo: string;
    docType: string;
    id: number;
    itemCode: string;
    location: string;
    occurredAt: number | string;
    operatorName?: null | string;
    quantity: Decimal;
    remark?: null | string;
    stage: string;
    stockId: number;
    txnType: string;
  }

  export interface TxnPageReq extends PageParam {
    itemCode?: string;
    keyword?: string;
    stage?: string;
    txnType?: string;
  }

  export interface OrderInput {
    laminationSide?: LaminationSide;
    quantity: Decimal;
    stockId: number;
  }

  export interface OrderOutput {
    attrs: ItemAttrs;
    batchNo?: string;
    defectQuantity?: Decimal | null;
    goodQuantity?: Decimal | null;
    location?: string;
  }

  /** 报产出时的计件：谁、按哪个计价项目、算多少。 */
  export interface Piecework {
    itemId: number;
    quantity: Decimal;
    userId: number;
  }

  export interface OrderCreateReq {
    contractCode?: string;
    finish: boolean;
    inputs: OrderInput[];
    /** 同时领的辅料（辅料库存行），不计入工序领料数量。 */
    auxInputs?: OrderInput[];
    /** 操作人（系统用户），需具备该工序岗位；不填为当前登录人。班组从人员岗位带出。 */
    operatorUserId?: number;
    outputs: OrderOutput[];
    pieceworks?: Piecework[];
    process: string;
    /** 密炼按配方领料：配方编码与锅数（一锅 = 配方明细的一批用量）。 */
    recipeBatches?: Decimal;
    recipeCode?: string;
    remark?: string;
    /** 关联的生产订单明细（选填）；包装报产出时良品累加到它的完成数量。 */
    productionOrderItemId?: number;
    /** 关联的排单任务（选填）。 */
    scheduleTaskId?: number;
    sourceStage: string;
  }

  export interface OrderCompleteReq {
    id: number;
    outputs: OrderOutput[];
  }

  /** 在制工序单报产出：finish=false 只登记这一批，单子继续在制。 */
  export interface OrderReportReq {
    finish: boolean;
    id: number;
    outputs: OrderOutput[];
    pieceworks?: Piecework[];
  }

  /** 在制工序单补领：领少了，从同一段库存再领，一次可以补多种。 */
  export interface OrderSupplementReq {
    /** 补领的辅料；可以只补辅料。 */
    auxInputs?: OrderInput[];
    id: number;
    inputs: OrderInput[];
    remark?: string;
  }

  /** 按配方算密炼领料：每种原料应领、已领、还要领，建议从哪几行库存领（先进先出）。 */
  export interface RecipePlanLine {
    available: Decimal;
    issued: Decimal;
    /** 一锅用量 kg；不在配方里另外领的料为空。 */
    perBatch?: Decimal | null;
    picks: Array<{
      available: Decimal;
      batchNo: string;
      itemCode: string;
      location: string;
      quantity: Decimal;
      stockId: number;
    }>;
    rawCategory?: null | string;
    rawMaterialCode: string;
    rawMaterialName?: null | string;
    remaining: Decimal;
    required?: Decimal | null;
    shortage: Decimal;
  }

  export interface RecipePlan {
    batches: Decimal;
    batchWeight: Decimal;
    lines: RecipePlanLine[];
    recipeCode: string;
    recipeEnabled: boolean;
    recipeName: string;
    requiredTotal: Decimal;
    shortage: boolean;
  }

  export interface RecipePlanReq {
    batches?: Decimal;
    /** 在制单补领时传，按单上的配方扣掉已领的。 */
    orderId?: number;
    recipeCode?: string;
  }

  export interface OrderReturnReq {
    id: number;
    lines: Array<{ inputId: number; quantity: Decimal }>;
    remark?: string;
  }

  export interface OrderVoidReq {
    id: number;
    reason: string;
  }

  export type OrderStatus = 'COMPLETED' | 'IN_PROGRESS' | 'VOIDED';

  export interface OrderLine {
    batchNo: string;
    defectQuantity?: Decimal | null;
    goodQuantity?: Decimal | null;
    id: number;
    /** 领料行：这一行的领料时间；第几次领料（0 开单领料，1 起为第几次补领）。 */
    issuedAt?: null | number | string;
    /** 领料行：谁登记的、补领原因。 */
    issuedBy?: null | string;
    issueRemark?: null | string;
    issueSeq?: null | number;
    item?: ItemAttrs | null;
    itemCode: string;
    laminationSide?: LaminationSide | null;
    location: string;
    quantity?: Decimal | null;
    /** 产出行：第几次报产出、报产出时间。 */
    reportedAt?: null | number | string;
    reportSeq?: null | number;
    /** 领料行：已退回的余料。 */
    returnedQuantity?: Decimal | null;
    stage: string;
    stockId?: null | number;
  }

  export interface Order {
    assignmentId?: null | string;
    completedAt?: null | number | string;
    contractCode?: null | string;
    contractId?: null | string;
    contractItemId?: null | string;
    defectQuantity: Decimal;
    goodQuantity: Decimal;
    id: number;
    inputQuantity: Decimal;
    inputs?: OrderLine[];
    issuedAt: number | string;
    /** 已完工但还在补登期限内（完工 3 天内），可以补登领料。 */
    lateSupplementable?: boolean | null;
    operatorName?: null | string;
    operatorUserId?: null | number;
    orderNo: string;
    outputs?: OrderLine[];
    outputStage: string;
    process: string;
    /** 包装完工回写到合同的数量。 */
    productionWriteback?: Decimal | null;
    remark?: null | string;
    /** 报工时上传的纸质领料单照片（逗号分隔）。 */
    issueSheetUrls?: null | string;
    /** 这张单带出的计件（详情接口返回）。 */
    pieceworks?: Array<{
      amount: Decimal;
      itemName: string;
      quantity?: Decimal | null;
      reportSeq?: null | number;
      status: string;
      userName?: null | string;
    }>;
    /** 按配方领料的配方、锅数；详情另返回配方对照。 */
    recipeBatches?: Decimal | null;
    recipeCode?: null | string;
    recipeLines?: null | RecipePlanLine[];
    recipeName?: null | string;
    /** 已报产出次数。 */
    reportCount?: null | number;
    /** 已退回原库存的余料合计（来源单位）。 */
    returnedQuantity?: Decimal | null;
    sourceStage: string;
    status: OrderStatus;
    /** 补领次数。 */
    supplementCount?: null | number;
    team?: null | string;
    voidedAt?: null | number | string;
    voidedBy?: null | string;
    voidReason?: null | string;
  }

  export interface OrderPageReq extends PageParam {
    keyword?: string;
    process?: string;
    status?: string;
  }

  export interface DefectStat {
    defectQuantity: Decimal;
    goodQuantity: Decimal;
    orderCount: number;
    process: string;
  }

  export interface Setting {
    processes: Array<{ process: string; sources: string[] }>;
    stages: Array<{ defaultLocation: string; stage: string }>;
  }

  /** 后端 LocalDate 可能是 "2026-10-08" 或 [2026, 10, 8]。 */
  export type DateValue = null | number[] | string;

  export interface Shipment {
    contractCode?: null | string;
    contractId: string;
    contractItemId: string;
    customerName?: null | string;
    id: number;
    lines?: Array<{
      batchNo: string;
      itemCode: string;
      location: string;
      quantity: Decimal;
      stockId: number;
    }>;
    operatorName?: null | string;
    productName?: null | string;
    quantity: Decimal;
    remark?: null | string;
    shipmentNo: string;
    shippedAt?: number | string;
    shippedDate?: DateValue;
  }

  export interface ShipmentPageReq extends PageParam {
    keyword?: string;
  }

  /** 辅料用量：每做一件成品要用多少这种辅料，在哪道工序领。 */
  export interface AuxUsage {
    perUnit: Decimal;
    process?: null | string;
    productCode?: null | string;
    productId: string;
    productName?: null | string;
    unit?: null | string;
  }

  /** 开工序单时带出的辅料：用量、已领、可领的库存行。 */
  export interface AuxPlan extends AuxUsage {
    issuedQuantity: Decimal;
    orderQuantity?: Decimal | null;
    stocks: Stock[];
  }

  /** 采购单送到本厂、还没收齐的原料 / 辅料采购行。 */
  export interface PurchaseLine {
    category?: null | string;
    contractCode?: null | string;
    contractId?: null | string;
    customerName?: null | string;
    kind: MaterialKind;
    orderCode: string;
    orderDate?: DateValue;
    orderId: string;
    orderLineId: string;
    productCode?: null | string;
    productId: string;
    productName: string;
    quantity: Decimal;
    /** 原料：上次选定的对应原材料。 */
    rawMaterialCode?: null | string;
    rawMaterialName?: null | string;
    receivedQuantity: Decimal;
    remainingQuantity: Decimal;
    specification?: null | string;
    supplierName?: null | string;
    unit?: null | string;
  }

  /** 外贸合同外采采购单里还没到齐的明细。 */
  export interface TradePurchaseLine {
    arrivedQuantity: Decimal;
    color?: null | string;
    contractCode: string;
    contractId: string;
    contractItemId: string;
    customerName?: null | string;
    material?: null | string;
    orderCode?: null | string;
    orderId: string;
    orderLineId: string;
    productCode?: null | string;
    productName?: null | string;
    quantity: Decimal;
    remainingQuantity: Decimal;
    size?: null | string;
    specification?: null | string;
    supplierName?: null | string;
    unit?: null | string;
  }

  export interface PurchaseReceiptReq {
    acceptedQuantity?: Decimal;
    batchNo?: string;
    contractId?: null | string;
    exceptionReason?: string;
    location?: string;
    orderId: string;
    orderLineId: string;
    quantity: Decimal;
    /** 原料第一次收货时必选对应的原材料，以后自动带出。 */
    rawMaterialCode?: string;
    remark?: string;
  }

  export interface TradeReceiptReq {
    acceptedQuantity: Decimal;
    attrs: ItemAttrs;
    batchNo: string;
    contractId: string;
    exceptionReason?: string;
    location?: string;
    orderId: string;
    orderLineId: string;
    quantity: Decimal;
    remark?: string;
  }

  export type ReceiptSource = 'PURCHASE' | 'RAW_PURCHASE' | 'TRADE_PURCHASE';

  export interface Receipt {
    acceptedQuantity: Decimal;
    batchNo: string;
    contractCode?: null | string;
    exceptionReason?: null | string;
    id: number;
    itemCode: string;
    location: string;
    materialKind?: MaterialKind | null;
    operatorName?: null | string;
    productName?: null | string;
    purchaseNo?: null | string;
    quantity: Decimal;
    receiptNo: string;
    receivedAt?: number | string;
    remark?: null | string;
    sourceType: ReceiptSource;
    stage: string;
    /** RECEIVED 已收货 / VOIDED 已作废；为空视为已收货。 */
    status?: null | string;
    stockInCode?: null | string;
    supplierName?: null | string;
    unit?: null | string;
    voidReason?: null | string;
    voidedAt?: number | string;
    voidedBy?: null | string;
  }

  export interface ReceiptPageReq extends PageParam {
    keyword?: string;
    sourceType?: ReceiptSource;
  }

  export interface CodePreviewRow {
    attrs: ItemAttrs;
    stage: string;
  }
}

export function getStageStockOptions() {
  return requestClient.get<FdmgongchangStageStockApi.Options>(
    `${BASE}/options`,
    { headers: factoryHeaders() },
  );
}

export function getStageStockSummary() {
  return requestClient.get<FdmgongchangStageStockApi.Summary>(
    `${BASE}/summary`,
    { headers: factoryHeaders() },
  );
}

export function getStageStockToday() {
  return requestClient.get<FdmgongchangStageStockApi.Today>(`${BASE}/today`, {
    headers: factoryHeaders(),
  });
}

export function getStockPage(params: FdmgongchangStageStockApi.StockPageReq) {
  return requestClient.get<PageResult<FdmgongchangStageStockApi.Stock>>(
    `${BASE}/stock/page`,
    { headers: factoryHeaders(), params },
  );
}

/** 库存中心：各工厂有货的工序库存（只读，不带工厂请求头）。 */
export function getCenterStockPage(
  params: FdmgongchangStageStockApi.CenterStockPageReq,
) {
  return requestClient.get<PageResult<FdmgongchangStageStockApi.Stock>>(
    `${BASE}/center/stock-page`,
    { params },
  );
}

/** 库存中心：启用中的工厂。 */
export function getCenterFactories() {
  return requestClient.get<Array<{ code?: string; id: number; name: string }>>(
    `${BASE}/center/factories`,
  );
}

export function receiveStock(data: FdmgongchangStageStockApi.ReceiveReq) {
  return requestClient.post<number>(`${BASE}/stock/receive`, data, {
    headers: factoryHeaders(),
  });
}

export function stocktake(data: FdmgongchangStageStockApi.StocktakeReq) {
  return requestClient.post<boolean>(`${BASE}/stock/stocktake`, data, {
    headers: factoryHeaders(),
  });
}

export function getTxnPage(params: FdmgongchangStageStockApi.TxnPageReq) {
  return requestClient.get<PageResult<FdmgongchangStageStockApi.Txn>>(
    `${BASE}/txn/page`,
    { headers: factoryHeaders(), params },
  );
}

export function getOrderPage(params: FdmgongchangStageStockApi.OrderPageReq) {
  return requestClient.get<PageResult<FdmgongchangStageStockApi.Order>>(
    `${BASE}/order/page`,
    { headers: factoryHeaders(), params },
  );
}

export function getOrder(id: number) {
  return requestClient.get<FdmgongchangStageStockApi.Order>(
    `${BASE}/order/get`,
    { headers: factoryHeaders(), params: { id } },
  );
}

export function createOrder(data: FdmgongchangStageStockApi.OrderCreateReq) {
  return requestClient.post<number>(`${BASE}/order/create`, data, {
    headers: factoryHeaders(),
  });
}

export function completeOrder(
  data: FdmgongchangStageStockApi.OrderCompleteReq,
) {
  return requestClient.post<boolean>(`${BASE}/order/complete`, data, {
    headers: factoryHeaders(),
  });
}

export function reportOrder(data: FdmgongchangStageStockApi.OrderReportReq) {
  return requestClient.post<boolean>(`${BASE}/order/report`, data, {
    headers: factoryHeaders(),
  });
}

export function returnOrderMaterial(
  data: FdmgongchangStageStockApi.OrderReturnReq,
) {
  return requestClient.post<boolean>(`${BASE}/order/return`, data, {
    headers: factoryHeaders(),
  });
}

export function supplementOrder(
  data: FdmgongchangStageStockApi.OrderSupplementReq,
) {
  return requestClient.post<boolean>(`${BASE}/order/supplement`, data, {
    headers: factoryHeaders(),
  });
}

export function getRecipePlan(params: FdmgongchangStageStockApi.RecipePlanReq) {
  return requestClient.get<FdmgongchangStageStockApi.RecipePlan>(
    `${BASE}/order/recipe-plan`,
    { headers: factoryHeaders(), params },
  );
}

export function voidOrder(data: FdmgongchangStageStockApi.OrderVoidReq) {
  return requestClient.post<boolean>(`${BASE}/order/void`, data, {
    headers: factoryHeaders(),
  });
}

/** 本厂可做这道工序的在岗人员（人员岗位里分配的）。 */
export function getOrderOperators(process: string) {
  return requestClient.get<FdmgongchangFactoryApi.Operator[]>(
    `${BASE}/order/operators`,
    { headers: factoryHeaders(), params: { process } },
  );
}

export function getDefectStats(params?: { from?: string; to?: string }) {
  return requestClient.get<FdmgongchangStageStockApi.DefectStat[]>(
    `${BASE}/order/defect-stats`,
    { headers: factoryHeaders(), params },
  );
}

export function previewItemCodes(
  rows: FdmgongchangStageStockApi.CodePreviewRow[],
) {
  return requestClient.post<Array<null | string>>(
    `${BASE}/item/preview-codes`,
    { rows },
  );
}

export function getStageStockSetting() {
  return requestClient.get<FdmgongchangStageStockApi.Setting>(
    `${BASE}/setting`,
    { headers: factoryHeaders() },
  );
}

export function saveStageStockSetting(data: FdmgongchangStageStockApi.Setting) {
  return requestClient.put<boolean>(`${BASE}/setting`, data, {
    headers: factoryHeaders(),
  });
}

export function getShipmentPage(
  params: FdmgongchangStageStockApi.ShipmentPageReq,
) {
  return requestClient.get<PageResult<FdmgongchangStageStockApi.Shipment>>(
    `${BASE}/shipment/page`,
    { headers: factoryHeaders(), params },
  );
}

/** 采购单送到本厂、待收货的原料与辅料。 */
export function getPurchaseLines() {
  return requestClient.get<FdmgongchangStageStockApi.PurchaseLine[]>(
    `${BASE}/receiving/purchase-lines`,
    { headers: factoryHeaders() },
  );
}

export function getTradeOpenLines() {
  return requestClient.get<FdmgongchangStageStockApi.TradePurchaseLine[]>(
    `${BASE}/receiving/trade-lines`,
    { headers: factoryHeaders() },
  );
}

/** 采购收货：原料进原材料、辅料进辅料库存，回写采购单到货。 */
export function receivePurchase(
  data: FdmgongchangStageStockApi.PurchaseReceiptReq,
) {
  return requestClient.post<number>(`${BASE}/receiving/purchase`, data, {
    headers: factoryHeaders(),
  });
}

/** 作废采购收货：扣回库存，冲回采购单到货。 */
export function voidReceipt(data: { id: number; reason: string }) {
  return requestClient.post<boolean>(`${BASE}/receiving/void`, data, {
    headers: factoryHeaders(),
  });
}

/** 开工序单时带出的辅料：订单定的用量、已领数量和可领库存。 */
export function getAuxPlan(params: {
  process?: string;
  productionOrderItemId?: number;
}) {
  return requestClient.get<FdmgongchangStageStockApi.AuxPlan[]>(
    `${BASE}/order/aux-plan`,
    { headers: factoryHeaders(), params },
  );
}

/** 搜辅料产品（设订单辅料、辅料入库用）。 */
export function searchStageAuxProducts(keyword: string) {
  return requestClient.get<
    Array<{
      category?: null | string;
      code?: null | string;
      displayName?: null | string;
      id: string;
      name: string;
      unit?: null | string;
    }>
  >(`${BASE}/aux-products`, { params: { keyword } });
}

export function receiveTradePurchase(
  data: FdmgongchangStageStockApi.TradeReceiptReq,
) {
  return requestClient.post<number>(`${BASE}/receiving/trade`, data, {
    headers: factoryHeaders(),
  });
}

export function getReceiptPage(
  params: FdmgongchangStageStockApi.ReceiptPageReq,
) {
  return requestClient.get<PageResult<FdmgongchangStageStockApi.Receipt>>(
    `${BASE}/receiving/page`,
    { headers: factoryHeaders(), params },
  );
}

/** 附加工序报工：选这个阶段的库存行，填加工数量和残次；残次从库存扣掉，良品原地不动。 */
export function createExtraOrder(
  data: FdmgongchangStageStockApi.ExtraOrderReq,
) {
  return requestClient.post<number>(`${BASE}/extra-order/create`, data, {
    headers: factoryHeaders(),
  });
}
