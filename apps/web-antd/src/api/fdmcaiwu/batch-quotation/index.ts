import type { FdmcaiwuQuotationApi } from '#/api/fdmcaiwu/quotation';

import { requestClient } from '#/api/request';

export namespace FdmcaiwuBatchQuotationApi {
  export type DecimalValue = FdmcaiwuQuotationApi.DecimalValue;

  export interface CalculateOptions {
    defaultQuantity?: number;
    defaultRecipeId?: number;
    includeCarton?: boolean;
    includeOpp?: boolean;
    includeStrap?: boolean;
    includeSupplement?: boolean;
    profitMode?: string;
    /** 小数形式，例如 20% 传 0.20。批量成本比较默认传 0。 */
    profitRate?: number;
  }

  /**
   * 批量结果字段与单条报价保持同一命名口径。失败行也会返回，方便用户
   * 在页面和导出的 Excel 中定位原始数据问题。
   */
  export interface ResultRow {
    allocationCostPerKg?: DecimalValue;
    auxiliarySubtotalPerPiece?: DecimalValue;
    batchTotalCost?: DecimalValue;
    batchShippingOperationCostPerPiece?: DecimalValue;
    boardSpecification?: string;
    businessNo?: string;
    blockReasons?: string[];
    cartonCostPerPiece?: DecimalValue;
    chargeWeightKg?: DecimalValue;
    candidateCount?: number;
    compositeCostPerPiece?: DecimalValue;
    costDifference?: DecimalValue;
    costDifferenceRate?: DecimalValue;
    currentCost?: DecimalValue;
    currentQuote?: DecimalValue;
    effectiveWidthMm?: DecimalValue;
    embossCostPerPiece?: DecimalValue;
    failureReason?: string;
    foamingLaborPerKg?: DecimalValue;
    fullLayers?: number;
    inputRecipe?: string;
    layoutColumns?: number;
    layoutOrientation?: string;
    layoutRows?: number;
    materialCost?: DecimalValue;
    materialUnitCostPerKg?: DecimalValue;
    materialYieldRate?: DecimalValue;
    mouldProfileCode?: string;
    mouldProfileId?: number;
    mouldProfileName?: string;
    oppCostPerPiece?: DecimalValue;
    originalSpecification?: string;
    packingLaborPerPiece?: DecimalValue;
    packingOperationSubtotalPerPiece?: DecimalValue;
    piecesPerLayer?: number;
    postprocessSubtotalPerPiece?: DecimalValue;
    preprocessCostPerPiece?: DecimalValue;
    preprocessSubtotalPerKg?: DecimalValue;
    processRouteCode?: string;
    processCostRuleCode?: string;
    processCostRuleId?: number;
    processCostRuleVersion?: string;
    processCostRuleEffectiveEndDate?: string;
    processCostRuleEffectiveStartDate?: string;
    punchCostPerPiece?: DecimalValue;
    quantity?: number;
    recipeCode?: string;
    recipeId?: number;
    recipeName?: string;
    remarks?: string;
    rowNumber?: number;
    slicingLaborPerKg?: DecimalValue;
    sizeClass?: string;
    specification?: string;
    status?: string;
    strapCostPerPiece?: DecimalValue;
    supplementPieces?: number;
    totalPiecesPerBoard?: number;
    thicknessClass?: string;
    unitCostPerPiece?: DecimalValue;
    unitQuote?: DecimalValue;
    quoteTotal?: DecimalValue;
    verticalCutCostPerPiece?: DecimalValue;
    warnings?: string[];
    /** 兼容服务端扩展列，页面只读取已约定的字段。 */
    [key: string]: unknown;
  }

  export interface CalculateResult {
    batchNo?: string;
    batchStatus?: string;
    calculatedAt?: string;
    calculationBatchId: number | string;
    failedCount: number;
    rows: ResultRow[];
    successCount: number;
    totalCount: number;
  }
}

function createMultipartData(
  file: File,
  options: FdmcaiwuBatchQuotationApi.CalculateOptions,
) {
  return {
    file,
    options: new Blob([JSON.stringify(options)], {
      type: 'application/json',
    }),
  };
}

/** 下载规格导入模板。 */
export function downloadBatchQuotationTemplate() {
  return requestClient.download('/fdmcaiwu/batch-quotation/template');
}

/** 导入规格并批量计算最低成本可行模具。 */
export function calculateBatchQuotation(
  file: File,
  options: FdmcaiwuBatchQuotationApi.CalculateOptions,
) {
  return requestClient.upload<FdmcaiwuBatchQuotationApi.CalculateResult>(
    '/fdmcaiwu/batch-quotation/calculate',
    createMultipartData(file, options),
    { timeout: 300_000 },
  );
}

/** 重新读取已冻结的预览结果，可用于报价记录详情页。 */
export function getBatchQuotation(calculationBatchId: number | string) {
  return requestClient.get<FdmcaiwuBatchQuotationApi.CalculateResult>(
    '/fdmcaiwu/batch-quotation/get',
    { params: { calculationBatchId } },
  );
}

/** 根据已冻结的计算批次导出，保证 Excel 与页面预览一致。 */
export function exportBatchQuotation(calculationBatchId: number | string) {
  return requestClient.download('/fdmcaiwu/batch-quotation/export', {
    params: { calculationBatchId },
    timeout: 300_000,
  });
}
