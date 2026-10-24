import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataEcFloorPriceApi {
  export interface FloorPrice {
    id?: number;
    seriesCode?: string;
    materialKey?: string;
    specText?: string;
    specKey?: string;
    matKind?: string;
    /** 公司底价，空表示未定价 */
    floorPrice?: null | number;
    refPrice?: null | number;
    /** 参考价是否手工填写；否则按底价×1.2 */
    refPriceManual?: boolean;
    sort?: number;
    remark?: string;
    updaterName?: string;
    updateTime?: string;
  }

  export interface PageReq extends PageParam {
    seriesCode?: string;
    materialKey?: string;
    matKind?: string;
    spec?: string;
    /** PRICED / UNPRICED */
    priceStatus?: string;
  }

  export interface SeriesCount {
    seriesCode: string;
    count: number;
  }

  export interface PriceLog {
    id: number;
    action: 'CREATE' | 'DELETE' | 'IMPORT' | 'UPDATE';
    oldFloorPrice?: null | number;
    newFloorPrice?: null | number;
    oldRefPrice?: null | number;
    newRefPrice?: null | number;
    creatorName?: string;
    createTime?: string;
  }

  export interface Lookup {
    itemCode?: string;
    /** BLANK / FINISHED；空表示没找到这个编码 */
    skuSource?: string;
    specText?: string;
    materialKey?: string;
    seriesCode?: string;
    matches: FloorPrice[];
  }

  export interface AiAnswer {
    /** AI 对问题的理解 */
    understood?: string;
    /** 没找到或有歧义时的提示 */
    followUp?: string;
    /** 价格由系统从底价表读取，不经过 AI */
    matches: Array<{ price: FloorPrice; reason?: string }>;
    modelName?: string;
  }

  export interface ImportRow {
    rowNo: number;
    seriesCode?: string;
    seriesText?: string;
    materialKey?: string;
    specText?: string;
    matKind?: string;
    floorPrice?: null | number;
    refPrice?: null | number;
    refPriceManual?: boolean;
    remark?: string;
    action: 'CREATE' | 'ERROR' | 'SAME' | 'UPDATE';
    oldFloorPrice?: null | number;
    oldRefPrice?: null | number;
    message?: string;
  }

  export interface ImportResult {
    total: number;
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
    rows: ImportRow[];
  }
}

const BASE = '/fdmdata/ec-floor-price';

export function getEcFloorPricePage(params: FdmdataEcFloorPriceApi.PageReq) {
  return requestClient.get<PageResult<FdmdataEcFloorPriceApi.FloorPrice>>(
    `${BASE}/page`,
    { params },
  );
}

export function getEcFloorPrice(id: number) {
  return requestClient.get<FdmdataEcFloorPriceApi.FloorPrice>(
    `${BASE}/get?id=${id}`,
  );
}

export function createEcFloorPrice(data: FdmdataEcFloorPriceApi.FloorPrice) {
  return requestClient.post<number>(`${BASE}/create`, data);
}

export function updateEcFloorPrice(data: FdmdataEcFloorPriceApi.FloorPrice) {
  return requestClient.put<boolean>(`${BASE}/update`, data);
}

export function deleteEcFloorPrice(id: number) {
  return requestClient.delete<boolean>(`${BASE}/delete?id=${id}`);
}

export function getEcFloorPriceSeriesCounts() {
  return requestClient.get<FdmdataEcFloorPriceApi.SeriesCount[]>(
    `${BASE}/series-counts`,
  );
}

export function getEcFloorPriceLogs(priceId: number) {
  return requestClient.get<FdmdataEcFloorPriceApi.PriceLog[]>(
    `${BASE}/logs`,
    { params: { priceId } },
  );
}

export function lookupEcFloorPrice(itemCode: string) {
  return requestClient.get<FdmdataEcFloorPriceApi.Lookup>(`${BASE}/lookup`, {
    params: { itemCode },
  });
}

export function downloadEcFloorPriceTemplate() {
  return requestClient.download(`${BASE}/import-template`);
}

export function exportEcFloorPriceExcel(params: FdmdataEcFloorPriceApi.PageReq) {
  return requestClient.download(`${BASE}/export-excel`, { params });
}

export function previewEcFloorPriceImport(file: File) {
  return requestClient.upload<FdmdataEcFloorPriceApi.ImportResult>(
    `${BASE}/import-preview`,
    { file },
  );
}

export function importEcFloorPriceExcel(file: File) {
  return requestClient.upload<FdmdataEcFloorPriceApi.ImportResult>(
    `${BASE}/import`,
    { file },
  );
}

/** AI 在服务端最多等 60 秒，这里留足余量 */
const AI_ASK_TIMEOUT = 90_000;

export function aiAskEcFloorPrice(question: string) {
  return requestClient.post<FdmdataEcFloorPriceApi.AiAnswer>(
    `${BASE}/ai-ask`,
    { question },
    { timeout: AI_ASK_TIMEOUT },
  );
}
