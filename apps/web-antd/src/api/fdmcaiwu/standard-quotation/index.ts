import { requestClient } from '#/api/request';

export namespace FdmcaiwuStandardQuotationApi {
  export type DecimalValue = number | string;
  export type NullableDecimalValue = DecimalValue | null;
  export type CellStatus = 'BLOCKED' | 'CALCULATED' | 'NOT_CONFIGURED';

  export interface ProductTypeOption {
    /** 兼容服务端以 code / label 命名的选项。 */
    code?: string;
    composite?: boolean;
    configuredCount?: number;
    label?: string;
    productCode?: string;
    productLabel?: string;
    recipeCode?: string;
  }

  export interface Defaults {
    includeCarton?: boolean;
    includeOpp?: boolean;
    includeStrap?: boolean;
    includeSupplement?: boolean;
    quantity?: number;
  }

  export interface SourceInfo {
    calculationProfile?: string;
    sourceLocation?: string;
    sourceVersion?: string;
  }

  export interface Capabilities {
    /** 仅超级管理员可向常规规格报价表新增规格。 */
    canCreateSpecification?: boolean;
    /** 仅超级管理员可查看规格报价的成本、配方和模具等明细。 */
    canViewQuoteDetail?: boolean;
    /** 有权查看超低价的部门经理和超级管理员为 true。 */
    canViewUltraLowPrice?: boolean;
  }

  export interface Options {
    capabilities?: Capabilities;
    defaults?: Defaults;
    productTypes?: ProductTypeOption[];
    source?: SourceInfo;
    specCount?: number;
  }

  export interface CalculateReq {
    includeCarton: boolean;
    includeOpp: boolean;
    includeStrap: boolean;
    includeSupplement: boolean;
    quantity: number;
  }

  export interface CreateSpecificationReq {
    lengthMm: number;
    thicknessMm: number;
    widthMm: number;
  }

  export interface QuotationEntry {
    additionalCostPerPiece?: NullableDecimalValue;
    adhesiveCostPerPiece?: NullableDecimalValue;
    accessoryPriceId?: number | string;
    accessoryPriceSourceLocation?: null | string;
    accessoryPriceSourceVersion?: null | string;
    auxiliaryCost?: NullableDecimalValue;
    baseUnitCostDisplay?: NullableDecimalValue;
    baseUnitCostExact?: NullableDecimalValue;
    blockReasons?: string[];
    calculationProfile?: null | string;
    cartonCostPerPiece?: NullableDecimalValue;
    catalogSourceLocation?: null | string;
    catalogSourceVersion?: null | string;
    engineMaterialKgPerPiece?: NullableDecimalValue;
    nominalWeightText?: null | string;
    oppCostPerPiece?: NullableDecimalValue;
    productCode: string;
    productLabel?: string;
    processCostRuleVersion?: null | string;
    recipeId?: number | string;
    recipeCode?: null | string;
    recipeName?: null | string;
    recipeSourceVersion?: null | string;
    mouldSourceVersion?: null | string;
    selectedMouldId?: number | string;
    selectedMouldCode?: null | string;
    selectedMouldName?: null | string;
    status: CellStatus | string;
    strapCostPerPiece?: NullableDecimalValue;
    substrateThicknessMm?: NullableDecimalValue;
    surfaceCostPerPiece?: NullableDecimalValue;
    unitCostDisplay?: NullableDecimalValue;
    unitCostExact?: NullableDecimalValue;
    unitQuoteDisplay?: NullableDecimalValue;
    unitQuoteExact?: NullableDecimalValue;
    /** 仅有超低价查看能力的账号返回。 */
    ultraLowQuoteDisplay?: NullableDecimalValue;
    /** 仅超级管理员返回，普通部门经理不可见。 */
    ultraLowQuoteExact?: NullableDecimalValue;
    warnings?: string[];
  }

  export interface SpecificationRow {
    entries: QuotationEntry[];
    lengthMm: DecimalValue;
    thicknessMm: DecimalValue;
    widthMm: DecimalValue;
  }

  export interface Summary {
    blockedCount?: number;
    calculatedCount?: number;
    cellCount?: number;
    notConfiguredCount?: number;
    specCount?: number;
  }

  export interface CalculateResp {
    capabilities?: Capabilities;
    calculatedAt?: string;
    productTypes?: ProductTypeOption[];
    rows?: SpecificationRow[];
    /** 兼容早期接口草案的字段名。 */
    specs?: SpecificationRow[];
    source?: SourceInfo;
    summary?: Summary;
  }
}

/** 获取产品类型、默认计算参数与数据来源说明。 */
export function getStandardQuotationOptions() {
  return requestClient.get<FdmcaiwuStandardQuotationApi.Options>(
    '/fdmcaiwu/standard-quotation/options',
  );
}

/** 通过现有报价引擎一次性计算常规规格矩阵。 */
export function calculateStandardQuotation(
  data: FdmcaiwuStandardQuotationApi.CalculateReq,
) {
  return requestClient.post<FdmcaiwuStandardQuotationApi.CalculateResp>(
    '/fdmcaiwu/standard-quotation/calculate',
    data,
    { timeout: 300_000 },
  );
}

/** 新增常规规格；服务端仅允许超级管理员调用。 */
export function createStandardQuotationSpecification(
  data: FdmcaiwuStandardQuotationApi.CreateSpecificationReq,
) {
  return requestClient.post<number | string>(
    '/fdmcaiwu/standard-quotation/specifications',
    data,
  );
}
