import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmcaiwuRawMaterialApi {
  export type DecimalValue = number | string;

  export interface RawMaterial {
    category: string;
    createTime?: string;
    enabled: boolean;
    id: number;
    materialCode: string;
    materialName: string;
    sourceLocation?: string;
    sourceVersion?: string;
    unitPricePerKg: DecimalValue | null;
    updateTime?: string;
  }

  export interface PageReq extends PageParam {
    category?: string;
    enabled?: boolean;
    keyword?: string;
  }

  export interface UpdateReq {
    enabled: boolean;
    id: number;
    unitPricePerKg: DecimalValue;
  }
}

export function getRawMaterialPage(params: FdmcaiwuRawMaterialApi.PageReq) {
  return requestClient.get<PageResult<FdmcaiwuRawMaterialApi.RawMaterial>>(
    '/fdmcaiwu/raw-material/page',
    { params },
  );
}

export function updateRawMaterial(data: FdmcaiwuRawMaterialApi.UpdateReq) {
  return requestClient.put<boolean>('/fdmcaiwu/raw-material/update', data);
}
