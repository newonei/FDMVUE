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
    contractCode?: string;
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
    completedAt?: null | number | string;
    contractCode?: null | string;
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
