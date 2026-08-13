import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmcaiwuAccessoryPriceApi {
  export type DecimalValue = number | string;

  export interface AccessoryPrice {
    cartonCostPerPiece?: DecimalValue | null;
    createTime?: string;
    enabled: boolean;
    id: number;
    lengthMm: DecimalValue;
    oppCostPerPiece?: DecimalValue | null;
    remark?: string;
    sourceLocation?: string;
    sourceVersion?: string;
    strapCostPerPiece?: DecimalValue | null;
    thicknessMm: DecimalValue;
    updateTime?: string;
    widthMm: DecimalValue;
  }

  export interface PageReq extends PageParam {
    enabled?: boolean;
    keyword?: string;
    lengthMm?: DecimalValue;
    thicknessMm?: DecimalValue;
    widthMm?: DecimalValue;
  }

  export type SaveReq = Omit<
    AccessoryPrice,
    'createTime' | 'id' | 'sourceVersion' | 'updateTime'
  > & { id?: number };
}

export function getAccessoryPricePage(
  params: FdmcaiwuAccessoryPriceApi.PageReq,
) {
  return requestClient.get<
    PageResult<FdmcaiwuAccessoryPriceApi.AccessoryPrice>
  >('/fdmcaiwu/accessory-price/page', { params });
}

export function getAccessoryPrice(id: number) {
  return requestClient.get<FdmcaiwuAccessoryPriceApi.AccessoryPrice>(
    '/fdmcaiwu/accessory-price/get',
    { params: { id } },
  );
}

export function createAccessoryPrice(data: FdmcaiwuAccessoryPriceApi.SaveReq) {
  return requestClient.post<number>('/fdmcaiwu/accessory-price/create', data);
}

export function updateAccessoryPrice(data: FdmcaiwuAccessoryPriceApi.SaveReq) {
  return requestClient.put<boolean>('/fdmcaiwu/accessory-price/update', data);
}

export function deleteAccessoryPrice(id: number) {
  return requestClient.delete<boolean>('/fdmcaiwu/accessory-price/delete', {
    params: { id },
  });
}
