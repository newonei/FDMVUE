import { requestClient } from '#/api/request';

import type { FdmcaiwuQuotationApi } from '#/api/fdmcaiwu/quotation';

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
    /** 仅超级管理员可维护小垫判定及裁切参数。 */
    canManageSmallMatPolicy?: boolean;
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
    accessoryMatches?: FdmcaiwuQuotationApi.AccessoryMatch[];
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
    lamination?: null | FdmcaiwuQuotationApi.LaminationQuote;
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
    taxRate?: NullableDecimalValue;
    unitCostDisplay?: NullableDecimalValue;
    unitCostExact?: NullableDecimalValue;
    unitQuoteDisplay?: NullableDecimalValue;
    unitQuoteExact?: NullableDecimalValue;
    unitQuoteTaxIncludedDisplay?: NullableDecimalValue;
    unitQuoteTaxIncludedExact?: NullableDecimalValue;
    /** 仅有超低价查看能力的账号返回。 */
    ultraLowQuoteDisplay?: NullableDecimalValue;
    /** 仅超级管理员返回，普通部门经理不可见。 */
    ultraLowQuoteExact?: NullableDecimalValue;
    ultraLowQuoteTaxIncludedDisplay?: NullableDecimalValue;
    ultraLowQuoteTaxIncludedExact?: NullableDecimalValue;
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

  /** 小垫面积阈值、政策开关与裁切参数；具体定价比例仅在服务端内部。 */
  export interface SmallMatPolicyResp {
    allowRotate?: boolean;
    configured?: boolean;
    cuttingCostPerPiece?: NullableDecimalValue;
    edgeTrimMm?: NullableDecimalValue;
    enabled?: boolean;
    id?: number | string;
    kerfMm?: NullableDecimalValue;
    maxAreaSquareMeters?: NullableDecimalValue;
    orderSetupCost?: NullableDecimalValue;
    pricingEnabled?: boolean;
    repackingCostPerPiece?: NullableDecimalValue;
    version?: string;
  }

  /** 只维护面积、功能开关和裁切参数，不提交任何定价比例。 */
  export interface SaveSmallMatPolicyReq {
    allowRotate: boolean;
    cuttingCostPerPiece: number;
    edgeTrimMm: number;
    enabled: boolean;
    kerfMm: number;
    maxAreaSquareMeters: number;
    orderSetupCost: number;
    pricingEnabled: boolean;
    repackingCostPerPiece: number;
  }

  /** 小垫成品拆分测算请求，所有规格均按 mm 分列提交。 */
  export interface SmallMatCalculateReq {
    includeCarton: boolean;
    includeOpp: boolean;
    includeStrap: boolean;
    includeSupplement: boolean;
    lengthMm: number;
    productCode: string;
    quantity: number;
    thicknessMm: number;
    widthMm: number;
  }

  /**
   * 母垫候选与排版结果。该对象仅包含尺寸、数量和利用率，不包含成本数据。
   */
  export interface SmallMatCutCandidate {
    layoutLengthCount?: number;
    layoutWidthCount?: number;
    motherCount?: number;
    motherLengthMm?: DecimalValue;
    motherThicknessMm?: DecimalValue;
    motherWidthMm?: DecimalValue;
    orderUtilization?: NullableDecimalValue;
    piecesPerMother?: number;
    recommended?: boolean;
    rotated?: boolean;
  }

  /** 当前服务端推荐的母垫方案，候选列表同样不含成本。 */
  export interface SmallMatCutPlan extends SmallMatCutCandidate {
    candidatePlans?: SmallMatCutCandidate[];
  }

  /**
   * 规格报价明细仅由真实超级管理员的接口响应返回。
   * 普通员工和部门经理均不会收到本对象，也不应基于它渲染任何内容。
   */
  export interface SmallMatQuoteDetail {
    accessoryCostExact?: NullableDecimalValue;
    cuttingCostExact?: NullableDecimalValue;
    finalUnitCostExact?: NullableDecimalValue;
    motherTotalCostExact?: NullableDecimalValue;
    motherUnitCostExact?: NullableDecimalValue;
    orderSetupCostExact?: NullableDecimalValue;
    policyVersion?: string;
    regularTotalQuoteExact?: NullableDecimalValue;
    regularTotalQuoteTaxIncludedExact?: NullableDecimalValue;
    regularUnitQuoteExact?: NullableDecimalValue;
    regularUnitQuoteTaxIncludedExact?: NullableDecimalValue;
    repackingCostExact?: NullableDecimalValue;
    sourceCostMode?: string;
    sourceEngineProfile?: string;
    ultraLowTotalQuoteExact?: NullableDecimalValue;
    ultraLowTotalQuoteTaxIncludedExact?: NullableDecimalValue;
    ultraLowUnitQuoteExact?: NullableDecimalValue;
    ultraLowUnitQuoteTaxIncludedExact?: NullableDecimalValue;
  }

  export interface SmallMatCalculateResp {
    accessoryMatches?: FdmcaiwuQuotationApi.AccessoryMatch[];
    blockReasons?: string[];
    capabilities?: Capabilities;
    detail?: null | SmallMatQuoteDetail;
    /** 后端正式字段：当前成品是否命中有效的小垫判定规则。 */
    smallMat?: boolean;
    lengthMm?: DecimalValue;
    plan?: SmallMatCutPlan;
    productCode?: string;
    productLabel?: string;
    quantity?: number;
    status?: string;
    taxRate?: NullableDecimalValue;
    thicknessMm?: DecimalValue;
    totalQuoteDisplay?: NullableDecimalValue;
    totalQuoteTaxIncludedDisplay?: NullableDecimalValue;
    ultraLowQuoteDisplay?: NullableDecimalValue;
    ultraLowQuoteTaxIncludedDisplay?: NullableDecimalValue;
    unitQuoteDisplay?: NullableDecimalValue;
    unitQuoteTaxIncludedDisplay?: NullableDecimalValue;
    warnings?: string[];
    widthMm?: DecimalValue;
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

/** 获取当前小垫判定和裁切参数；服务端仅允许超级管理员访问。 */
export function getSmallMatPolicy() {
  return requestClient.get<FdmcaiwuStandardQuotationApi.SmallMatPolicyResp>(
    '/fdmcaiwu/standard-quotation/small-mat-policy/current',
  );
}

/** 保存小垫判定和裁切参数。 */
export function saveSmallMatPolicy(
  data: FdmcaiwuStandardQuotationApi.SaveSmallMatPolicyReq,
) {
  return requestClient.post<FdmcaiwuStandardQuotationApi.SmallMatPolicyResp>(
    '/fdmcaiwu/standard-quotation/small-mat-policy/save',
    data,
  );
}

/** 使用现有报价引擎完成小垫拆分测算。 */
export function calculateSmallMat(
  data: FdmcaiwuStandardQuotationApi.SmallMatCalculateReq,
) {
  return requestClient.post<FdmcaiwuStandardQuotationApi.SmallMatCalculateResp>(
    '/fdmcaiwu/standard-quotation/small-mat/calculate',
    data,
    { timeout: 300_000 },
  );
}
