import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataShopCompanyApi {
  export interface ShopCompany {
    id?: number;
    platformCode?: string;
    platformName?: string;
    shopName?: string;
    shopAlias?: string;
    companyId?: number;
    companyCode?: string;
    companyName?: string;
    companyShortName?: string;
    taxNo?: string;
    defaultTaxRate?: number;
    enabled?: number;
    remark?: string;
    createTime?: string;
    updateTime?: string;
  }
}

export function getShopCompanyPage(params: PageParam) {
  return requestClient.get<PageResult<FdmdataShopCompanyApi.ShopCompany>>(
    '/fdmdata/shop-company/page',
    { params },
  );
}

export function getShopCompany(id: number) {
  return requestClient.get<FdmdataShopCompanyApi.ShopCompany>(
    `/fdmdata/shop-company/get?id=${id}`,
  );
}

export function createShopCompany(
  data: FdmdataShopCompanyApi.ShopCompany,
) {
  return requestClient.post<number>('/fdmdata/shop-company/create', data);
}

export function updateShopCompany(
  data: FdmdataShopCompanyApi.ShopCompany,
) {
  return requestClient.put<boolean>('/fdmdata/shop-company/update', data);
}

export function deleteShopCompany(id: number) {
  return requestClient.delete<boolean>(
    `/fdmdata/shop-company/delete?id=${id}`,
  );
}
