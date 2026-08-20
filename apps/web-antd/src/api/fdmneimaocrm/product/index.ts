import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmNeimaoCrmProductApi {
  /** 产品信息 */
  export interface Product {
    id: number;
    name: string;
    no: string;
    unit: number;
    price: number;
    status: number;
    categoryId: number;
    categoryName?: string;
    description: string;
    ownerUserId: number;
  }
}

/** 查询产品列表 */
export function getProductPage(params: PageParam) {
  return requestClient.get<PageResult<FdmNeimaoCrmProductApi.Product>>(
    '/fdmneimaocrm/product/page',
    { params },
  );
}

/** 获得产品精简列表 */
export function getProductSimpleList() {
  return requestClient.get<FdmNeimaoCrmProductApi.Product[]>(
    '/fdmneimaocrm/product/simple-list',
  );
}

/** 查询产品详情 */
export function getProduct(id: number) {
  return requestClient.get<FdmNeimaoCrmProductApi.Product>(
    `/fdmneimaocrm/product/get?id=${id}`,
  );
}

/** 新增产品 */
export function createProduct(data: FdmNeimaoCrmProductApi.Product) {
  return requestClient.post('/fdmneimaocrm/product/create', data);
}

/** 修改产品 */
export function updateProduct(data: FdmNeimaoCrmProductApi.Product) {
  return requestClient.put('/fdmneimaocrm/product/update', data);
}

/** 删除产品 */
export function deleteProduct(id: number) {
  return requestClient.delete(`/fdmneimaocrm/product/delete?id=${id}`);
}

/** 导出产品 */
export function exportProduct(params: any) {
  return requestClient.download('/fdmneimaocrm/product/export-excel', {
    params,
  });
}
