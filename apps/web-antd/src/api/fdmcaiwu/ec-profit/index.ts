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

  export interface GroupNode {
    key: string;
    nodeType: 'ADJUSTMENT' | 'DEPARTMENT' | 'GROUP' | 'SHOP' | 'TOTAL';
    name: string;
    departmentCode?: string;
    departmentName?: string;
    groupId?: number;
    groupName?: string;
    legacyGroup: boolean;
    item?: Item;
    children: GroupNode[];
    expectedShopCount: number;
    importedShopCount: number;
    adjustmentCount: number;
    pendingAdjustmentCount: number;
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
    departments: GroupNode[];
    total: GroupNode;
  }
  export interface YearGroup {
    key: string;
    name: string;
    departmentCode?: string;
    departmentName?: string;
    groupId?: number;
    groupName?: string;
    legacyGroup: boolean;
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
