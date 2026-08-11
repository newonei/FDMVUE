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
    includeStrap?: boolean;
    includeSupplement?: boolean;
    profitMode?: string;
    /** 小数形式，例如 20% 返回 0.20。 */
    profitRate?: DecimalValue;
    quantity?: number;
  }

  export interface SourceInfo {
    calculationProfile?: string;
    sourceLocation?: string;
    sourceVersion?: string;
  }

  export interface Options {
    defaults?: Defaults;
    productTypes?: ProductTypeOption[];
    source?: SourceInfo;
    specCount?: number;
  }

  export interface CalculateReq {
    includeStrap: boolean;
    includeSupplement: boolean;
    profitMode: string;
    /** 小数形式，例如 20% 传 0.20。 */
    profitRate: number;
    quantity: number;
  }

  export interface QuotationEntry {
    additionalCostPerPiece?: NullableDecimalValue;
    adhesiveCostPerPiece?: NullableDecimalValue;
    baseUnitCostDisplay?: NullableDecimalValue;
    baseUnitCostExact?: NullableDecimalValue;
    blockReasons?: string[];
    calculationProfile?: null | string;
    catalogSourceLocation?: null | string;
    catalogSourceVersion?: null | string;
    engineMaterialKgPerPiece?: NullableDecimalValue;
    nominalWeightText?: null | string;
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
    substrateThicknessMm?: NullableDecimalValue;
    surfaceCostPerPiece?: NullableDecimalValue;
    unitCostDisplay?: NullableDecimalValue;
    unitCostExact?: NullableDecimalValue;
    unitQuoteDisplay?: NullableDecimalValue;
    unitQuoteExact?: NullableDecimalValue;
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
