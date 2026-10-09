import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

const BASE = '/fdmgongchang/stage-stock';

export namespace FdmgongchangStageStockApi {
  export type Decimal = number | string;
  export type LaminationSide = 'BACK' | 'FRONT';
  export type ReceiveType = 'OPENING' | 'RAW_RECEIPT';

  /** 物料属性：每个库存阶段只用到其中一部分。 */
  export interface ItemAttrs {
    backColor?: null | string;
    color?: null | string;
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

  export interface Options {
    colors: DictOption[];
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

  export interface Stock {
    batchNo: string;
    id: number;
    item?: ItemAttrs | null;
    itemCode: string;
    itemId: number;
    location: string;
    quantity: Decimal;
    stage: string;
    updateTime?: number | string;
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

  export interface OrderCreateReq {
    /** 关联外贸自制任务：contractId 与 assignmentId 一起填。 */
    assignmentId?: string;
    contractCode?: string;
    contractId?: string;
    finish: boolean;
    inputs: OrderInput[];
    operatorName?: string;
    outputs: OrderOutput[];
    process: string;
    remark?: string;
    sourceStage: string;
    team?: string;
  }

  export interface OrderCompleteReq {
    id: number;
    outputs: OrderOutput[];
  }

  export interface OrderLine {
    batchNo: string;
    defectQuantity?: Decimal | null;
    goodQuantity?: Decimal | null;
    id: number;
    item?: ItemAttrs | null;
    itemCode: string;
    laminationSide?: LaminationSide | null;
    location: string;
    quantity?: Decimal | null;
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
    operatorName?: null | string;
    orderNo: string;
    outputs?: OrderLine[];
    outputStage: string;
    process: string;
    /** 包装完工回写到合同的数量。 */
    productionWriteback?: Decimal | null;
    remark?: null | string;
    sourceStage: string;
    status: 'COMPLETED' | 'IN_PROGRESS';
    team?: null | string;
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

  /** 外贸合同的自制任务（待生产订单）。ready=false 表示采购方案未生效。 */
  export interface MakeTask {
    approvedQuantity: Decimal;
    assignmentId: string;
    assignmentQuantity: Decimal;
    color?: null | string;
    completedQuantity: Decimal;
    contractCode: string;
    contractId: string;
    contractItemId: string;
    customerName?: null | string;
    inProgressOrderCount: number;
    itemQuantity: Decimal;
    linkedOrderCount: number;
    material?: null | string;
    packaging?: null | string;
    printing?: null | string;
    productCode?: null | string;
    productName?: null | string;
    ready: boolean;
    requiredDate?: DateValue;
    shippedQuantity: Decimal;
    size?: null | string;
    specification?: null | string;
    status?: null | string;
    unit?: null | string;
  }

  /** 可从工序库存出货的合同明细（自制或库存履约）。 */
  export interface ShippableItem {
    color?: null | string;
    contractCode: string;
    contractId: string;
    contractItemId: string;
    customerName?: null | string;
    itemQuantity: Decimal;
    material?: null | string;
    method: 'BUY' | 'MAKE' | 'STOCK';
    productCode?: null | string;
    productName?: null | string;
    remainingQuantity: Decimal;
    requiredDate?: DateValue;
    shippedQuantity: Decimal;
    size?: null | string;
    specification?: null | string;
    unit?: null | string;
  }

  export interface ShipmentCreateReq {
    contractId: string;
    contractItemId: string;
    lines: Array<{ quantity: Decimal; stockId: number }>;
    operatorName?: string;
    remark?: string;
    shippedDate?: string;
  }

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

  /** 原材料采购单里还没到齐的明细。 */
  export interface RawOpenLine {
    expectedDate?: DateValue;
    lineId: number;
    orderDate?: DateValue;
    purchaseId: number;
    purchaseNo: string;
    quantity: Decimal;
    rawCategory?: null | string;
    rawMaterialCode: string;
    rawMaterialName: string;
    receivedQuantity: Decimal;
    remainingQuantity: Decimal;
    supplierName?: null | string;
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

  export interface RawReceiptReq {
    batchNo: string;
    location?: string;
    purchaseLineId: number;
    quantity: Decimal;
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

  export type ReceiptSource = 'RAW_PURCHASE' | 'TRADE_PURCHASE';

  export interface Receipt {
    acceptedQuantity: Decimal;
    batchNo: string;
    contractCode?: null | string;
    exceptionReason?: null | string;
    id: number;
    itemCode: string;
    location: string;
    operatorName?: null | string;
    productName?: null | string;
    purchaseNo?: null | string;
    quantity: Decimal;
    receiptNo: string;
    receivedAt?: number | string;
    remark?: null | string;
    sourceType: ReceiptSource;
    stage: string;
    supplierName?: null | string;
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
  );
}

export function getStageStockSummary() {
  return requestClient.get<FdmgongchangStageStockApi.Summary>(
    `${BASE}/summary`,
  );
}

export function getStockPage(params: FdmgongchangStageStockApi.StockPageReq) {
  return requestClient.get<PageResult<FdmgongchangStageStockApi.Stock>>(
    `${BASE}/stock/page`,
    { params },
  );
}

export function receiveStock(data: FdmgongchangStageStockApi.ReceiveReq) {
  return requestClient.post<number>(`${BASE}/stock/receive`, data);
}

export function stocktake(data: FdmgongchangStageStockApi.StocktakeReq) {
  return requestClient.post<boolean>(`${BASE}/stock/stocktake`, data);
}

export function getTxnPage(params: FdmgongchangStageStockApi.TxnPageReq) {
  return requestClient.get<PageResult<FdmgongchangStageStockApi.Txn>>(
    `${BASE}/txn/page`,
    { params },
  );
}

export function getOrderPage(params: FdmgongchangStageStockApi.OrderPageReq) {
  return requestClient.get<PageResult<FdmgongchangStageStockApi.Order>>(
    `${BASE}/order/page`,
    { params },
  );
}

export function getOrder(id: number) {
  return requestClient.get<FdmgongchangStageStockApi.Order>(
    `${BASE}/order/get`,
    { params: { id } },
  );
}

export function createOrder(data: FdmgongchangStageStockApi.OrderCreateReq) {
  return requestClient.post<number>(`${BASE}/order/create`, data);
}

export function completeOrder(
  data: FdmgongchangStageStockApi.OrderCompleteReq,
) {
  return requestClient.post<boolean>(`${BASE}/order/complete`, data);
}

export function getDefectStats(params?: { from?: string; to?: string }) {
  return requestClient.get<FdmgongchangStageStockApi.DefectStat[]>(
    `${BASE}/order/defect-stats`,
    { params },
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
  );
}

export function saveStageStockSetting(data: FdmgongchangStageStockApi.Setting) {
  return requestClient.put<boolean>(`${BASE}/setting`, data);
}

export function getMakeTasks() {
  return requestClient.get<FdmgongchangStageStockApi.MakeTask[]>(
    `${BASE}/trade/make-tasks`,
  );
}

export function getShippableItems() {
  return requestClient.get<FdmgongchangStageStockApi.ShippableItem[]>(
    `${BASE}/trade/shippable-items`,
  );
}

export function createShipment(
  data: FdmgongchangStageStockApi.ShipmentCreateReq,
) {
  return requestClient.post<number>(`${BASE}/shipment/create`, data);
}

export function getShipmentPage(
  params: FdmgongchangStageStockApi.ShipmentPageReq,
) {
  return requestClient.get<PageResult<FdmgongchangStageStockApi.Shipment>>(
    `${BASE}/shipment/page`,
    { params },
  );
}

export function getRawOpenLines() {
  return requestClient.get<FdmgongchangStageStockApi.RawOpenLine[]>(
    `${BASE}/receiving/raw-lines`,
  );
}

export function getTradeOpenLines() {
  return requestClient.get<FdmgongchangStageStockApi.TradePurchaseLine[]>(
    `${BASE}/receiving/trade-lines`,
  );
}

export function receiveRawPurchase(
  data: FdmgongchangStageStockApi.RawReceiptReq,
) {
  return requestClient.post<number>(`${BASE}/receiving/raw`, data);
}

export function receiveTradePurchase(
  data: FdmgongchangStageStockApi.TradeReceiptReq,
) {
  return requestClient.post<number>(`${BASE}/receiving/trade`, data);
}

export function getReceiptPage(
  params: FdmgongchangStageStockApi.ReceiptPageReq,
) {
  return requestClient.get<PageResult<FdmgongchangStageStockApi.Receipt>>(
    `${BASE}/receiving/page`,
    { params },
  );
}
