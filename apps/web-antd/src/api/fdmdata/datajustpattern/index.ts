import type { PageParam, PageResult } from '@vben/request';

import type {
  PatternGenReq,
  PatternImportResp,
  PatternOptions,
  PatternPreviewResp,
} from '#/api/fdmdata/datajustsku';

import { requestClient } from '#/api/request';

export namespace FdmdataDataJustPatternApi {
  export interface Pattern {
    id: number;
    picUrl?: string;
    styleCode?: string;
    itemCode: string;
    productName?: string;
    productShortName?: string;
    categoryName?: string;
    colorSpec?: string;
    costPrice?: number;
    attr1?: string;
    attr2?: string;
    attr3?: string;
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    remark?: string;
    status?: number;
    jstSkuId?: string;
    createTime?: string;
  }

  export interface PatternSaveReq {
    id?: number;
    picUrl?: string;
    styleCode: string;
    itemCode: string;
    productName: string;
    productShortName?: string;
    categoryName?: string;
    colorSpec?: string;
    costPrice?: number;
    attr1?: string;
    attr2?: string;
    attr3?: string;
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    remark?: string;
  }

  export interface JstSyncResp {
    jstSkuId?: string;
    message?: string;
  }

  export interface GenerateResp {
    created?: number;
    skipped?: number;
  }

  export interface GeneratePreviewItem {
    itemCode: string;
    patternName: string;
    styleCode: string;
    picUrl?: string;
  }

  export interface GeneratePreviewResp {
    willCreate?: number;
    willSkip?: number;
    previewList?: GeneratePreviewItem[];
  }

  export interface PatternCost {
    id: number;
    itemCode: string;
    patternName: string;
    picUrl?: string;
    remark?: string;
    createTime?: string;
  }

  export interface PatternCostCreateReq {
    itemCode: string;
    patternName: string;
    picUrl?: string;
    remark?: string;
  }
}

export function getDataJustPatternPage(params: PageParam) {
  return requestClient.get<PageResult<FdmdataDataJustPatternApi.Pattern>>(
    '/fdmdata/data-just-pattern/page',
    { params },
  );
}

export function getDataJustPattern(id: number) {
  return requestClient.get<FdmdataDataJustPatternApi.Pattern>(
    `/fdmdata/data-just-pattern/get?id=${id}`,
  );
}

export function deleteDataJustPatternList(ids: number[]) {
  return requestClient.delete(
    `/fdmdata/data-just-pattern/delete-list?ids=${ids.join(',')}`,
  );
}

export function exportDataJustPatternExcel(params: any) {
  return requestClient.download('/fdmdata/data-just-pattern/export-excel', {
    params,
  });
}

/** 图案编码生成（目标表 fdm_data_just_pattern） */
export function getPatternEncodeOptions() {
  return requestClient.get<PatternOptions>(
    '/fdmdata/data-just-pattern/encode/options',
  );
}

export function previewPatternEncode(data: PatternGenReq) {
  return requestClient.post<PatternPreviewResp>(
    '/fdmdata/data-just-pattern/encode/preview',
    data,
  );
}

export function importPatternEncode(data: PatternGenReq) {
  return requestClient.post<PatternImportResp>(
    '/fdmdata/data-just-pattern/encode/import',
    data,
  );
}

export function createDataJustPattern(data: FdmdataDataJustPatternApi.PatternSaveReq) {
  return requestClient.post<number>('/fdmdata/data-just-pattern/create', data);
}

export function updateDataJustPattern(data: FdmdataDataJustPatternApi.PatternSaveReq) {
  return requestClient.put('/fdmdata/data-just-pattern/update', data);
}

export function deleteDataJustPattern(id: number) {
  return requestClient.delete(`/fdmdata/data-just-pattern/delete?id=${id}`);
}

export function syncDataJustPatternToJushuitan(id: number) {
  return requestClient.post<FdmdataDataJustPatternApi.JstSyncResp>(
    `/fdmdata/data-just-pattern/sync-jushuitan?id=${id}`,
  );
}

export function generateDataJustPatternFromCost() {
  return requestClient.post<FdmdataDataJustPatternApi.GenerateResp>(
    '/fdmdata/data-just-pattern/generate-from-cost',
  );
}

export function previewGenerateDataJustPatternFromCost(limit = 200) {
  return requestClient.get<FdmdataDataJustPatternApi.GeneratePreviewResp>(
    '/fdmdata/data-just-pattern/generate-from-cost/preview',
    { params: { limit } },
  );
}

export function getDataJustPatternCostPage(params: PageParam) {
  return requestClient.get<PageResult<FdmdataDataJustPatternApi.PatternCost>>(
    '/fdmdata/data-just-pattern-cost/page',
    { params },
  );
}

export function createDataJustPatternCost(
  data: FdmdataDataJustPatternApi.PatternCostCreateReq,
) {
  return requestClient.post<number>('/fdmdata/data-just-pattern-cost/create', data);
}

export function deleteDataJustPatternCost(id: number) {
  return requestClient.delete(`/fdmdata/data-just-pattern-cost/delete?id=${id}`);
}

