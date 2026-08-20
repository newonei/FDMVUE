import { requestClient } from '#/api/request';

export namespace FdmNeimaoCrmProductCategoryApi {
  /** 产品分类信息 */
  export interface ProductCategory {
    id: number;
    name: string;
    parentId: number;
  }
}

/** 查询产品分类详情 */
export function getProductCategory(id: number) {
  return requestClient.get<FdmNeimaoCrmProductCategoryApi.ProductCategory>(
    `/fdmneimaocrm/product-category/get?id=${id}`,
  );
}

/** 新增产品分类 */
export function createProductCategory(
  data: FdmNeimaoCrmProductCategoryApi.ProductCategory,
) {
  return requestClient.post('/fdmneimaocrm/product-category/create', data);
}

/** 修改产品分类 */
export function updateProductCategory(
  data: FdmNeimaoCrmProductCategoryApi.ProductCategory,
) {
  return requestClient.put('/fdmneimaocrm/product-category/update', data);
}

/** 删除产品分类 */
export function deleteProductCategory(id: number) {
  return requestClient.delete(`/fdmneimaocrm/product-category/delete?id=${id}`);
}

/** 产品分类列表 */
export function getProductCategoryList(params?: any) {
  return requestClient.get<FdmNeimaoCrmProductCategoryApi.ProductCategory[]>(
    '/fdmneimaocrm/product-category/list',
    { params },
  );
}
