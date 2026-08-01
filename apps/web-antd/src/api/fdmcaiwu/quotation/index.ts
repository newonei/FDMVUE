import { requestClient } from '#/api/request';

export namespace FdmcaiwuQuotationApi {
  export type DecimalValue = number | string;
  export type NullableDecimalValue = DecimalValue | null;

  export interface LabelValueOption {
    label: string;
    value: string;
  }

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
    costDefaults?: CostDefaults;
    mouldProfiles: MouldProfileOption[];
    profitModes: LabelValueOption[];
    recipes: RecipeOption[];
  }

  export interface CalculateReq {
    includeStrap: boolean;
    includeSupplement: boolean;
    mouldProfileId?: number;
    productLengthMm: DecimalValue;
    productThicknessMm: DecimalValue;
    productWidthMm: DecimalValue;
    profitMode: string;
    /** 小数形式，例如 20% 传 0.20 */
    profitRate: number;
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
    auxiliaryCost?: DecimalValue;
    blockReasons: string[];
    boardLengthMm?: DecimalValue;
    boardThicknessMm?: DecimalValue;
    boardWidthMm?: DecimalValue;
    calculationProfile?: string;
    calculationSteps: CalculationStep[];
    candidateMoulds: MouldCandidate[];
    chargeWeightKg?: DecimalValue;
    chargeWeightSource?: string;
    densityType?: string;
    effectiveWidthMm?: DecimalValue;
    fullLayers?: number;
    includeStrap?: boolean;
    includeSupplement?: boolean;
    ingredientCosts: IngredientCost[];
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
    profitMode?: string;
    profitRate?: DecimalValue;
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
    totalQuoteDisplay?: DecimalValue;
    totalQuoteExact?: DecimalValue;
    unitCostDisplay?: DecimalValue;
    unitCostExact?: DecimalValue;
    unitQuoteDisplay?: DecimalValue;
    unitQuoteExact?: DecimalValue;
    volumeUtilizationRate?: DecimalValue;
    thicknessClass?: 'NORMAL' | 'THICK' | string;
    warnings: string[];
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
