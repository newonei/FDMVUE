import type { Dayjs } from 'dayjs';

import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataEcShopDailyBrushApi {
  /** 店铺刷单明细 */
  export interface EcShopDailyBrush {
    id?: number; // 主键ID
    statDate?: Dayjs | string; // 刷单日期
    platformCode?: string; // 平台编码
    shopId?: string; // 店铺ID
    shopName?: string; // 店铺名称
    brushOrderCount?: number; // 刷单单量
    brushPrincipal?: number; // 刷单本金（买家实付）
    brushCommission?: number; // 刷单佣金
    brushTotalCost?: number; // 刷单总成本（本金+佣金+其他）
    remark?: string; // 备注
    createTime?: string;
  }
}

/** 查询店铺刷单明细分页 */
export function getEcShopDailyBrushPage(params: PageParam) {
  return requestClient.get<
    PageResult<FdmdataEcShopDailyBrushApi.EcShopDailyBrush>
  >('/fdmdata/ec-shop-daily-brush/page', { params });
}

/** 查询店铺刷单明细详情 */
export function getEcShopDailyBrush(id: number) {
  return requestClient.get<FdmdataEcShopDailyBrushApi.EcShopDailyBrush>(
    `/fdmdata/ec-shop-daily-brush/get?id=${id}`,
  );
}

/** 新增店铺刷单明细 */
export function createEcShopDailyBrush(
  data: FdmdataEcShopDailyBrushApi.EcShopDailyBrush,
) {
  return requestClient.post('/fdmdata/ec-shop-daily-brush/create', data);
}

/** 修改店铺刷单明细 */
export function updateEcShopDailyBrush(
  data: FdmdataEcShopDailyBrushApi.EcShopDailyBrush,
) {
  return requestClient.put('/fdmdata/ec-shop-daily-brush/update', data);
}

/** 删除店铺刷单明细 */
export function deleteEcShopDailyBrush(id: number) {
  return requestClient.delete(`/fdmdata/ec-shop-daily-brush/delete?id=${id}`);
}
