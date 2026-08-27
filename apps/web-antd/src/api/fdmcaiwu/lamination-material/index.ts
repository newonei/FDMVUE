import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmcaiwuLaminationMaterialApi {
  export type DecimalValue = number | string;

  export interface MaterialVersionFields {
    adhesiveUnitPricePerSquareMeter: DecimalValue;
    /** 含税热熔胶单价；由不含税价格按 taxRate 派生，只读。 */
    adhesiveUnitPriceTaxIncludedPerSquareMeter?: DecimalValue;
    allowRotation: boolean;
    billingIncrementMm: DecimalValue;
    effectiveEndTime?: null | string;
    effectiveStartTime?: null | string;
    headTrimMm: DecimalValue;
    horizontalGapMm: DecimalValue;
    leftTrimMm: DecimalValue;
    laminationLaborCostPerPiece: DecimalValue;
    /** 含税贴合加工费；由不含税价格按 taxRate 派生，只读。 */
    laminationLaborCostTaxIncludedPerPiece?: DecimalValue;
    materialThicknessMm: DecimalValue;
    minimumPurchaseLengthMm: DecimalValue;
    rightTrimMm: DecimalValue;
    rollWidthMm: DecimalValue;
    sourceLocation?: null | string;
    sourceVersion?: null | string;
    tailTrimMm: DecimalValue;
    /** 当前价格版本税率，小数形式；现行固定为 0.08。 */
    taxRate?: DecimalValue;
    unitPricePerLinearMeter: DecimalValue;
    /** 含税延米价；由不含税价格按 taxRate 派生，只读。 */
    unitPriceTaxIncludedPerLinearMeter?: DecimalValue;
    verticalGapMm: DecimalValue;
    versionCode?: null | string;
    versionId?: number | string;
  }

  export interface Material extends MaterialVersionFields {
    category?: null | string;
    createTime?: string;
    enabled: boolean;
    id: number | string;
    materialCode: string;
    materialName: string;
    remark?: null | string;
    updateTime?: string;
  }

  export interface EnabledOption {
    id: number | string;
    materialCode: string;
    materialName: string;
    materialThicknessMm: DecimalValue;
    rollWidthMm: DecimalValue;
  }

  export interface PageReq extends PageParam {
    category?: string;
    enabled?: boolean;
    keyword?: string;
  }

  export interface SaveReq extends Omit<
    MaterialVersionFields,
    | 'effectiveEndTime'
    | 'effectiveStartTime'
    | 'sourceLocation'
    | 'sourceVersion'
    | 'taxRate'
    | 'unitPriceTaxIncludedPerLinearMeter'
    | 'adhesiveUnitPriceTaxIncludedPerSquareMeter'
    | 'laminationLaborCostTaxIncludedPerPiece'
    | 'versionCode'
    | 'versionId'
  > {
    category?: string;
    enabled: boolean;
    id?: number | string;
    materialCode: string;
    materialName: string;
    remark?: string;
    effectiveStartTime?: string;
    sourceLocation?: string;
    sourceVersion?: string;
    versionCode?: string;
  }
}

const BASE_URL = '/fdmcaiwu/lamination-material';

export function getLaminationMaterialPage(
  params: FdmcaiwuLaminationMaterialApi.PageReq,
) {
  return requestClient.get<PageResult<FdmcaiwuLaminationMaterialApi.Material>>(
    `${BASE_URL}/page`,
    { params },
  );
}

export function getLaminationMaterial(id: number | string) {
  return requestClient.get<FdmcaiwuLaminationMaterialApi.Material>(
    `${BASE_URL}/get`,
    { params: { id } },
  );
}

/** 报价选项使用的安全列表不包含采购延米价。 */
export function getEnabledLaminationMaterials() {
  return requestClient.get<FdmcaiwuLaminationMaterialApi.EnabledOption[]>(
    `${BASE_URL}/list-enabled`,
  );
}

export function createLaminationMaterial(
  data: FdmcaiwuLaminationMaterialApi.SaveReq,
) {
  return requestClient.post<number | string>(`${BASE_URL}/create`, data);
}

export function updateLaminationMaterial(
  data: FdmcaiwuLaminationMaterialApi.SaveReq,
) {
  return requestClient.put<boolean>(`${BASE_URL}/update`, data);
}

export function deleteLaminationMaterial(id: number | string) {
  return requestClient.delete<boolean>(`${BASE_URL}/delete`, {
    params: { id },
  });
}
