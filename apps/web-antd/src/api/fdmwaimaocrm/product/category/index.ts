import { requestClient } from '#/api/request';

export namespace FdmWaimaoCrmProductCategoryApi {
  /** 产品分类信息 */
  export interface ProductCategory {
    id: number;
    name: string;
    parentId: number;
  }
}

/** 查询产品分类详情 */
export function getProductCategory(id: number) {
  return requestClient.get<FdmWaimaoCrmProductCategoryApi.ProductCategory>(
    `/fdmwaimaocrm/product-category/get?id=${id}`,
  );
}

/** 新增产品分类 */
export function createProductCategory(
  data: FdmWaimaoCrmProductCategoryApi.ProductCategory,
) {
  return requestClient.post('/fdmwaimaocrm/product-category/create', data);
}

/** 修改产品分类 */
export function updateProductCategory(
  data: FdmWaimaoCrmProductCategoryApi.ProductCategory,
) {
  return requestClient.put('/fdmwaimaocrm/product-category/update', data);
}

/** 删除产品分类 */
export function deleteProductCategory(id: number) {
  return requestClient.delete(`/fdmwaimaocrm/product-category/delete?id=${id}`);
}

/** 产品分类列表 */
export function getProductCategoryList(params?: any) {
  return requestClient.get<FdmWaimaoCrmProductCategoryApi.ProductCategory[]>(
    '/fdmwaimaocrm/product-category/list',
    { params },
  );
}
