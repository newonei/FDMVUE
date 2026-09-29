import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmcaiwuEcProfitApi {
  export type Decimal = number | string | null;
  export type ReportStatus = 'READY' | 'WAITING_IMPORT';

  export interface Metric {
    salesAmount?: Decimal;
    newProductGiftAmount?: Decimal;
    customerRefundAmount?: Decimal;
    purchaseCost?: Decimal;
    ownPurchaseCost?: Decimal;
    accessoryPurchaseCost?: Decimal;
    dropshipPurchaseCost?: Decimal;
    estimatedFreight?: Decimal;
    freightAdjustment?: Decimal;
    freightCost?: Decimal;
    promotionCost?: Decimal;
    platformFee?: Decimal;
    taxFee?: Decimal;
    grossProfit?: Decimal;
    grossMargin?: Decimal;
    promotionRate?: Decimal;
    platformFeeRate?: Decimal;
    purchaseCostRate?: Decimal;
    freightRate?: Decimal;
  }

  export interface ShopOption {
    shopId: string;
    shopName: string;
    platformCode?: string;
  }

  export interface Item extends Metric, ShopOption {
    id: number;
    lineType: 'ADJUSTMENT' | 'SHOP';
    remark?: string;
    departmentName?: string;
    groupName?: string;
    groupId?: number;
    departmentCode?: string;
    assignmentId?: number;
    sourceSheetName?: string;
    sourceRowNumber?: number;
    companyName?: string;
    dataStatus: 'IMPORTED' | 'PENDING';
    sourceBatchId?: number;
    /** 聚水潭「6001 账单费用」；平台扣费 = 账单费用 + 调整 */
    platformFeeBill?: Decimal;
    platformFeeAdjustment?: Decimal;
    platformFeeAdjustmentReason?: string;
    /** 网页手工改过的字段，逗号分隔 */
    manualFields?: string;
  }

  /** Excel 中取到的五项金额 */
  export interface ImportValues {
    salesAmount?: Decimal;
    purchaseCost?: Decimal;
    freightCost?: Decimal;
    promotionCost?: Decimal;
    platformFeeBill?: Decimal;
  }
  export interface ImportRow {
    rowNumber: number;
    shopId: string;
    shopName: string;
    directoryShopName?: string;
    action: 'NEW' | 'UNCHANGED' | 'UPDATE';
    imported: ImportValues;
    current?: ImportValues;
    keptManualFields: string[];
    grossProfitAfter?: Decimal;
  }
  export interface ImportPreview {
    month: string;
    fileName: string;
    fileSha256: string;
    sheetName?: string;
    conditions: Record<string, string>;
    shipDateFrom?: string;
    shipDateTo?: string;
    reportId?: number;
    reportVersion?: number;
    rows: ImportRow[];
    keptItems: { itemId: number; lineType: string; shopName: string }[];
    newCount: number;
    updateCount: number;
    unchangedCount: number;
    warnings: string[];
    errors: string[];
    previewToken: string;
  }
  export interface ImportResult {
    reportId: number;
    batchId: number;
    created: number;
    updated: number;
    unchanged: number;
  }
  /** 新增（无 id，按 month）或修改（有 id）一行明细 */
  export interface ItemSave {
    id?: number;
    month?: string;
    reportVersion?: number;
    lineType?: 'ADJUSTMENT' | 'SHOP';
    shopId?: string;
    shopName?: string;
    salesAmount?: Decimal;
    newProductGiftAmount?: Decimal;
    customerRefundAmount?: Decimal;
    purchaseCost?: Decimal;
    accessoryPurchaseCost?: Decimal;
    dropshipPurchaseCost?: Decimal;
    estimatedFreight?: Decimal;
    freightAdjustment?: Decimal;
    freightCost?: Decimal;
    promotionCost?: Decimal;
    platformFeeBill?: Decimal;
    platformFeeAdjustment?: Decimal;
    platformFeeAdjustmentReason?: string;
    taxFee?: Decimal;
    remark?: string;
  }

  export interface Report {
    id: number;
    reportNo: string;
    month: string;
    status: ReportStatus;
    version: number;
    currency: 'CNY';
    remark?: string;
    shopCount: number;
    importedShopCount: number;
    createTime?: string;
    updateTime?: string;
    summary: Metric;
    items?: Item[];
    scopeConfigVersion?: number;
    scopeConfirmedAt?: string;
    scopeConfirmedBy?: string;
  }

  export interface PageReq extends PageParam {
    year?: number;
    month?: string;
    status?: ReportStatus;
  }

  export interface CreateReq {
    month: string;
    expectedConfigVersion: number;
    remark?: string;
  }

  export interface UpdateReq {
    id: number;
    expectedVersion: number;
    remark?: string;
  }

  export interface ConfigurationHistory {
    id: number;
    action: string;
    creator: string;
    createTime: string;
    result: Record<string, unknown>;
  }

  /** 分组 → 店铺/费用；分组来自电商分组配置，未配置的店铺与费用行归入 UNCONFIGURED */
  export interface GroupNode {
    key: string;
    nodeType: 'ADJUSTMENT' | 'GROUP' | 'SHOP' | 'TOTAL';
    name: string;
    groupId?: number;
    groupName?: string;
    sortOrder?: number;
    item?: Item;
    children: GroupNode[];
    expectedShopCount: number;
    importedShopCount: number;
    adjustmentCount: number;
    pendingAdjustmentCount: number;
    /** 归入「未配置」分组的明细条数 */
    unassignedCount: number;
    missingShopIds: string[];
    missingMetricCounts: Record<string, number>;
    dataState: 'COMPLETE' | 'EMPTY' | 'PARTIAL' | 'WAITING_IMPORT';
    summary: Metric;
    receivedSummary: Metric;
  }
  export interface MonthlyView {
    month: string;
    report: Report | null;
    groups: GroupNode[];
    total: GroupNode;
  }
  export interface YearGroup {
    key: string;
    name: string;
    groupId?: number;
    months: {
      month: string;
      reportId?: number;
      reportStatus: 'NOT_CREATED' | 'READY' | 'WAITING_IMPORT';
      node?: GroupNode;
    }[];
    includedMonths: string[];
    summary: Metric;
  }
  export interface YearGroups {
    year: number;
    months: string[];
    groups: YearGroup[];
  }
  export interface Group {
    id: number;
    code: string;
    name: string;
    departmentCode: string;
    departmentName: string;
    sort: number;
    enabled: boolean;
    version: number;
  }
  export type GroupCreate = Omit<Group, 'id' | 'version'>;
  export interface GroupUpdate extends GroupCreate {
    id: number;
    expectedVersion: number;
  }
  export interface AssignmentShop extends ShopOption {
    enabled: boolean;
    configured: boolean;
    assignmentId?: number;
    assignmentVersion: number;
    effectiveMonth?: string;
    included?: boolean;
    groupId?: number;
    groupName?: string;
    departmentCode?: string;
    departmentName?: string;
    reason?: string;
  }
  export interface AssignmentList {
    effectiveMonth: string;
    configVersion: number;
    groups: Group[];
    shops: AssignmentShop[];
  }
  export interface AssignmentRequest {
    effectiveMonth: string;
    shopIds: string[];
    included: boolean;
    groupId?: number;
    departmentCode?: string;
    departmentName?: string;
    reason?: string;
  }
  export interface AssignmentPreview {
    effectiveMonth: string;
    configVersion: number;
    previewToken: string;
    changes: {
      shopId: string;
      shopName: string;
      before: AssignmentShop;
      after: AssignmentShop;
    }[];
    affectedReports: {
      id: number;
      month: string;
      status: ReportStatus;
      version: number;
      syncAllowed: boolean;
    }[];
    warnings: string[];
  }
  export interface AssignmentApply extends AssignmentRequest {
    expectedConfigVersion: number;
    expectedAssignments: {
      shopId: string;
      assignmentId?: number;
      version: number;
    }[];
    previewToken: string;
    idempotencyKey: string;
  }
  export interface ScopePreview {
    reportId: number;
    month: string;
    reportVersion: number;
    configVersion: number;
    groups: Group[];
    previewToken: string;
    expectedShopCount: number;
    unconfiguredShops: AssignmentShop[];
    canSync: boolean;
    changes: {
      kind: 'ADD' | 'REMOVE' | 'UPDATE';
      shopId: string;
      shopName: string;
      before?: Item;
      after?: AssignmentShop;
    }[];
    warnings: string[];
  }
  export interface ScopeApply {
    id: number;
    expectedVersion: number;
    expectedConfigVersion: number;
    previewToken: string;
    idempotencyKey: string;
  }
}

const baseUrl = '/fdmcaiwu/ec-profit';

export function getEcProfitPage(params: FdmcaiwuEcProfitApi.PageReq) {
  return requestClient.get<PageResult<FdmcaiwuEcProfitApi.Report>>(
    `${baseUrl}/page`,
    { params },
  );
}

export function getEcProfit(id: number) {
  return requestClient.get<FdmcaiwuEcProfitApi.Report>(`${baseUrl}/get`, {
    params: { id },
  });
}

export function getEcProfitYear(year: number) {
  return requestClient.get<FdmcaiwuEcProfitApi.Report[]>(`${baseUrl}/year`, {
    params: { year },
  });
}

export function getEcProfitShopOptions(keyword?: string) {
  return requestClient.get<FdmcaiwuEcProfitApi.ShopOption[]>(
    `${baseUrl}/shop-options`,
    { params: { keyword } },
  );
}

export function createEcProfit(data: FdmcaiwuEcProfitApi.CreateReq) {
  return requestClient.post<number>(`${baseUrl}/create`, data);
}

export function updateEcProfit(data: FdmcaiwuEcProfitApi.UpdateReq) {
  return requestClient.put<boolean>(`${baseUrl}/update`, data);
}

export function deleteEcProfit(id: number, expectedVersion: number) {
  return requestClient.delete<boolean>(`${baseUrl}/delete`, {
    params: { id, expectedVersion },
  });
}

export function getEcProfitMonthlyView(month: string) {
  return requestClient.get<FdmcaiwuEcProfitApi.MonthlyView>(
    `${baseUrl}/monthly-view`,
    { params: { month } },
  );
}
export function getEcProfitYearGroups(year: number) {
  return requestClient.get<FdmcaiwuEcProfitApi.YearGroups>(
    `${baseUrl}/year-groups`,
    { params: { year } },
  );
}
export function getFinanceGroups() {
  return requestClient.get<FdmcaiwuEcProfitApi.Group[]>(
    `${baseUrl}/finance-groups`,
  );
}
export function createFinanceGroup(data: FdmcaiwuEcProfitApi.GroupCreate) {
  return requestClient.post<number>(`${baseUrl}/finance-group/create`, data);
}
export function updateFinanceGroup(data: FdmcaiwuEcProfitApi.GroupUpdate) {
  return requestClient.put<boolean>(`${baseUrl}/finance-group/update`, data);
}
export function deleteFinanceGroup(id: number, expectedVersion: number) {
  return requestClient.delete<boolean>(`${baseUrl}/finance-group/delete`, {
    params: { id, expectedVersion },
  });
}
export function getShopAssignments(effectiveMonth: string) {
  return requestClient.get<FdmcaiwuEcProfitApi.AssignmentList>(
    `${baseUrl}/shop-assignments`,
    { params: { effectiveMonth } },
  );
}
export function previewShopAssignments(
  data: FdmcaiwuEcProfitApi.AssignmentRequest,
) {
  return requestClient.post<FdmcaiwuEcProfitApi.AssignmentPreview>(
    `${baseUrl}/shop-assignments/preview`,
    data,
  );
}
export function applyShopAssignments(
  data: FdmcaiwuEcProfitApi.AssignmentApply,
) {
  return requestClient.post<{ configVersion: number; changeCount: number }>(
    `${baseUrl}/shop-assignments/apply`,
    data,
  );
}
export function previewEcProfitScope(data: {
  id: number;
  expectedVersion: number;
}) {
  return requestClient.post<FdmcaiwuEcProfitApi.ScopePreview>(
    `${baseUrl}/scope-preview`,
    data,
  );
}
export function syncEcProfitScope(data: FdmcaiwuEcProfitApi.ScopeApply) {
  return requestClient.post<boolean>(`${baseUrl}/scope-sync`, data);
}

export function getEcProfitConfigurationHistory(limit = 50) {
  return requestClient.get<FdmcaiwuEcProfitApi.ConfigurationHistory[]>(
    `${baseUrl}/configuration-history`,
    { params: { limit } },
  );
}

/** 月度毛利 Excel：分层汇总（可折叠）+ 店铺明细 */
export function exportEcProfitMonthlyExcel(month: string) {
  return requestClient.download(`${baseUrl}/export-monthly-excel`, {
    params: { month },
  });
}

/** 年度 Excel：全年汇总 + 各指标小组逐月对比 */
export function exportEcProfitYearExcel(year: number) {
  return requestClient.download(`${baseUrl}/export-year-excel`, {
    params: { year },
  });
}

/** 预览聚水潭「经营利润明细表」导入，不写库 */
export function previewEcProfitImport(month: string, file: File) {
  return requestClient.upload<FdmcaiwuEcProfitApi.ImportPreview>(
    `${baseUrl}/import/preview`,
    { month, file },
  );
}

/** 确认导入，previewToken 须与预览一致 */
export function applyEcProfitImport(data: {
  file: File;
  idempotencyKey: string;
  month: string;
  overwriteManual: boolean;
  previewToken: string;
}) {
  return requestClient.upload<FdmcaiwuEcProfitApi.ImportResult>(
    `${baseUrl}/import/apply`,
    data,
  );
}

export function saveEcProfitItem(data: FdmcaiwuEcProfitApi.ItemSave) {
  return requestClient.post<number>(`${baseUrl}/item/save`, data);
}

export function deleteEcProfitItem(id: number, reportVersion: number) {
  return requestClient.delete<boolean>(`${baseUrl}/item/delete`, {
    params: { id, reportVersion },
  });
}

/** 把某一项在本月所有空白明细里统一填成同一个值，返回填写条数 */
export function fillBlankEcProfitItems(data: {
  field: string;
  reportId: number;
  reportVersion: number;
  value: number;
}) {
  return requestClient.post<number>(`${baseUrl}/item/fill-blank`, data);
}

/** 清空整月数据，confirmMonth 须与月报月份一致 */
export function purgeEcProfitReport(
  id: number,
  expectedVersion: number,
  confirmMonth: string,
) {
  return requestClient.delete<boolean>(`${baseUrl}/purge`, {
    params: { id, expectedVersion, confirmMonth },
  });
}
