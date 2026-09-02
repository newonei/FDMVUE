import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmjustShopApi {
  /** 聚水潭店铺 */
  export interface Shop {
    id: number;
    shopId: number;
    shopName: string;
    enabled: number;
    coId?: number;
    shopSite?: string;
    shopUrl?: string;
    created?: string;
    jstCreator?: string;
    nick?: string;
    nickType?: string;
    sessionExpired?: string;
    sessionUid?: string;
    shortName?: string;
    platformShopName?: string;
    groupId?: number;
    groupName?: string;
    sessionStatus: number;
    lastSyncTime?: string;
    remark?: string;
    createTime?: string;
    updateTime?: string;
  }

  /** 店铺分页查询参数 */
  export interface ShopPageParams extends PageParam {
    shopName?: string;
    shopId?: number | string;
    coId?: number | string;
    shopSite?: string;
    enabled?: number;
    sessionStatus?: number;
    groupName?: string;
  }

  /** 店铺可维护字段 */
  export interface ShopUpdateParams {
    id: number;
    enabled: number;
    remark?: string;
  }

  /** 从聚水潭同步店铺的结果摘要 */
  export interface ShopSyncResult {
    totalCount: number;
    createdCount: number;
    updatedCount: number;
    unchangedCount: number;
  }
}

/** 查询聚水潭店铺分页 */
export function getShopPage(params: FdmjustShopApi.ShopPageParams) {
  return requestClient.get<PageResult<FdmjustShopApi.Shop>>(
    '/fdmjust/shop/page',
    { params },
  );
}

/** 修改店铺启用状态和备注 */
export function updateShop(data: FdmjustShopApi.ShopUpdateParams) {
  return requestClient.put<boolean>('/fdmjust/shop/update', data);
}

/** 从聚水潭同步全部店铺 */
export function syncShop() {
  return requestClient.post<FdmjustShopApi.ShopSyncResult>(
    '/fdmjust/shop/sync',
  );
}
