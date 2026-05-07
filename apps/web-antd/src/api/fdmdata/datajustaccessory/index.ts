import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataDataJustAccessoryApi {
  /** fdm-data 配件商品（fdm_data_just_accessory） */
  export interface Accessory {
    id: number;
    picUrl?: string;
    productShortName?: string;
    styleCode: string;
    itemCode: string;
    productName: string;
    colorSpec?: string;
    categoryName?: string;
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
    accessoryKind?: string;
    matchType?: 'SPEC_EXACT' | 'SPEC_SET' | 'UNIVERSAL' | 'WIDTH_EXACT' | 'WIDTH_MAX' | string;
    matchSpecLwKey?: string;
    matchSpecFullKey?: string;
    matchWidthCm?: number;
    matchWidthMaxCm?: number;
    matchBundleCount?: number;
    matchRuleJson?: string;
    matchRemark?: string;
    creator?: string;
    creatorName?: string;
    createTime?: string;
  }
}

export function getDataJustAccessoryPage(
  params: PageParam & {
    styleCode?: string;
    itemCode?: string;
    productName?: string;
    categoryName?: string;
    status?: number;
    accessoryKind?: string;
    matchType?: string;
    createTime?: string[];
  },
) {
  return requestClient.get<PageResult<FdmdataDataJustAccessoryApi.Accessory>>(
    '/fdmdata/data-just-accessory/page',
    { params },
  );
}

export function getDataJustAccessory(id: number) {
  return requestClient.get<FdmdataDataJustAccessoryApi.Accessory>(
    `/fdmdata/data-just-accessory/get?id=${id}`,
  );
}

export function createDataJustAccessory(data: Partial<FdmdataDataJustAccessoryApi.Accessory>) {
  return requestClient.post<number>('/fdmdata/data-just-accessory/create', data);
}

export function updateDataJustAccessory(data: Partial<FdmdataDataJustAccessoryApi.Accessory>) {
  return requestClient.put<boolean>('/fdmdata/data-just-accessory/update', data);
}

export function deleteDataJustAccessory(id: number) {
  return requestClient.delete<boolean>(`/fdmdata/data-just-accessory/delete?id=${id}`);
}

export function deleteDataJustAccessoryList(ids: number[]) {
  return requestClient.delete<boolean>(
    `/fdmdata/data-just-accessory/delete-list?ids=${ids.join(',')}`,
  );
}

export interface AccessoryImportResp {
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

export function importAccessorySkuExcel(file: File) {
  return requestClient.upload<AccessoryImportResp>('/fdmdata/data-just-accessory/import-excel', {
    file,
  });
}

export function exportDataJustAccessoryExcel(params: Record<string, unknown>) {
  return requestClient.download('/fdmdata/data-just-accessory/export-excel', { params });
}
