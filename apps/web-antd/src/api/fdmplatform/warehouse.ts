import type { Decimal, PageResult } from './index';

import { requestClient } from '#/api/request';

const base = '/fdmplatform/v1/warehouse';

export interface StockProduct {
  skuId?: string;
  specVersion?: string;
  productName?: string;
  productCode?: string;
  specification?: string;
  unit?: string;
}

export interface StockInLine extends StockProduct {
  orderLineId: string;
  contractItemId?: string;
  quantity: Decimal;
  acceptedQuantity: Decimal;
  exceptionQuantity: Decimal;
  exceptionReason?: string;
  batchNo?: string;
  unitPrice?: Decimal;
  amount?: Decimal;
  /** 已退给供应商的合格品 / 不合格品数量 */
  returnedAcceptedQuantity?: Decimal;
  returnedExceptionQuantity?: Decimal;
}

/** 作废后保留可查，不再计入库存与合同进度。 */
export interface VoidInfo {
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: number;
}

export interface StockIn extends VoidInfo {
  id: string;
  code: string;
  status: 'RECEIVED' | 'VOIDED';
  /**
   * PRODUCTION 工厂交货的生产入库 / FACTORY_PURCHASE 工厂收货的原料、辅料（不进采购仓库）/
   * FACTORY_MADE 自家工厂的采购单生产入库；都只能在工厂那边作废，不能在这里作废或退货。
   * OTHER 常规入库（不关联采购单，记来源）。没有 kind 的是采购入库。
   */
  kind?: 'FACTORY_MADE' | 'FACTORY_PURCHASE' | 'OTHER' | 'PRODUCTION';
  factoryName?: null | string;
  /** 常规入库的来源：期初、客户退回、样品退回等 */
  source?: string;
  standalone?: boolean;
  warehouseId: string;
  warehouseName: string;
  contractId: string;
  contractCode: string;
  customerName?: string;
  orderId: string;
  orderCode: string;
  supplierName?: string;
  currency?: string;
  receivedDate: string;
  deliveryNo?: string;
  remark?: string;
  directShip: boolean;
  stockOutId?: string;
  stockOutCode?: string;
  amount?: Decimal;
  lines: StockInLine[];
  createdBy: number;
  createdAt: string;
}

/** 入库单列表页签：PURCHASE 采购入库 / PRODUCTION 生产入库 / FACTORY_PURCHASE 工厂收货 / OTHER 常规入库 */
export type StockInKind =
  | 'FACTORY_PURCHASE'
  | 'OTHER'
  | 'PRODUCTION'
  | 'PURCHASE';

export interface OtherInCreate {
  idempotencyKey: string;
  warehouseId: string;
  receivedDate?: string;
  source: string;
  remark?: string;
  /** 产品中心的产品；unitCost 不填表示成本未知 */
  lines: { productId: string; quantity: Decimal; unitCost?: Decimal }[];
}

export interface StockOutLine extends StockProduct {
  /** 销售出库按合同明细；其它出库按库存行 */
  contractItemId?: string;
  stockId?: string;
  quantity: Decimal;
  salesUnitPrice?: Decimal;
  unitCost?: Decimal;
  costAmount?: Decimal;
}

export interface StockOut extends VoidInfo {
  id: string;
  code: string;
  status: 'SHIPPED' | 'VOIDED';
  /** SALES 销售出库 / DIRECT 入库直发 / OTHER 其它出库（不关联合同，记去向） */
  kind: 'DIRECT' | 'OTHER' | 'SALES';
  warehouseId: string;
  warehouseName: string;
  contractId?: null | string;
  contractCode?: null | string;
  destination?: string;
  customerName?: string;
  shippedDate: string;
  remark?: string;
  stockInId?: string;
  stockInCode?: string;
  costAmount?: Decimal;
  lines: StockOutLine[];
  createdBy: number;
  createdAt: string;
}

export interface StockBalance extends StockProduct {
  id: string;
  warehouseId: string;
  warehouseName: string;
  onHand: Decimal;
  costAmount: Decimal;
  costKnown: boolean;
  lastInDate?: string;
  lastOutDate?: string;
}

/** 流水来源：采购入库、销售出库、作废、采购退货、生产入库、其它出库、调拨、盘点 */
export type StockTxnAction =
  | 'FACTORY_IN'
  | 'OTHER_IN'
  | 'OTHER_OUT'
  | 'PURCHASE_RETURN'
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'STOCKTAKE_GAIN'
  | 'STOCKTAKE_LOSS'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'VOID_FACTORY_IN'
  | 'VOID_OTHER_IN'
  | 'VOID_STOCK_IN'
  | 'VOID_STOCK_OUT'
  | 'VOID_TRANSFER';

export interface StockTxn extends StockProduct {
  id: string;
  type: 'IN' | 'OUT';
  /** 早期流水没有 action，按 type 推断 */
  action?: StockTxnAction;
  docKind: string;
  docId: string;
  docCode: string;
  warehouseId: string;
  warehouseName: string;
  stockId: string;
  quantity: Decimal;
  onHandAfter: Decimal;
  unitCost?: Decimal;
  amount?: Decimal;
  contractId?: string;
  contractCode?: string;
  partner?: string;
  occurredOn: string;
  createdAt: string;
  actorId: number;
}

export interface InboundLine {
  contractId: string;
  contractCode: string;
  orderId: string;
  orderCode?: string;
  supplierName?: string;
  orderLineId: string;
  contractItemId: string;
  productName?: string;
  productCode?: string;
  specification?: string;
  unit?: string;
  quantity: Decimal;
  arrivedQuantity: Decimal;
  remainingQuantity: Decimal;
}

export interface OutboundItem {
  contractItemId: string;
  productName?: string;
  productCode?: string;
  specification?: string;
  unit?: string;
  itemQuantity: Decimal;
  shippedQuantity: Decimal;
  remainingQuantity: Decimal;
  onHand?: Decimal;
  method?: string;
}

export interface StockInCreate {
  idempotencyKey: string;
  contractId: string;
  orderId: string;
  warehouseId: string;
  receivedDate?: string;
  deliveryNo?: string;
  remark?: string;
  directShip: boolean;
  lines: {
    acceptedQuantity: Decimal;
    batchNo?: string;
    exceptionReason?: string;
    orderLineId: string;
    quantity: Decimal;
  }[];
}

export interface StockOutCreate {
  idempotencyKey: string;
  contractId: string;
  warehouseId: string;
  shippedDate?: string;
  remark?: string;
  lines: { contractItemId: string; quantity: Decimal }[];
}

/** 库存中心的仓库；writable 表示当前登录人能在这个仓库出库、调出、盘点（工厂库管只能操作本厂仓库） */
export interface InventoryWarehouse {
  id: string;
  name: string;
  code?: string;
  isDefault: boolean;
  factoryId?: null | number;
  factoryName?: null | string;
  writable: boolean;
}

export interface StockLineInput {
  stockId: string;
  quantity: Decimal;
}

export interface OtherOutCreate {
  idempotencyKey: string;
  warehouseId: string;
  shippedDate?: string;
  /** 去向：电商仓、平台仓、样品、报废等 */
  destination: string;
  remark?: string;
  lines: StockLineInput[];
}

export interface TransferLine extends StockProduct {
  stockId: string;
  quantity: Decimal;
  unitCost?: Decimal;
  costKnown: boolean;
}

export interface Transfer extends VoidInfo {
  id: string;
  code: string;
  status: 'TRANSFERRED' | 'VOIDED';
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  transferDate: string;
  remark?: string;
  lines: TransferLine[];
  createdBy: number;
  createdAt: string;
}

export interface TransferCreate {
  idempotencyKey: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  transferDate?: string;
  remark?: string;
  lines: StockLineInput[];
}

export interface StocktakeLine extends StockProduct {
  stockId: string;
  bookQuantity: Decimal;
  actualQuantity: Decimal;
  diffQuantity: Decimal;
  unitCost?: Decimal;
  diffAmount?: Decimal;
}

export interface Stocktake {
  id: string;
  code: string;
  status: 'POSTED';
  warehouseId: string;
  warehouseName: string;
  countedDate: string;
  remark?: string;
  changedCount: number;
  gainAmount: Decimal;
  lossAmount: Decimal;
  lines: StocktakeLine[];
  createdBy: number;
  createdAt: string;
}

export interface StocktakeCreate {
  idempotencyKey: string;
  warehouseId: string;
  countedDate?: string;
  remark?: string;
  /** bookQuantity 是盘点时看到的账面数，过账时账面变了要重盘 */
  lines: { actualQuantity: Decimal; bookQuantity: Decimal; stockId: string }[];
}

/** ACCEPTED 退合格品（扣库存）/ EXCEPTION 退回不合格品（未进库存，只登记） */
export type ReturnKind = 'ACCEPTED' | 'EXCEPTION';

export interface PurchaseReturnLine extends StockProduct {
  orderLineId: string;
  contractItemId?: string;
  kind: ReturnKind;
  quantity: Decimal;
  unitPrice?: Decimal;
  amount?: Decimal;
}

export interface PurchaseReturn {
  id: string;
  code: string;
  status: 'RETURNED';
  stockInId: string;
  stockInCode: string;
  warehouseId: string;
  warehouseName: string;
  contractId?: string;
  contractCode?: string;
  customerName?: string;
  standalone: boolean;
  orderId: string;
  orderCode: string;
  supplierName?: string;
  currency?: string;
  returnedDate: string;
  reason: string;
  /** 不再补货：退货数量同时取消采购余额，应付减少 */
  noReplacement: boolean;
  remark?: string;
  amount?: Decimal;
  lines: PurchaseReturnLine[];
  createdBy: number;
  createdAt: string;
}

export interface PurchaseReturnCreate {
  idempotencyKey: string;
  stockInId: string;
  returnedDate?: string;
  reason: string;
  noReplacement: boolean;
  remark?: string;
  lines: { kind: ReturnKind; orderLineId: string; quantity: Decimal }[];
}

interface PageParams {
  keyword?: string;
  pageNo: number;
  pageSize: number;
  warehouseId?: string;
}

export function getStockIns(
  params: PageParams & {
    contractId?: string;
    kind?: StockInKind;
    orderId?: string;
  },
) {
  return requestClient.get<PageResult<StockIn>>(`${base}/stock-ins/page`, {
    params,
  });
}
export function getStockIn(id: string) {
  return requestClient.get<StockIn>(`${base}/stock-ins/${id}`);
}
export function createOtherIn(data: OtherInCreate) {
  return requestClient.post<StockIn>(`${base}/other-ins`, data);
}
export function createStockIn(data: StockInCreate) {
  return requestClient.post<StockIn>(`${base}/stock-ins`, data);
}
/** kind：SALES 销售出库（含直发）/ OTHER 其它出库；不填全部 */
export function getStockOuts(
  params: PageParams & { contractId?: string; kind?: 'OTHER' | 'SALES' },
) {
  return requestClient.get<PageResult<StockOut>>(`${base}/stock-outs/page`, {
    params,
  });
}
export function getStockOut(id: string) {
  return requestClient.get<StockOut>(`${base}/stock-outs/${id}`);
}
export function createStockOut(data: StockOutCreate) {
  return requestClient.post<StockOut>(`${base}/stock-outs`, data);
}
export function createOtherOut(data: OtherOutCreate) {
  return requestClient.post<StockOut>(`${base}/other-outs`, data);
}
export function getInventoryWarehouses() {
  return requestClient.get<InventoryWarehouse[]>(`${base}/warehouses`);
}
export function getTransfers(params: PageParams) {
  return requestClient.get<PageResult<Transfer>>(`${base}/transfers/page`, {
    params,
  });
}
export function createTransfer(data: TransferCreate) {
  return requestClient.post<Transfer>(`${base}/transfers`, data);
}
export function voidTransfer(
  id: string,
  data: { idempotencyKey: string; reason: string },
) {
  return requestClient.post<Transfer>(`${base}/transfers/${id}/void`, data);
}
export function getStocktakes(params: PageParams) {
  return requestClient.get<PageResult<Stocktake>>(`${base}/stocktakes/page`, {
    params,
  });
}
export function createStocktake(data: StocktakeCreate) {
  return requestClient.post<Stocktake>(`${base}/stocktakes`, data);
}
export function getStocks(params: {
  inStockOnly?: boolean;
  keyword?: string;
  warehouseId?: string;
}) {
  return requestClient.get<StockBalance[]>(`${base}/stocks`, { params });
}
export function getStockTxns(params: PageParams & { stockId?: string }) {
  return requestClient.get<PageResult<StockTxn>>(`${base}/txns/page`, {
    params,
  });
}
export function getInboundLines(contractId: string, orderId?: string) {
  return requestClient.get<InboundLine[]>(`${base}/inbound-lines`, {
    params: { contractId, orderId },
  });
}
export function getOutboundItems(contractId: string, warehouseId?: string) {
  return requestClient.get<OutboundItem[]>(`${base}/outbound-items`, {
    params: { contractId, warehouseId },
  });
}
export function voidStockIn(
  id: string,
  data: { idempotencyKey: string; reason: string },
) {
  return requestClient.post<StockIn>(`${base}/stock-ins/${id}/void`, data);
}
export function voidStockOut(
  id: string,
  data: { idempotencyKey: string; reason: string },
) {
  return requestClient.post<StockOut>(`${base}/stock-outs/${id}/void`, data);
}
export function getPurchaseReturns(
  params: PageParams & { orderId?: string; stockInId?: string },
) {
  return requestClient.get<PageResult<PurchaseReturn>>(
    `${base}/purchase-returns/page`,
    { params },
  );
}
export function createPurchaseReturn(data: PurchaseReturnCreate) {
  return requestClient.post<PurchaseReturn>(`${base}/purchase-returns`, data);
}
