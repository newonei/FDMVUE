import { requestClient } from '#/api/request';

export namespace FdmcaiwuQuotationApi {
  export type DecimalValue = number | string;
  export type NullableDecimalValue = DecimalValue | null;

  export interface RecipeOption {
    batchCostYuan?: NullableDecimalValue;
    batchWeightKg?: NullableDecimalValue;
    costBlockReasons?: string[];
    costStatus?: string;
    densityType: string;
    id: number;
    materialYieldRate?: NullableDecimalValue;
    processRouteCode?: string;
    productType: string;
    recipeCode: string;
    recipeName: string;
    rawUnitCostPerKg?: NullableDecimalValue;
    sourceLocation?: string;
    sourceVersion?: string;
    unitCostPerKg?: NullableDecimalValue;
  }

  /** 报价选项中的安全材料信息，不包含采购延米价。 */
  export interface LaminationMaterialOption {
    id: number | string;
    materialCode: string;
    materialName: string;
    materialThicknessMm?: NullableDecimalValue;
    rollWidthMm?: NullableDecimalValue;
  }

  export interface Capabilities {
    canCustomizeProfitRate?: boolean;
    canViewQuoteDetail?: boolean;
    canViewUltraLowPrice?: boolean;
  }

  export type AccessoryType = 'CARTON' | 'OPP' | 'STRAP' | string;
  export type AccessoryMatchMode = 'EXACT' | 'NEAREST_NOT_SMALLER' | string;

  /**
   * 报价实际采用的辅料规格。成本和来源字段会按账号明细权限脱敏，
   * 但请求规格、匹配规格和匹配方式可供报价人员核对。
   */
  export interface AccessoryMatch {
    accessoryName?: string;
    accessoryPriceId?: number | string;
    accessoryType: AccessoryType;
    costPerPiece?: NullableDecimalValue;
    matchMode: AccessoryMatchMode;
    matchedLengthMm?: NullableDecimalValue;
    matchedThicknessMm?: NullableDecimalValue;
    matchedWidthMm?: NullableDecimalValue;
    requestedLengthMm?: NullableDecimalValue;
    requestedThicknessMm?: NullableDecimalValue;
    requestedWidthMm?: NullableDecimalValue;
    sourceLocation?: string;
    sourceVersion?: string;
  }

  export interface LaminationQuote {
    actualLayoutLengthMm?: NullableDecimalValue;
    adhesiveCostPerPiece?: NullableDecimalValue;
    adhesiveOrderCost?: NullableDecimalValue;
    adhesiveUnitPricePerSquareMeter?: NullableDecimalValue;
    allowRotation?: boolean;
    billableLengthMm?: NullableDecimalValue;
    dynamicCostIncludedInUnitCost?: boolean;
    horizontalGapMm?: NullableDecimalValue;
    laminationLaborCostPerPiece?: NullableDecimalValue;
    layoutAlgorithmVersion?: string;
    layoutAreaSquareMeters?: NullableDecimalValue;
    layoutUtilizationRate?: NullableDecimalValue;
    materialCode?: string;
    materialCostPerPiece?: NullableDecimalValue;
    materialId?: number | string;
    materialName?: string;
    materialOrderCost?: NullableDecimalValue;
    materialThicknessMm?: NullableDecimalValue;
    materialVersionId?: number | string;
    piecesPerRotatedRow?: number;
    piecesPerStandardRow?: number;
    productNetAreaSquareMeters?: NullableDecimalValue;
    requiredPurchaseLengthMm?: NullableDecimalValue;
    rollWidthMm?: NullableDecimalValue;
    rotatedRows?: number;
    standardRows?: number;
    totalRows?: number;
    tpeThicknessMm?: NullableDecimalValue;
    versionCode?: string;
    verticalGapMm?: NullableDecimalValue;
  }

  export interface MouldProfileOption {
    blockedReason?: string;
    boardLengthMm?: NullableDecimalValue;
    boardThicknessMm?: NullableDecimalValue;
    boardWidthMm?: NullableDecimalValue;
    elasticChargeWeightKg?: NullableDecimalValue;
    id: number;
    lightChargeWeightKg?: NullableDecimalValue;
    mouldLengthMm?: NullableDecimalValue;
    mouldThicknessMm?: NullableDecimalValue;
    mouldWidthMm?: NullableDecimalValue;
    profileCode: string;
    profileName: string;
    regularChargeWeightKg?: NullableDecimalValue;
    sourceLocation?: string;
    sourceVersion?: string;
    superElasticChargeWeightKg?: NullableDecimalValue;
  }

  export interface CostInputs {
    allocationCostPerKg?: DecimalValue;
    batchShippingOperationCostPerPiece?: DecimalValue;
    cartonCostPerPiece?: DecimalValue;
    compositeCostPerPiece?: DecimalValue;
    embossCostPerPiece?: DecimalValue;
    foamingLaborPerKg?: DecimalValue;
    materialYieldRate?: DecimalValue;
    oppCostPerPiece?: DecimalValue;
    packingLaborPerPiece?: DecimalValue;
    punchCostPerPiece?: DecimalValue;
    slicingLaborPerKg?: DecimalValue;
    strapCostPerPiece?: DecimalValue;
    verticalCutCostPerPiece?: DecimalValue;
  }

  export interface CostDefaults extends CostInputs {
    includeCarton?: boolean;
    includeOpp?: boolean;
    includeStrap?: boolean;
    includeSupplement?: boolean;
    recipeCode?: string;
    recipeId?: number;
    processCostRuleCode?: string;
    processCostRuleEffectiveEndDate?: string;
    processCostRuleEffectiveStartDate?: string;
    processCostRuleId?: number;
    processCostRuleVersion?: string;
    processRouteCode?: string;
    sourceLocation?: string;
    sourceVersion?: string;
  }

  export interface Options {
    capabilities?: Capabilities;
    costDefaults?: CostDefaults;
    laminationMaterials?: LaminationMaterialOption[];
    mouldProfiles: MouldProfileOption[];
    recipes: RecipeOption[];
  }

  export interface CalculateReq {
    /**
     * 自定义利润率百分数，例如字符串 "12.50" 表示 12.50%。
     * 仅具有单笔报价自定义利润率权限的账号可传；为空时由服务端按规格政策决定。
     */
    customProfitRatePercent?: DecimalValue;
    includeCarton: boolean;
    includeOpp: boolean;
    includeStrap: boolean;
    includeSupplement: boolean;
    /** 为空表示纯 TPE；有值时产品厚度仍传成品总厚度。 */
    laminationMaterialId?: number | string;
    mouldProfileId?: number;
    productLengthMm: DecimalValue;
    productThicknessMm: DecimalValue;
    productWidthMm: DecimalValue;
    quantity: number;
    recipeId: number;
  }

  export interface CalculationStep {
    code: string;
    formula?: string;
    label: string;
    unit?: string;
    value?: DecimalValue;
  }

  export interface IngredientCost {
    category?: null | string;
    code?: null | string;
    id: number;
    lineCost?: NullableDecimalValue;
    name?: null | string;
    unitPricePerKg?: NullableDecimalValue;
    usageWeightKg?: NullableDecimalValue;
  }

  export interface MouldCandidate {
    boardLengthMm?: NullableDecimalValue;
    boardThicknessMm?: NullableDecimalValue;
    boardWidthMm?: NullableDecimalValue;
    chargeWeightKg?: NullableDecimalValue;
    chargeWeightSource?: string;
    feasible: boolean;
    fullLayers?: number;
    layoutColumns?: number;
    layoutOrientation?: string;
    layoutRows?: number;
    materialKgPerPiece?: NullableDecimalValue;
    mouldLengthMm?: NullableDecimalValue;
    mouldProfileId: number;
    mouldThicknessMm?: NullableDecimalValue;
    mouldWidthMm?: NullableDecimalValue;
    piecesPerLayer?: number;
    profileCode: string;
    profileName: string;
    rejectReasons: string[];
    remainingThicknessMm?: NullableDecimalValue;
    selected: boolean;
    sourceLocation?: string;
    sourceVersion?: string;
    supplementPieces?: number;
    totalPiecesPerBoard?: number;
    unitCostDisplay?: NullableDecimalValue;
    unitCostExact?: NullableDecimalValue;
    volumeUtilizationRate?: NullableDecimalValue;
  }

  export interface CalculateResp extends CostInputs {
    accessoryMatches?: AccessoryMatch[];
    accessoryPriceId?: number | string;
    accessoryPriceSourceLocation?: string;
    accessoryPriceSourceVersion?: string;
    auxiliaryCost?: DecimalValue;
    blockReasons: string[];
    boardLengthMm?: DecimalValue;
    boardThicknessMm?: DecimalValue;
    boardWidthMm?: DecimalValue;
    calculationProfile?: string;
    capabilities?: Capabilities;
    calculationSteps: CalculationStep[];
    candidateMoulds: MouldCandidate[];
    chargeWeightKg?: DecimalValue;
    chargeWeightSource?: string;
    customProfitRateApplied?: boolean;
    defaultProfitRatePercent?: NullableDecimalValue;
    densityType?: string;
    effectiveWidthMm?: DecimalValue;
    fullLayers?: number;
    includeCarton?: boolean;
    includeOpp?: boolean;
    includeStrap?: boolean;
    includeSupplement?: boolean;
    ingredientCosts: IngredientCost[];
    lamination?: LaminationQuote | null;
    layoutAlgorithmVersion?: string;
    layoutColumns?: number;
    layoutOrientation?: string;
    layoutRows?: number;
    materialCost?: DecimalValue;
    materialKgPerPiece?: DecimalValue;
    materialUnitCostPerKg?: DecimalValue;
    materialUnitCostSource?: string;
    mouldLengthMm?: DecimalValue;
    mouldProfileCode?: string;
    mouldProfileId?: number;
    mouldProfileName?: string;
    mouldSourceLocation?: string;
    mouldSourceVersion?: string;
    mouldThicknessMm?: DecimalValue;
    mouldWidthMm?: DecimalValue;
    packingOperationCostPerPiece?: DecimalValue;
    piecesPerLayer?: number;
    postprocessCost?: DecimalValue;
    preprocessCost?: DecimalValue;
    pricingPolicyVersionNumber?: number;
    appliedProfitRatePercent?: NullableDecimalValue;
    productLengthMm?: DecimalValue;
    productThicknessMm?: DecimalValue;
    productType?: string;
    productWidthMm?: DecimalValue;
    processCostRuleCode?: string;
    processCostRuleId?: number;
    processCostRuleVersion?: string;
    processCostRuleEffectiveEndDate?: string;
    processCostRuleEffectiveStartDate?: string;
    processRouteCode?: string;
    quantity?: number;
    rawMaterialUnitCostPerKg?: DecimalValue;
    recipeBatchCostYuan?: DecimalValue;
    recipeBatchWeightKg?: DecimalValue;
    recipeCode?: string;
    recipeId?: number;
    recipeName?: string;
    recipeSourceLocation?: string;
    recipeSourceVersion?: string;
    remainingThicknessMm?: DecimalValue;
    status?: string;
    sizeClass?: 'LARGE' | 'SMALL' | string;
    supplementAlgorithmVersion?: string;
    supplementPieces?: number;
    totalPiecesPerBoard?: number;
    taxRate?: NullableDecimalValue;
    regularTotalQuoteDisplay?: NullableDecimalValue;
    regularTotalQuoteTaxIncludedDisplay?: NullableDecimalValue;
    regularUnitQuoteDisplay?: NullableDecimalValue;
    regularUnitQuoteTaxIncludedDisplay?: NullableDecimalValue;
    totalQuoteDisplay?: DecimalValue;
    totalQuoteTaxIncludedDisplay?: NullableDecimalValue;
    totalQuoteTaxIncludedExact?: NullableDecimalValue;
    ultraLowTotalQuoteDisplay?: NullableDecimalValue;
    ultraLowTotalQuoteTaxIncludedDisplay?: NullableDecimalValue;
    ultraLowUnitQuoteDisplay?: NullableDecimalValue;
    ultraLowUnitQuoteTaxIncludedDisplay?: NullableDecimalValue;
    totalQuoteExact?: DecimalValue;
    unitCostDisplay?: DecimalValue;
    unitCostExact?: DecimalValue;
    unitQuoteDisplay?: DecimalValue;
    unitQuoteExact?: DecimalValue;
    unitQuoteTaxIncludedDisplay?: NullableDecimalValue;
    unitQuoteTaxIncludedExact?: NullableDecimalValue;
    volumeUtilizationRate?: DecimalValue;
    thicknessClass?: 'NORMAL' | 'THICK' | string;
    warnings: string[];
  }

  export interface AiAnalysisObservation {
    code?: string;
    detail?: string;
    severity?: 'INFO' | 'WARNING' | string;
    title?: string;
  }

  export interface AiAnalysisResult {
    confidence?: NullableDecimalValue;
    observations?: AiAnalysisObservation[];
    riskLevel?: 'HIGH' | 'LOW' | 'MEDIUM' | string;
    suggestions?: string[];
    summary?: string;
  }

  export interface AiAnalysisStartReq {
    quotation: CalculateReq;
    requestId: string;
  }

  export interface AiAnalysisStartResp {
    available: boolean;
    invocationId?: string;
    message?: string;
    status?: string;
  }

  export interface AiAnalysisStatusResp extends AiAnalysisStartResp {
    progress?: number;
    result?: AiAnalysisResult;
    terminal?: boolean;
  }
}

export function getQuotationOptions() {
  return requestClient.get<FdmcaiwuQuotationApi.Options>(
    '/fdmcaiwu/quotation/options',
  );
}

export function calculateQuotation(data: FdmcaiwuQuotationApi.CalculateReq) {
  return requestClient.post<FdmcaiwuQuotationApi.CalculateResp>(
    '/fdmcaiwu/quotation/calculate',
    data,
  );
}

/** 按需发起 AI 报价分析；AI 不参与确定性成本和报价计算。 */
export function createQuotationAiAnalysis(
  data: FdmcaiwuQuotationApi.AiAnalysisStartReq,
) {
  return requestClient.post<FdmcaiwuQuotationApi.AiAnalysisStartResp>(
    '/fdmcaiwu/quotation/ai-analysis',
    data,
  );
}

/** 查询 AI 报价分析进度和结构化结果。 */
export function getQuotationAiAnalysis(invocationId: string) {
  return requestClient.get<FdmcaiwuQuotationApi.AiAnalysisStatusResp>(
    `/fdmcaiwu/quotation/ai-analysis/${encodeURIComponent(invocationId)}`,
  );
}
