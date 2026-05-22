import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataEcShopDailyBrushApi {
  export interface EcShopDailyBrush {
    id?: number;
    statDate?: string;
    platformCode?: string;
    shopId?: string;
    shopName?: string;
    brushOrderCount?: number;
    brushPrincipal?: number;
    brushCommission?: number;
    brushTotalCost?: number;
    remark?: string;
    createTime?: string;
  }
}

export function getEcShopDailyBrushPage(params: PageParam) {
  return requestClient.get<PageResult<FdmdataEcShopDailyBrushApi.EcShopDailyBrush>>(
    '/fdmdata/ec-shop-daily-brush/page',
    { params },
  );
}

export function getEcShopDailyBrush(id: number) {
  return requestClient.get<FdmdataEcShopDailyBrushApi.EcShopDailyBrush>(
    `/fdmdata/ec-shop-daily-brush/get?id=${id}`,
  );
}

export function createEcShopDailyBrush(
  data: FdmdataEcShopDailyBrushApi.EcShopDailyBrush,
) {
  return requestClient.post('/fdmdata/ec-shop-daily-brush/create', data);
}

export function updateEcShopDailyBrush(
  data: FdmdataEcShopDailyBrushApi.EcShopDailyBrush,
) {
  return requestClient.put('/fdmdata/ec-shop-daily-brush/update', data);
}

export function deleteEcShopDailyBrush(id: number) {
  return requestClient.delete(`/fdmdata/ec-shop-daily-brush/delete?id=${id}`);
}
