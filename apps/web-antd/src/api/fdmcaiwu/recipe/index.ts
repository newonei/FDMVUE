import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmcaiwuRecipeApi {
  export type DecimalValue = number | string;
  export type NullableDecimalValue = DecimalValue | null;

  export interface Ingredient {
    category?: null | string;
    enabled?: boolean;
    id?: number;
    lineCostYuan?: NullableDecimalValue;
    materialCode?: null | string;
    materialName?: null | string;
    rawMaterialId: number;
    sort: number;
    unitPricePerKg?: NullableDecimalValue;
    usageWeightKg: DecimalValue;
  }

  export interface Recipe {
    batchCostYuan?: NullableDecimalValue;
    batchWeightKg?: NullableDecimalValue;
    blockedReasons?: string[];
    costAvailable: boolean;
    densityType: string;
    effectiveUnitCostPerKg?: NullableDecimalValue;
    enabled: boolean;
    id: number;
    ingredientCount: number;
    ingredients?: Ingredient[];
    /** 固定合格率，小数形式，例如 93% 为 0.93。 */
    materialYieldRate?: NullableDecimalValue;
    /** 报价时解析加工费用所使用的工艺路线。 */
    processRouteCode?: null | string;
    productType: string;
    rawUnitCostPerKg?: NullableDecimalValue;
    recipeCode: string;
    recipeName: string;
  }

  export interface PageReq extends PageParam {
    densityType?: string;
    enabled?: boolean;
    keyword?: string;
    productType?: string;
  }

  export interface SaveIngredientReq {
    rawMaterialId: number;
    sort: number;
    usageWeightKg: DecimalValue;
  }

  export interface SaveReq {
    densityType: string;
    enabled: boolean;
    id?: number;
    ingredients: SaveIngredientReq[];
    materialYieldRate: DecimalValue;
    processRouteCode: string;
    productType: string;
    recipeCode: string;
    recipeName: string;
  }
}

export function getRecipePage(params: FdmcaiwuRecipeApi.PageReq) {
  return requestClient.get<PageResult<FdmcaiwuRecipeApi.Recipe>>(
    '/fdmcaiwu/recipe/page',
    { params },
  );
}

export function getRecipe(id: number) {
  return requestClient.get<FdmcaiwuRecipeApi.Recipe>('/fdmcaiwu/recipe/get', {
    params: { id },
  });
}

export function createRecipe(data: FdmcaiwuRecipeApi.SaveReq) {
  return requestClient.post<number>('/fdmcaiwu/recipe/create', data);
}

export function updateRecipe(data: FdmcaiwuRecipeApi.SaveReq) {
  return requestClient.put<boolean>('/fdmcaiwu/recipe/update', data);
}

export function deleteRecipe(id: number) {
  return requestClient.delete<boolean>('/fdmcaiwu/recipe/delete', {
    params: { id },
  });
}
