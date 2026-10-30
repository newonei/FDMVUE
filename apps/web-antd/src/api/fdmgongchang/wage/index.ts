import type { PageParam, PageResult } from '@vben/request';

import { factoryHeaders } from '#/api/fdmgongchang/factory';
import { requestClient } from '#/api/request';

export namespace FdmgongchangWageApi {
  export type Decimal = number | string;
  export type Category = 'ALLOWANCE' | 'MISC' | 'PROCESS' | 'TIME';
  export type RecordStatus = 'CONFIRMED' | 'PENDING' | 'SETTLED';
  export type Shift = 'DAY' | 'NIGHT';
  /** 后端 LocalDate 可能是 "2026-10-08" 或 [2026, 10, 8]。 */
  export type DateValue = null | number[] | string;

  export interface Item {
    baseItemId?: null | number;
    baseItemName?: null | string;
    category: Category;
    coefficient?: Decimal | null;
    currentEffectiveFrom?: DateValue;
    /** 今天生效的单价；系数项目为基准价 × 系数。 */
    currentPrice?: Decimal | null;
    id: number;
    lengthMinMm?: null | number;
    name: string;
    prices?: Array<{ effectiveFrom: DateValue; id: number; price: Decimal }>;
    process?: null | string;
    productType?: null | string;
    remark?: null | string;
    role?: null | string;
    sort?: null | number;
    status: number;
    thicknessMaxMm?: Decimal | null;
    thicknessMinMm?: Decimal | null;
    unit: string;
    widthMm?: null | number;
  }

  export interface ItemSaveReq {
    baseItemId?: null | number;
    category: Category;
    coefficient?: Decimal | null;
    effectiveFrom?: string;
    id?: number;
    lengthMinMm?: null | number;
    name: string;
    price?: Decimal | null;
    process?: null | string;
    productType?: null | string;
    remark?: null | string;
    role?: null | string;
    sort?: null | number;
    thicknessMaxMm?: Decimal | null;
    thicknessMinMm?: Decimal | null;
    unit: string;
    widthMm?: null | number;
  }

  export interface Match {
    itemId: number;
    /** 宽、长、厚条件全部满足；带产品类型的项目不自动命中。 */
    matched: boolean;
    name: string;
    price?: Decimal | null;
    productType?: null | string;
    role?: null | string;
    score: number;
    unit: string;
  }

  export interface Piecework {
    itemId: number;
    quantity: Decimal;
    userId: number;
  }

  export interface WorkRecord {
    amount: Decimal;
    category: Category;
    confirmedAt?: null | number | string;
    confirmedBy?: null | string;
    hours?: Decimal | null;
    id: number;
    itemId: number;
    itemName: string;
    operatorName?: null | string;
    orderId?: null | number;
    orderNo?: null | string;
    process?: null | string;
    quantity?: Decimal | null;
    remark?: null | string;
    reportSeq?: null | number;
    shift: Shift;
    source: 'MANUAL' | 'ORDER';
    status: RecordStatus;
    team?: null | string;
    unit?: null | string;
    unitPrice: Decimal;
    userId: number;
    userName?: null | string;
    workDate: DateValue;
  }

  export interface WorkRecordPageReq extends PageParam {
    category?: Category;
    keyword?: string;
    month?: string;
    source?: string;
    status?: RecordStatus;
    team?: string;
    userId?: number;
  }

  export interface WorkRecordCreateReq {
    itemId: number;
    lines: Array<{ hours?: Decimal; quantity?: Decimal; userId: number }>;
    remark?: string;
    shift?: Shift;
    workDate: string;
  }

  export interface Person {
    allowanceAmount: Decimal;
    hours: Decimal;
    miscAmount: Decimal;
    pendingCount: number;
    processAmount: Decimal;
    recordCount: number;
    team?: null | string;
    timeAmount: Decimal;
    totalAmount: Decimal;
    userId: number;
    userName?: null | string;
  }

  export interface Summary {
    month: string;
    pendingCount: number;
    people: Person[];
    recordCount: number;
    settled: boolean;
    settledAt?: null | number | string;
    settledBy?: null | string;
    totalAmount: Decimal;
  }
}

const headers = () => ({ headers: factoryHeaders() });

// ========== 计价项目（工厂设置） ==========

export function getWageItems() {
  return requestClient.get<FdmgongchangWageApi.Item[]>(
    '/fdmgongchang/wage-item/list',
    headers(),
  );
}

export function createWageItem(data: FdmgongchangWageApi.ItemSaveReq) {
  return requestClient.post<number>(
    '/fdmgongchang/wage-item/create',
    data,
    headers(),
  );
}

export function updateWageItem(data: FdmgongchangWageApi.ItemSaveReq) {
  return requestClient.put<boolean>(
    '/fdmgongchang/wage-item/update',
    data,
    headers(),
  );
}

export function saveWagePrice(data: {
  effectiveFrom: string;
  itemId: number;
  price: FdmgongchangWageApi.Decimal;
}) {
  return requestClient.post<boolean>(
    '/fdmgongchang/wage-item/price',
    data,
    headers(),
  );
}

export function updateWageItemStatus(data: { id: number; status: number }) {
  return requestClient.put<boolean>(
    '/fdmgongchang/wage-item/status',
    data,
    headers(),
  );
}

/** 按工序和产出规格（cm）推荐工序计件项目，命中的在前。 */
export function matchWageItems(params: {
  length?: FdmgongchangWageApi.Decimal | null;
  process: string;
  thickness?: FdmgongchangWageApi.Decimal | null;
  width?: FdmgongchangWageApi.Decimal | null;
}) {
  return requestClient.get<FdmgongchangWageApi.Match[]>(
    '/fdmgongchang/wage-item/match',
    { ...headers(), params },
  );
}

// ========== 报工 ==========

/** 登记报工可选的计价项目（启用的，带今天的单价）。 */
export function getWorkRecordItems() {
  return requestClient.get<FdmgongchangWageApi.Item[]>(
    '/fdmgongchang/work-record/items',
    headers(),
  );
}

export function getWorkRecordPage(
  params: FdmgongchangWageApi.WorkRecordPageReq,
) {
  return requestClient.get<PageResult<FdmgongchangWageApi.WorkRecord>>(
    '/fdmgongchang/work-record/page',
    { ...headers(), params },
  );
}

export function createWorkRecords(
  data: FdmgongchangWageApi.WorkRecordCreateReq,
) {
  return requestClient.post<number>(
    '/fdmgongchang/work-record/create',
    data,
    headers(),
  );
}

export function updateWorkRecord(data: {
  hours?: FdmgongchangWageApi.Decimal;
  id: number;
  quantity?: FdmgongchangWageApi.Decimal;
  remark?: string;
}) {
  return requestClient.put<boolean>(
    '/fdmgongchang/work-record/update',
    data,
    headers(),
  );
}

export function deleteWorkRecords(ids: number[]) {
  return requestClient.post<boolean>(
    '/fdmgongchang/work-record/delete',
    { ids },
    headers(),
  );
}

export function confirmWorkRecords(ids: number[]) {
  return requestClient.post<number>(
    '/fdmgongchang/work-record/confirm',
    { ids },
    headers(),
  );
}

export function unconfirmWorkRecords(ids: number[]) {
  return requestClient.post<number>(
    '/fdmgongchang/work-record/unconfirm',
    { ids },
    headers(),
  );
}

// ========== 月度汇总 ==========

export function getWageSummary(month: string) {
  return requestClient.get<FdmgongchangWageApi.Summary>(
    '/fdmgongchang/wage/summary',
    { ...headers(), params: { month } },
  );
}

export function exportWageSummary(month: string) {
  return requestClient.download('/fdmgongchang/wage/export-summary', {
    ...headers(),
    params: { month },
  });
}

export function exportWageDetail(month: string) {
  return requestClient.download('/fdmgongchang/wage/export-detail', {
    ...headers(),
    params: { month },
  });
}

export function settleWageMonth(month: string) {
  return requestClient.post<boolean>(
    '/fdmgongchang/wage/settle',
    { month },
    headers(),
  );
}

export function reopenWageMonth(month: string) {
  return requestClient.post<boolean>(
    '/fdmgongchang/wage/reopen',
    { month },
    headers(),
  );
}
